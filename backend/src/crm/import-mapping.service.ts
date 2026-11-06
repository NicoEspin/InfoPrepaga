import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { CrmService } from './crm.service';
import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  MappingIdentityDto,
  MappingQueryDto,
  MappingUpdateDto,
} from './import-mapping.dto';
import { importKey } from './import-normalization';
import { IMPORT_SHEETS } from './lead-import.parser';
import { mappingSnapshot } from './import-mapping.store';

@Injectable()
export class ImportMappingService {
  constructor(
    private readonly db: PrismaService,
    private readonly crm: CrmService,
  ) {}
  async list(query: MappingQueryDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const where: Prisma.LeadImportMappingWhereInput = {
      ...(query.kind && { kind: query.kind }),
      ...(query.q && {
        OR: [
          { key: { contains: importKey(query.q) } },
          { scope: { contains: query.q.trim(), mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.leadImportMapping.findMany({
          where,
          include: {
            source: { select: { id: true, name: true, isActive: true } },
            assignedTo: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                isActive: true,
                deletedAt: true,
              },
            },
            confirmedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: [{ kind: 'asc' }, { scope: 'asc' }, { key: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.leadImportMapping.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async change(
    dto: MappingIdentityDto | MappingUpdateDto,
    actor: AuthenticatedUser,
    remove = false,
  ) {
    assertAdmin(actor);
    return this.crm.write(async (tx) => {
      const identity = { kind: dto.kind, scope: dto.scope, key: dto.key };
      const before = await tx.leadImportMapping.findUnique({
        where: { kind_scope_key: identity },
      });
      if (!before) throw new NotFoundException('Equivalencia no encontrada');
      if (before.updatedAt.getTime() !== Date.parse(dto.expectedUpdatedAt))
        throw new ConflictException(
          'La equivalencia cambió; actualizá la lista',
        );
      if (remove) {
        await tx.leadImportMapping.delete({
          where: { kind_scope_key: identity },
        });
        await tx.leadImportMappingEvent.create({
          data: {
            actorId: actor.id,
            action: 'DELETE',
            before: mappingSnapshot(before),
          },
        });
        return { ok: true };
      }
      const update = dto as MappingUpdateDto;
      const key =
        update.newKey === undefined ? before.key : importKey(update.newKey);
      if (
        !key ||
        (before.kind === 'ADVISOR' && (key === '*' || key.length > 160)) ||
        (before.kind === 'DEFAULT' && key !== '*') ||
        (before.kind === 'ADVISOR'
          ? before.scope !== '*'
          : !IMPORT_SHEETS.includes(before.scope))
      )
        throw new BadRequestException(
          'Clave o ámbito de equivalencia inválidos',
        );
      if (
        key !== before.key &&
        (await tx.leadImportMapping.findUnique({
          where: { kind_scope_key: { ...identity, key } },
        }))
      )
        throw new ConflictException(
          'Ese alias o grupo ya tiene una equivalencia; no se sobrescribió',
        );
      let sourceId = before.sourceId,
        assignedToId = before.assignedToId;
      if (before.kind === 'ORIGIN') {
        if (update.assignedToId !== undefined)
          throw new BadRequestException(
            'Una equivalencia de origen no admite responsables',
          );
        sourceId = update.sourceId ?? sourceId;
        if (
          !sourceId ||
          !(await tx.leadSource.findFirst({
            where: { id: sourceId, isActive: true },
          }))
        )
          throw new BadRequestException('Elegí un origen activo');
      } else {
        if (update.sourceId !== undefined)
          throw new BadRequestException(
            'Un alias de responsable no admite orígenes',
          );
        assignedToId =
          update.assignedToId === undefined
            ? assignedToId
            : update.assignedToId;
        if (
          assignedToId &&
          !(await tx.user.findFirst({
            where: {
              id: assignedToId,
              isActive: true,
              deletedAt: null,
              roles: {
                some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } },
              },
            },
          }))
        )
          throw new BadRequestException('Elegí un responsable activo');
      }
      const after = await tx.leadImportMapping.update({
        where: { kind_scope_key: identity },
        data: {
          key,
          sourceId,
          assignedToId,
          confirmedById: actor.id,
          updatedAt: new Date(
            Math.max(Date.now(), before.updatedAt.getTime() + 1),
          ),
        },
      });
      await tx.leadImportMappingEvent.create({
        data: {
          actorId: actor.id,
          action: 'UPDATE',
          before: mappingSnapshot(before),
          after: mappingSnapshot(after),
        },
      });
      return after;
    });
  }
}
