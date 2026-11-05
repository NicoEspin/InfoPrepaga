import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  AccountActionDto,
  CreateUserDto,
  EditUserDto,
  UserQueryDto,
} from './dto/manage-user.dto';
import { lockAccounts } from './account-lock';

const select = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  deletedAt: true,
  version: true,
  receivesLeads: true,
  createdAt: true,
  roles: { select: { role: { select: { name: true } } } },
  _count: {
    select: { assignedLeads: true, tasks: { where: { completedAt: null } } },
  },
} satisfies Prisma.UserSelect;
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}
  private async authorize(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
  ) {
    assertAdmin(actor);
    const current = await tx.user.findFirst({
      where: {
        id: actor.id,
        isActive: true,
        deletedAt: null,
        roles: { some: { role: { name: 'ADMIN' } } },
      },
    });
    if (!current) throw new UnauthorizedException('Sesión finalizada');
  }
  private async write<T>(
    actor: AuthenticatedUser,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    assertAdmin(actor);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockAccounts(tx);
          await this.authorize(tx, actor);
          return fn(tx);
        },
        { timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Ya existe una cuenta con ese correo. Si está eliminada, restaurala.',
        );
      throw error;
    }
  }
  async list(query: UserQueryDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const where: Prisma.UserWhereInput = {
      ...(query.state === 'deleted'
        ? { deletedAt: { not: null } }
        : query.state === 'all'
          ? {}
          : {
              deletedAt: null,
              ...(query.state === 'inactive'
                ? { isActive: false }
                : query.state === 'active'
                  ? { isActive: true }
                  : {}),
            }),
      ...(query.role && { roles: { some: { role: { name: query.role } } } }),
      ...(query.q?.trim() && {
        OR: ['firstName', 'lastName', 'email'].map((key) => ({
          [key]: { contains: query.q!.trim(), mode: 'insensitive' },
        })),
      }),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.user.findMany({
          where,
          select,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.user.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const password = await bcrypt.hash(dto.password, 12);
    return this.write(actor, async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { name: dto.role },
      });
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName,
          email: dto.email.trim().toLowerCase(),
          password,
          roles: { create: { roleId: role.id } },
        },
        select,
      });
      await tx.accountAudit.create({
        data: {
          actorId: actor.id,
          targetId: user.id,
          kind: 'created',
          detail: { role: dto.role },
        },
      });
      return user;
    });
  }
  async change(
    id: string,
    dto: EditUserDto | AccountActionDto,
    actor: AuthenticatedUser,
    action: 'edit' | 'deactivate' | 'delete' | 'restore' = 'edit',
  ) {
    assertAdmin(actor);
    const password = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;
    return this.write(actor, async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (target.version !== dto.version)
        throw new ConflictException(
          'La cuenta cambió. Actualizá la vista y volvé a intentar.',
        );
      const edit = action === 'edit' ? (dto as EditUserDto) : undefined;
      const oldRole = target.roles[0]?.role.name;
      const newRole = edit?.role ?? oldRole;
      const leaving =
        action === 'delete' || action === 'deactivate' || newRole !== oldRole;
      if (id === actor.id && leaving)
        throw new BadRequestException(
          'No podés eliminar, desactivar ni cambiar tu propio rol.',
        );
      if (target.deletedAt && action !== 'restore')
        throw new ConflictException('Restaurá la cuenta antes de modificarla.');
      if (action === 'restore' && target.isActive && !target.deletedAt)
        throw new ConflictException('La cuenta ya está activa.');
      if (leaving && oldRole === 'ADMIN' && target.isActive) {
        const admins = await tx.user.count({
          where: {
            id: { not: id },
            isActive: true,
            deletedAt: null,
            roles: { some: { role: { name: 'ADMIN' } } },
          },
        });
        if (!admins)
          throw new ConflictException(
            'Debe quedar al menos un administrador activo.',
          );
      }
      if (leaving) {
        const leads = await tx.lead.findMany({
          where: { assignedToId: id },
          select: { id: true },
        });
        const pending = await tx.commercialTask.count({
          where: { ownerId: id, completedAt: null },
        });
        if (leads.length || pending) {
          const replacement =
            dto.replacementId && dto.replacementId !== id
              ? await tx.user.findFirst({
                  where: {
                    id: dto.replacementId,
                    isActive: true,
                    deletedAt: null,
                    roles: { some: { role: { name: 'VENDEDOR' } } },
                  },
                })
              : null;
          if (!replacement)
            throw new BadRequestException(
              'Elegí un vendedor activo de reemplazo para transferir los leads y las tareas pendientes.',
            );
          await tx.lead.updateMany({
            where: { assignedToId: id },
            data: { assignedToId: replacement.id, version: { increment: 1 } },
          });
          await tx.commercialTask.updateMany({
            where: {
              completedAt: null,
              OR: [{ ownerId: id }, { leadId: { in: leads.map((l) => l.id) } }],
            },
            data: { ownerId: replacement.id, version: { increment: 1 } },
          });
          if (leads.length)
            await tx.leadActivity.createMany({
              data: leads.map((l) => ({
                leadId: l.id,
                actorId: actor.id,
                kind: 'reassigned',
                detail: {
                  previousAssignedToId: id,
                  assignedToId: replacement.id,
                  reason: 'account-' + action,
                },
              })),
            });
          await tx.accountAudit.create({
            data: {
              actorId: actor.id,
              targetId: id,
              kind: 'transferred',
              detail: {
                replacementId: replacement.id,
                leads: leads.length,
                pendingTasks: pending,
              },
            },
          });
        }
      }
      const sensitive = Boolean(
        password ||
        (edit?.email && edit.email !== target.email) ||
        newRole !== oldRole ||
        action !== 'edit',
      );
      if (sensitive)
        await tx.refreshToken.deleteMany({ where: { userId: id } });
      if (edit?.role && edit.role !== oldRole) {
        const role = await tx.role.findUniqueOrThrow({
          where: { name: edit.role },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(edit && {
            firstName: edit.firstName,
            lastName: edit.lastName,
            email: edit.email?.trim().toLowerCase(),
          }),
          ...(password && { password }),
          ...(leaving && { receivesLeads: false }),
          ...(action === 'delete' && {
            deletedAt: new Date(),
            isActive: false,
          }),
          ...(action === 'deactivate' && { isActive: false }),
          ...(action === 'restore' && {
            deletedAt: null,
            isActive: true,
            receivesLeads: false,
          }),
          version: { increment: 1 },
        },
        select,
      });
      await tx.accountAudit.create({
        data: {
          actorId: actor.id,
          targetId: id,
          kind: action,
          detail: {
            fields: edit
              ? Object.keys(edit).filter(
                  (k) => !['password', 'version', 'replacementId'].includes(k),
                )
              : [],
            passwordChanged: Boolean(password),
            role: newRole,
          },
        },
      });
      return user;
    });
  }
}
