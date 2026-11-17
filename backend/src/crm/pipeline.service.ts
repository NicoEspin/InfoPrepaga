import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';
import { leadScope } from './access';
import { assertAdmin } from '../common/authorization';
import {
  buenosAiresDay,
  buenosAiresMidnight,
} from '../common/buenos-aires-calendar';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { MovePipelineDto, PipelineQueryDto } from './pipeline.dto';
@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
  ) {}
  list(query: PipelineQueryDto, actor: AuthenticatedUser) {
    const currentMonth = buenosAiresDay(new Date()).slice(0, 7);
    const month = query.month ?? currentMonth;
    if (month > currentMonth)
      throw new BadRequestException('El mes no puede ser futuro');

    // Prisma represents PostgreSQL date-only fields as UTC calendar dates.
    const firstDay = new Date(`${month}-01T00:00:00Z`);
    const nextMonth = new Date(firstDay);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadScope(actor),
        { portfolioClass: 'ACTIVE' },
        {
          OR: [
            {
              intakeMode: 'NEW',
              createdAt: {
                gte: buenosAiresMidnight(firstDay),
                lt: buenosAiresMidnight(nextMonth),
              },
            },
            {
              intakeMode: 'HISTORICAL',
              originDate: { gte: firstDay, lt: nextMonth },
            },
          ],
        },
        {
          ...(query.stage && { commercialStage: query.stage }),
          ...(query.sourceId && { sourceId: query.sourceId }),
          ...(query.assignedToId && { assignedToId: query.assignedToId }),
          ...(query.q?.trim() && {
            name: { contains: query.q.trim(), mode: 'insensitive' },
          }),
        },
      ],
    };
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.lead.findMany({
          where,
          select: {
            id: true,
            name: true,
            company: true,
            version: true,
            commercialStage: true,
            source: { select: { id: true, name: true } },
            assignedTo: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await tx.lead.count({ where });
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  move(id: string, dto: MovePipelineDto, actor: AuthenticatedUser) {
    return this.crm.write(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { AND: [{ id }, leadScope(actor)] },
      });
      if (!lead) throw new NotFoundException('Lead no encontrado');
      if (lead.portfolioClass !== 'ACTIVE')
        throw new BadRequestException(
          'Activá el contacto antes de gestionar su pipeline',
        );
      if (lead.version !== dto.version)
        throw new ConflictException(
          'El lead cambió. Actualizá y volvé a intentar.',
        );
      if (lead.commercialStage === dto.stage)
        throw new BadRequestException('El lead ya está en esa etapa');
      if (lead.commercialStage === 'CLOSED') {
        assertAdmin(actor);
        if (!dto.reason?.trim())
          throw new BadRequestException('Indicá el motivo de la corrección');
      }
      const effectiveAt = new Date(); // after acquiring the shared ownership/assignment lock
      const result = await tx.lead.updateMany({
        where: { AND: [{ id, version: dto.version }, leadScope(actor)] },
        data: { commercialStage: dto.stage, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException('El lead cambió. Actualizá la vista.');
      const movement = await tx.commercialMovement.create({
        data: {
          leadId: id,
          from: lead.commercialStage,
          to: dto.stage,
          effectiveAt,
          responsibleId: lead.assignedToId,
          sourceId: lead.sourceId,
          actorId: actor.id,
          reason: dto.reason?.trim(),
          leadVersion: dto.version + 1,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: id,
          actorId: actor.id,
          kind: 'commercial-stage',
          createdAt: effectiveAt,
          detail: {
            movementId: movement.id,
            from: lead.commercialStage,
            to: dto.stage,
            responsibleId: lead.assignedToId,
            sourceId: lead.sourceId,
            effectiveAt: effectiveAt.toISOString(),
            reason: dto.reason?.trim() ?? null,
          },
        },
      });
      return { id, commercialStage: dto.stage, version: dto.version + 1 };
    });
  }
}
