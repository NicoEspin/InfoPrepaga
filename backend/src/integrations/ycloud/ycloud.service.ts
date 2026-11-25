import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, YCloudInboundStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { assertAdmin } from '../../common/authorization';
import { PeriodicJobLog } from '../../common/periodic-job-log';
import { CrmService } from '../../crm/crm.service';
import { PrismaService } from '../../prisma/prisma.service';
import { mapYCloudEvent } from './ycloud-payload';
import { ycloudAdmission } from './ycloud-policy';
import {
  YCLOUD_MAX_ATTEMPTS,
  YCLOUD_POLL_MS,
  ycloudConfig,
} from './ycloud.config';
import type { YCloudQueryDto } from './ycloud.dto';

@Injectable()
export class YCloudService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YCloudService.name);
  private readonly jobLog = new PeriodicJobLog();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly db: PrismaService,
    private readonly crm: CrmService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => this.schedule(), YCLOUD_POLL_MS);
    this.timer.unref();
    this.schedule();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private schedule() {
    if (this.running || this.stopping || !ycloudConfig(this.config).enabled)
      return;
    this.running = this.processPending()
      .then(() => this.jobLog.success(this.logger, 'ycloud-inbox'))
      .catch((error: unknown) =>
        this.jobLog.failure(this.logger, 'ycloud-inbox', error),
      )
      .finally(() => {
        this.running = undefined;
      });
  }
  async receive(body: unknown) {
    const cfg = ycloudConfig(this.config);
    if (!cfg.enabled) throw new ServiceUnavailableException('YCLOUD_DISABLED');
    const data = mapYCloudEvent(body, cfg);
    try {
      const event = await this.db.yCloudInboundEvent.create({ data });
      return {
        result: 'accepted',
        status: event.status,
        code: event.errorCode,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return { result: 'duplicate' };
      this.jobLog.failure(this.logger, 'ycloud-storage', error);
      throw new ServiceUnavailableException('YCLOUD_STORAGE_UNAVAILABLE');
    }
  }
  async processPending() {
    // Bounded work per tick. Always acquire assignment_state BEFORE inbox rows.
    for (let n = 0; n < 50 && !this.stopping; n++) {
      if (!ycloudConfig(this.config).enabled) return;
      const result = await this.crm.maintenanceWrite(async (tx) => {
        const cfg = ycloudConfig(this.config);
        if (!cfg.enabled) return false;
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM ycloud_inbound_events
          WHERE status = 'PENDING' AND (
            "nextAttemptAt" <= now() OR (
              attribution->>'source_type' IS DISTINCT FROM 'ad' AND (
                NOT "isTestMessage" OR NOT ${cfg.allowNonAdTestMessages}
                OR NOT COALESCE("phoneKey" = ANY(${cfg.testSenders}::text[]), false)
              )
            )
          )
          ORDER BY "receivedAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return false;
        const event = await tx.yCloudInboundEvent.findUniqueOrThrow({
          where: { id: rows[0].id },
        });
        const admission = ycloudAdmission(
          (event.attribution as Prisma.JsonObject | null)?.source_type,
          event.phoneKey,
          cfg,
        );
        // Recheck deployment policy on every attempt, including old inbox rows.
        // A stored flag is provenance, never authorization by itself.
        if (
          !admission.allowed ||
          (admission.isTestMessage && !event.isTestMessage)
        ) {
          await tx.yCloudInboundEvent.update({
            where: { id: event.id },
            data: { status: 'IGNORED', errorCode: 'ORGANIC_MESSAGE' },
          });
          return true;
        }
        if (await this.crm.backfillContactKeysInTransaction(tx)) return true;
        // A failed Prisma statement aborts PostgreSQL transactions. The savepoint
        // rolls back every commercial effect before persisting the retry state.
        await tx.$executeRawUnsafe('SAVEPOINT ycloud_business');
        try {
          let errorCode: string | null = null;
          if (
            event.wabaId !== cfg.wabaId ||
            event.businessPhone !== cfg.businessPhone
          )
            errorCode = 'ACCOUNT_CONFIG_CHANGED';
          if (!event.phoneKey) errorCode = 'CONTACT_INSUFFICIENT';
          const source = await tx.leadSource.findFirst({
            where: { code: cfg.sourceCode, isActive: true },
          });
          if (!source) errorCode = 'SOURCE_UNAVAILABLE';
          const matches = event.phoneKey
            ? await tx.lead.findMany({
                where: { phoneKey: event.phoneKey },
                take: 2,
                select: { id: true, portfolioClass: true },
              })
            : [];
          if (matches.length > 1) errorCode = 'CONTACT_AMBIGUOUS';
          else if (
            matches.length === 1 &&
            matches[0].portfolioClass !== 'ACTIVE'
          )
            errorCode = 'CONTACT_HISTORICAL';
          if (errorCode || !source) {
            await tx.yCloudInboundEvent.update({
              where: { id: event.id },
              data: {
                status: 'REVIEW',
                errorCode,
                attempts: { increment: 1 },
              },
            });
          } else {
            const leadId =
              matches[0]?.id ??
              (
                await this.crm.createSystemLeadInTransaction(tx, {
                  name:
                    event.profileName ||
                    `WhatsApp ${event.phoneKey!.slice(-4)}`,
                  phone: event.phoneKey!,
                  sourceId: source.id,
                })
              ).id;
            await tx.leadActivity.create({
              data: {
                leadId,
                actorId: null,
                kind: 'ycloud-inbound',
                detail: {
                  eventId: event.id,
                  linked: matches.length === 1,
                  isTestMessage: event.isTestMessage,
                  messageAt: event.messageAt?.toISOString() ?? null,
                  adId:
                    (event.attribution as Prisma.JsonObject | null)
                      ?.source_id ?? null,
                },
              },
            });
            await tx.yCloudInboundEvent.update({
              where: { id: event.id },
              data: {
                leadId,
                status: 'PROCESSED',
                processedAt: new Date(),
                attempts: { increment: 1 },
                errorCode: null,
              },
            });
          }
        } catch (error) {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ycloud_business');
          const attempts = event.attempts + 1;
          await tx.yCloudInboundEvent.update({
            where: { id: event.id },
            data: {
              status: attempts >= YCLOUD_MAX_ATTEMPTS ? 'EXHAUSTED' : 'PENDING',
              attempts,
              errorCode: 'PROCESSING_FAILED',
              nextAttemptAt: new Date(
                Date.now() + Math.min(3_600_000, 10_000 * 2 ** (attempts - 1)),
              ),
            },
          });
          this.jobLog.failure(this.logger, 'ycloud-processing', error);
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT ycloud_business');
        return true;
      });
      if (result.busy || !result.value) return;
    }
  }
  async list(query: YCloudQueryDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const where = query.status ? { status: query.status } : {};
    return this.db.$transaction(
      async (tx) => ({
        enabled: ycloudConfig(this.config).enabled,
        allowNonAdTestMessages: ycloudConfig(this.config)
          .allowNonAdTestMessages,
        items: await tx.yCloudInboundEvent.findMany({
          where,
          select: {
            id: true,
            isTestMessage: true,
            status: true,
            errorCode: true,
            attempts: true,
            nextAttemptAt: true,
            receivedAt: true,
            processedAt: true,
            leadId: true,
          },
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
        }),
        total: await tx.yCloudInboundEvent.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(id: string, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const event = await this.db.yCloudInboundEvent.findUnique({
      where: { id },
      include: {
        retries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!event) throw new NotFoundException('Ingreso no encontrado');
    return event;
  }
  async retry(id: string, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.crm.write(async (tx) => {
      const event = await tx.yCloudInboundEvent.findUnique({ where: { id } });
      if (!event) throw new NotFoundException('Ingreso no encontrado');
      if (
        !(['REVIEW', 'EXHAUSTED'] as YCloudInboundStatus[]).includes(
          event.status,
        )
      )
        throw new ConflictException(
          'Solo se reintentan ingresos en revisión o agotados',
        );
      // These decisions cannot be changed by retrying an identical payload.
      if (
        event.errorCode === 'CONTACT_INSUFFICIENT' ||
        event.errorCode === 'API_VERSION_UNSUPPORTED'
      )
        throw new ConflictException(
          'El ingreso requiere datos o contrato compatibles',
        );
      await tx.yCloudInboundRetry.create({
        data: {
          eventId: id,
          actorId: actor.id,
          previousStatus: event.status,
          previousErrorCode: event.errorCode,
          previousAttempts: event.attempts,
        },
      });
      await tx.yCloudInboundEvent.update({
        where: { id },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          errorCode: null,
        },
      });
      return { result: 'queued' };
    });
  }
}
