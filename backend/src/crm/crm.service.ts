import { AccountsService } from '../users/accounts.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { leadScope, taskScope } from './access';
import { leadStatuses } from './catalogs';
import { contactKeys } from './contact-keys';
import {
  AssignmentDto,
  CreateLeadDto,
  CreateTaskDto,
  EditLeadDto,
  EditTaskDto,
  LeadQueryDto,
  PageDto,
  SourceDto,
  StatusDto,
  TaskQueryDto,
  UserSettingsDto,
} from './crm.dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;
const leadInclude = {
  source: true,
  assignedTo: { select: userSelect },
} as const;
const taskInclude = {
  lead: { select: { id: true, name: true, assignedToId: true } },
  owner: { select: userSelect },
} as const;
type Tx = Prisma.TransactionClient;

@Injectable()
export class CrmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly accounts: AccountsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.schedulePending(), 30_000);
    this.timer.unref();
    this.schedulePending();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private schedulePending() {
    if (this.running || this.stopping) return;
    this.running = this.distributePending()
      .then(() => undefined)
      .catch(() => {
        // Do not log raw database errors or records.
        this.logger.error(
          'No se pudo procesar el reparto pendiente; se reintentará.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
  }

  async write<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // One durable lock serializes allocation AND ownership-sensitive writes.
        // This prevents reassignment between authorization and a child mutation.
        const state = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM assignment_state WHERE id = 1 FOR UPDATE`;
        if (state.length !== 1)
          throw new Error('Missing commercial migration lock row');
        return action(tx);
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }
  private async visibleLead(tx: Tx, id: string, actor: AuthenticatedUser) {
    const lead = await tx.lead.findFirst({
      where: { AND: [{ id }, leadScope(actor)] },
      include: leadInclude,
    });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    return lead;
  }
  private checkVersion(actual: number, expected: number) {
    if (actual !== expected)
      throw new ConflictException(
        'El registro cambió. Actualizá la vista y volvé a intentar.',
      );
  }
  private activity(
    tx: Tx,
    leadId: string,
    actorId: string | null,
    kind: string,
    detail: Prisma.InputJsonObject,
  ) {
    return tx.leadActivity.create({ data: { leadId, actorId, kind, detail } });
  }
  private async activeSource(tx: Tx, id: string) {
    if (!(await tx.leadSource.findFirst({ where: { id, isActive: true } })))
      throw new BadRequestException('Origen no disponible');
  }
  private async manualResponsible(tx: Tx, id: string) {
    const seller = await tx.user.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        roles: {
          some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } },
        },
      },
    });
    if (!seller) throw new BadRequestException('Responsable no disponible');
    return seller;
  }
  private async nextSeller(tx: Tx) {
    const candidates = await tx.user.findMany({
      where: {
        isActive: true,
        receivesLeads: true,
        roles: {
          some: { role: { name: 'VENDEDOR' } },
          none: { role: { name: 'ADMIN' } },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, createdAt: true },
    });
    if (!candidates.length) return null;
    const state = await tx.assignmentState.findUniqueOrThrow({
      where: { id: 1 },
    });
    const next =
      candidates.find(
        (user) =>
          !state.lastUserCreated ||
          user.createdAt > state.lastUserCreated ||
          (user.createdAt.getTime() === state.lastUserCreated.getTime() &&
            user.id > (state.lastUserId ?? '')),
      ) ?? candidates[0];
    await tx.assignmentState.update({
      where: { id: 1 },
      data: { lastUserId: next.id, lastUserCreated: next.createdAt },
    });
    return next.id;
  }
  private async drain(tx: Tx) {
    const pending = await tx.lead.findMany({
      where: { assignedToId: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true },
    });
    let assigned = 0;
    for (const lead of pending) {
      const assignedToId = await this.nextSeller(tx);
      if (!assignedToId) break;
      await tx.lead.update({
        where: { id: lead.id },
        data: { assignedToId, version: { increment: 1 } },
      });
      await this.activity(tx, lead.id, null, 'assigned', {
        assignedToId,
        automatic: true,
      });
      assigned++;
    }
    return assigned;
  }
  async distributePending() {
    return this.write((tx) => this.drain(tx));
  }

  async catalogs(actor: AuthenticatedUser) {
    leadScope(actor);
    return {
      statuses: leadStatuses,
      sources: await this.prisma.leadSource.findMany({
        orderBy: [{ isBase: 'asc' }, { name: 'asc' }],
      }),
    };
  }
  async createSource(dto: SourceDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    try {
      return await this.prisma.leadSource.create({
        data: { name: dto.name, code: `BASE_${randomUUID()}`, isBase: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Ya existe un origen con ese nombre');
      throw error;
    }
  }
  async sourceActive(id: string, isActive: boolean, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.write(async (tx) => {
      const source = await tx.leadSource.findUnique({ where: { id } });
      if (!source) throw new NotFoundException('Origen no encontrado');
      if (!source.isBase)
        throw new BadRequestException('Los orígenes iniciales son fijos');
      return tx.leadSource.update({ where: { id }, data: { isActive } });
    });
  }
  async users(actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.prisma.user.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        ...userSelect,
        isActive: true,
        receivesLeads: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
  }
  async userSettings(
    id: string,
    dto: UserSettingsDto,
    actor: AuthenticatedUser,
  ) {
    assertAdmin(actor);
    if (dto.isActive !== undefined) {
      if (dto.receivesLeads !== undefined)
        throw new BadRequestException(
          'Modific� el acceso y la recepci�n por separado',
        );
      const target = await this.prisma.user.findUniqueOrThrow({
        where: { id },
      });
      return this.accounts.change(
        id,
        { version: target.version },
        actor,
        dto.isActive ? 'restore' : 'deactivate',
      );
    }
    return this.write(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      if (!target || target.deletedAt || !target.isActive)
        throw new NotFoundException('Usuario activo no encontrado');
      if (target.roles.some((r) => r.role.name === 'ADMIN'))
        throw new BadRequestException(
          'Esta configuración se aplica solo a vendedores',
        );
      if (!target.roles.some((r) => r.role.name === 'VENDEDOR'))
        throw new BadRequestException('El usuario no es vendedor');
      await tx.user.update({
        where: { id },
        data: { ...dto, version: { increment: 1 } },
      });
      if (dto.isActive === false)
        await tx.refreshToken.deleteMany({ where: { userId: id } });
      await this.drain(tx);
      return {
        id,
        isActive: dto.isActive ?? target.isActive,
        receivesLeads: dto.receivesLeads ?? target.receivesLeads,
      };
    });
  }
  private leadWhere(
    query: LeadQueryDto,
    actor: AuthenticatedUser,
  ): Prisma.LeadWhereInput {
    const filters: Prisma.LeadWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.sourceId && { sourceId: query.sourceId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.q?.trim() && {
        OR: ['name', 'email', 'phone', 'company'].map((key) => ({
          [key]: { contains: query.q!.trim(), mode: 'insensitive' },
        })),
      }),
    };
    return {
      AND: [
        leadScope(actor),
        filters,
        ...(query.unassigned === 'true' ? [{ assignedToId: null }] : []),
      ],
    };
  }
  async leads(query: LeadQueryDto, actor: AuthenticatedUser) {
    const where = this.leadWhere(query, actor);
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.lead.findMany({
          where,
          include: leadInclude,
          orderBy: [{ [query.sort]: query.direction }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.lead.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async profile(id: string, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        const lead = await this.visibleLead(tx, id, actor);
        const nextActivity = await tx.commercialTask.findFirst({
          where: { leadId: id, completedAt: null },
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          include: taskInclude,
        });
        return { ...lead, nextActivity };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async createLead(dto: CreateLeadDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.write((tx) => this.createLeadInTransaction(tx, dto, actor));
  }
  async createLeadInTransaction(
    tx: Tx,
    dto: CreateLeadDto,
    actor: AuthenticatedUser,
    imported?: {
      assignedToId: string | null;
      metadata: Prisma.InputJsonObject;
      batchId: string;
      sheet: string;
      rowNumber: number;
    },
  ) {
    assertAdmin(actor);
    await this.activeSource(tx, dto.sourceId);
    if (imported?.assignedToId)
      await this.manualResponsible(tx, imported.assignedToId);
    if (!dto.email?.trim() && !dto.phone?.trim())
      throw new BadRequestException('Ingresá teléfono o correo');
    // Older pending leads receive the preceding turns, including across batches.
    const hasPending = await tx.lead.count({ where: { assignedToId: null } });
    const assignedToId =
      imported?.assignedToId ?? (hasPending ? null : await this.nextSeller(tx));
    const lead = await tx.lead.create({
      data: {
        ...dto,
        ...contactKeys(dto.email, dto.phone),
        ...(imported && { importData: imported.metadata }),
        email: dto.email || null,
        phone: dto.phone || null,
        assignedToId,
        entrySourceId: dto.sourceId,
      },
      include: leadInclude,
    });
    await this.activity(tx, lead.id, actor.id, 'registered', {
      sourceId: dto.sourceId,
    });
    if (imported)
      await this.activity(tx, lead.id, actor.id, 'imported', {
        batchId: imported.batchId,
        sheet: imported.sheet,
        rowNumber: imported.rowNumber,
      });
    if (assignedToId)
      await this.activity(tx, lead.id, null, 'assigned', {
        assignedToId,
        automatic: !imported?.assignedToId,
        leadVersion: lead.version,
      });
    return lead;
  }
  async editLead(id: string, dto: EditLeadDto, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      const lead = await this.visibleLead(tx, id, actor);
      this.checkVersion(lead.version, dto.version);
      if (dto.sourceId && dto.sourceId !== lead.sourceId) {
        assertAdmin(actor);
        await this.activeSource(tx, dto.sourceId);
      }
      const { version: _version, ...data } = dto;
      void _version;
      if (
        !(data.email ?? lead.email)?.trim() &&
        !(data.phone ?? lead.phone)?.trim()
      )
        throw new BadRequestException('Ingresá teléfono o correo');
      const result = await tx.lead.update({
        where: { id },
        data: {
          ...data,
          ...contactKeys(data.email ?? lead.email, data.phone ?? lead.phone),
          contactKeysVersion: 1,
          ...(data.email !== undefined && { email: data.email || null }),
          ...(data.phone !== undefined && { phone: data.phone || null }),
          version: { increment: 1 },
        },
        include: leadInclude,
      });
      if (data.sourceId && data.sourceId !== lead.sourceId)
        await this.activity(tx, id, actor.id, 'source-changed', {
          from: lead.sourceId,
          to: data.sourceId,
        });
      await this.activity(tx, id, actor.id, 'edited', {
        fields: Object.keys(data),
      });
      return result;
    });
  }
  async status(id: string, dto: StatusDto, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      const lead = await this.visibleLead(tx, id, actor);
      this.checkVersion(lead.version, dto.version);
      const result = await tx.lead.update({
        where: { id },
        data: { status: dto.status, version: { increment: 1 } },
        include: leadInclude,
      });
      await this.activity(tx, id, actor.id, 'status', {
        from: lead.status,
        to: dto.status,
      });
      return result;
    });
  }
  async assign(id: string, dto: AssignmentDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.write(async (tx) => {
      const lead = await this.visibleLead(tx, id, actor);
      this.checkVersion(lead.version, dto.version);
      await this.manualResponsible(tx, dto.assignedToId);
      const result = await tx.lead.update({
        where: { id },
        data: { assignedToId: dto.assignedToId, version: { increment: 1 } },
        include: leadInclude,
      });
      await tx.commercialTask.updateMany({
        where: { leadId: id, completedAt: null },
        data: { ownerId: dto.assignedToId, version: { increment: 1 } },
      });
      await this.activity(tx, id, actor.id, 'assigned', {
        from: lead.assignedToId,
        assignedToId: dto.assignedToId,
        automatic: false,
        leadVersion: result.version,
      });
      return result;
    });
  }
  async note(id: string, text: string, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      await this.visibleLead(tx, id, actor);
      const note = await tx.leadNote.create({
        data: { leadId: id, authorId: actor.id, text },
      });
      await this.activity(tx, id, actor.id, 'note', { noteId: note.id, text });
      await tx.lead.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      return note;
    });
  }
  async history(id: string, query: PageDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.visibleLead(tx, id, actor);
        const where = { leadId: id };
        const items = await tx.leadActivity.findMany({
          where,
          include: { actor: { select: userSelect } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const total = await tx.leadActivity.count({ where });
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  private taskWhere(
    query: TaskQueryDto,
    actor: AuthenticatedUser,
  ): Prisma.CommercialTaskWhereInput {
    if (query.from) this.validateInstant(query.from);
    if (query.to) this.validateInstant(query.to);
    if (query.from && query.to && new Date(query.from) >= new Date(query.to))
      throw new BadRequestException('Rango de fechas inválido');
    const filters: Prisma.CommercialTaskWhereInput = {
      ...(query.leadId && { leadId: query.leadId }),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(query.priority && { priority: query.priority }),
      ...(query.state && {
        completedAt: query.state === 'pending' ? null : { not: null },
      }),
      ...((query.from || query.to) && {
        dueAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
      ...(query.q?.trim() && {
        OR: [
          { title: { contains: query.q.trim(), mode: 'insensitive' } },
          { contact: { contains: query.q.trim(), mode: 'insensitive' } },
          { lead: { name: { contains: query.q.trim(), mode: 'insensitive' } } },
        ],
      }),
    };
    return { AND: [taskScope(actor), filters] };
  }
  async tasks(query: TaskQueryDto, actor: AuthenticatedUser) {
    const where = this.taskWhere(query, actor);
    const [items, total, pending, completed] = await this.prisma.$transaction(
      [
        this.prisma.commercialTask.findMany({
          where,
          include: taskInclude,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.commercialTask.count({ where }),
        this.prisma.commercialTask.count({
          where: { AND: [where, { completedAt: null }] },
        }),
        this.prisma.commercialTask.count({
          where: { AND: [where, { completedAt: { not: null } }] },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      counts: { pending, completed },
    };
  }
  async createTask(dto: CreateTaskDto, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      leadScope(actor);
      let ownerId = actor.id;
      let contact = dto.contact;
      if (dto.leadId) {
        const lead = await this.visibleLead(tx, dto.leadId, actor);
        if (!lead.assignedToId)
          throw new BadRequestException(
            'Asigná el lead antes de crear seguimientos',
          );
        ownerId = lead.assignedToId;
        contact = lead.name;
        if (dto.ownerId && dto.ownerId !== ownerId)
          throw new BadRequestException('El responsable depende del lead');
      } else if (dto.ownerId && dto.ownerId !== actor.id) {
        assertAdmin(actor);
        await this.manualResponsible(tx, dto.ownerId);
        ownerId = dto.ownerId;
      }
      if (!contact) throw new BadRequestException('Ingresá un contacto');
      this.validateInstant(dto.dueAt);
      const task = await tx.commercialTask.create({
        data: {
          ...dto,
          dueAt: new Date(dto.dueAt),
          ownerId,
          contact,
          createdById: actor.id,
        },
        include: taskInclude,
      });
      if (dto.leadId) {
        await this.activity(tx, dto.leadId, actor.id, 'scheduled', {
          taskId: task.id,
          title: task.title,
        });
        await tx.lead.update({
          where: { id: dto.leadId },
          data: { updatedAt: new Date() },
        });
      }
      return task;
    });
  }
  private validateInstant(value: string) {
    if (
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(new Date(value).getTime())
    )
      throw new BadRequestException('La fecha debe incluir zona horaria');
  }
  async editTask(id: string, dto: EditTaskDto, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      const task = await tx.commercialTask.findFirst({
        where: { AND: [{ id }, taskScope(actor)] },
      });
      if (!task) throw new NotFoundException('Tarea no encontrada');
      this.checkVersion(task.version, dto.version);
      if (dto.contact && task.leadId)
        throw new BadRequestException('El contacto se edita desde el lead');
      if (dto.dueAt) this.validateInstant(dto.dueAt);
      const { version: _version, completed, ...data } = dto;
      void _version;
      const result = await tx.commercialTask.update({
        where: { id },
        data: {
          ...data,
          ...(dto.dueAt && { dueAt: new Date(dto.dueAt) }),
          ...(completed !== undefined && {
            completedAt: completed ? (task.completedAt ?? new Date()) : null,
          }),
          version: { increment: 1 },
        },
        include: taskInclude,
      });
      if (task.leadId) {
        await this.activity(
          tx,
          task.leadId,
          actor.id,
          completed === undefined
            ? 'task-edited'
            : completed
              ? 'task-completed'
              : 'task-reopened',
          { taskId: id },
        );
        await tx.lead.update({
          where: { id: task.leadId },
          data: { updatedAt: new Date() },
        });
      }
      return result;
    });
  }
}
