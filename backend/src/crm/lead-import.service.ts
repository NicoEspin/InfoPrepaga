import { rememberImportMapping } from './import-mapping.store';
import {
  canCleanOptionalContact,
  cleanOptionalContact,
} from './lead-import.exceptions';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, type LeadImportRow } from '@prisma/client';
import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';
import { contactKeys } from './contact-keys';
import { parseLeadImport } from './lead-import.parser';
import { ImportPatchDto, ImportRowPatchDto } from './lead-import.dto';
import { planLeadImport, appearanceFingerprint } from './lead-import.plan';
import { resolveImportMappings } from './lead-import.mappings';
import { importKey } from './import-normalization';
import { PeriodicJobLog } from '../common/periodic-job-log';
type Tx = Prisma.TransactionClient;

@Injectable()
export class LeadImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadImportService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleanup?: Promise<void>;
  private readonly jobLog = new PeriodicJobLog();
  constructor(
    private readonly db: PrismaService,
    private readonly crm: CrmService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => this.scheduleCleanup(), 60_000);
    this.timer.unref();
    this.scheduleCleanup();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.cleanup;
  }
  private scheduleCleanup() {
    if (this.cleanup) return;
    this.cleanup = this.purgeExpired()
      .then(() => this.jobLog.success(this.logger, 'import-cleanup'))
      .catch((error: unknown) => {
        this.jobLog.failure(this.logger, 'import-cleanup', error);
      })
      .finally(() => {
        this.cleanup = undefined;
      });
  }
  async purgeExpired() {
    if (
      !(await this.db.leadImportBatch.count({
        where: {
          expiresAt: { lte: new Date() },
          status: { in: ['REVIEW', 'IMPORTING', 'COMPLETE'] },
        },
      }))
    )
      return;
    await this.crm.maintenanceWrite(async (tx) => {
      const expired = await tx.leadImportBatch.findMany({
        where: {
          expiresAt: { lte: new Date() },
          status: { in: ['REVIEW', 'IMPORTING', 'COMPLETE'] },
        },
        take: 100,
        select: { id: true },
      });
      const ids = expired.map((batch) => batch.id);
      if (!ids.length) return;
      await tx.leadImportRow.deleteMany({ where: { batchId: { in: ids } } });
      await tx.leadImportBatch.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'EXPIRED',
          fileName: '',
          warnings: [],
          sheets: [],
          version: { increment: 1 },
        },
      });
    });
  }
  private async batch(tx: Tx, id: string, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const batch = await tx.leadImportBatch.findFirst({
      where: { id, ownerId: actor.id },
    });
    if (!batch) throw new NotFoundException('Importación no encontrada');
    if (batch.status === 'EXPIRED' || batch.expiresAt <= new Date())
      throw new ConflictException(
        'La revisión venció. Subí nuevamente el archivo',
      );
    return batch;
  }
  private version(actual: number, expected: number) {
    if (actual !== expected)
      throw new ConflictException(
        'La revisión cambió. Actualizá antes de continuar',
      );
  }
  private async backfill() {
    // Same lock as edits: never overwrite keys computed by a concurrent edit.
    for (;;) {
      const count = await this.crm.write(async (tx) => {
        const leads = await tx.lead.findMany({
          where: { contactKeysVersion: 0 },
          take: 100,
          orderBy: { id: 'asc' },
          select: { id: true, email: true, phone: true },
        });
        for (const lead of leads)
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              ...contactKeys(lead.email, lead.phone),
              contactKeysVersion: 1,
            },
          });
        return leads.length;
      });
      if (count < 100) break;
    }
  }
  async upload(
    file: { originalname: string; buffer: Buffer } | undefined,
    actor: AuthenticatedUser,
  ) {
    assertAdmin(actor);
    if (!file || !/\.xlsx$/i.test(file.originalname))
      throw new BadRequestException('Seleccioná un archivo .xlsx');
    const parsed = await parseLeadImport(file.buffer);
    await this.backfill();
    return this.crm.write(async (tx) => {
      const batch = await tx.leadImportBatch.create({
        data: {
          ownerId: actor.id,
          fileName: file.originalname.split(/[\\/]/).pop()!.slice(0, 255),
          sheets: parsed.sheets,
          warnings: parsed.warnings,
          total: parsed.rows.length,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const resolved = await this.resolveMappings(tx, parsed.rows);
      // Keep inserts bounded; all rows belong to this atomic preparation.
      for (let i = 0; i < parsed.rows.length; i += 100)
        await tx.leadImportRow.createMany({
          data: resolved.slice(i, i + 100).map((row) => ({
            ...row,
            batchId: batch.id,
            reviewedMatches: [],
          })),
        });
      const preview = await this.analyze(tx, batch);
      await this.acknowledge(tx, preview.rows);
      return { id: batch.id };
    });
  }
  async list(actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.db.leadImportBatch.findMany({
      where: {
        ownerId: actor.id,
        expiresAt: { gt: new Date() },
        status: { not: 'EXPIRED' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        imported: true,
        total: true,
        createdAt: true,
      },
    });
  }
  private async analyze(tx: Tx, batch: { id: string; sheets: string[] }) {
    const rows = await tx.leadImportRow.findMany({
      where: { batchId: batch.id },
      orderBy: [{ sheet: 'asc' }, { rowNumber: 'asc' }],
    });
    const keys = rows
      .filter((row) => batch.sheets.includes(row.sheet))
      .map((row) => contactKeys(row.email, row.phone));
    const emailKeys = [
      ...new Set(keys.flatMap((key) => (key.emailKey ? [key.emailKey] : []))),
    ];
    const phoneKeys = [
      ...new Set(keys.flatMap((key) => (key.phoneKey ? [key.phoneKey] : []))),
    ];
    const [leads, sources, sellers, appearances] = await Promise.all([
      tx.lead.findMany({
        where: {
          OR: [
            { emailKey: { in: emailKeys } },
            { phoneKey: { in: phoneKeys } },
          ],
        },
        select: {
          id: true,
          name: true,
          emailKey: true,
          phoneKey: true,
          version: true,
          assignedToId: true,
          email: true,
          phone: true,
          sourceId: true,
          status: true,
          commercialStage: true,
          observations: true,
          source: { select: { name: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      }),
      tx.leadSource.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      tx.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } } },
        },
        select: { id: true, firstName: true, lastName: true },
      }),
      tx.leadImportAppearance.findMany({
        where: { fingerprint: { in: rows.map(appearanceFingerprint) } },
        select: { fingerprint: true },
      }),
    ]);
    const plan = planLeadImport(
      rows,
      batch.sheets,
      leads.map((lead) => ({
        ...lead,
        sourceName: lead.source.name,
        assignedToName: lead.assignedTo
          ? [lead.assignedTo.firstName, lead.assignedTo.lastName]
              .filter(Boolean)
              .join(' ')
          : 'Sin asignar',
      })),
      new Set(sources.map((source) => source.id)),
      new Set(sellers.map((seller) => seller.id)),
      new Set(appearances.map((entry) => entry.fingerprint)),
      {
        sources: new Map(sources.map((source) => [source.id, source.name])),
        sellers: new Map(
          sellers.map((seller) => [
            seller.id,
            [seller.firstName, seller.lastName].filter(Boolean).join(' '),
          ]),
        ),
      },
    );
    const active = rows.filter(
      (row) => batch.sheets.includes(row.sheet) && !row.leadId,
    );
    const groups = new Map<string, LeadImportRow[]>();
    const advisors = new Map<string, LeadImportRow[]>();
    for (const row of active) {
      const key = `${row.sheet}\u0000${row.group}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
      if (row.advisor)
        advisors.set(importKey(row.advisor), [
          ...(advisors.get(importKey(row.advisor)) ?? []),
          row,
        ]);
    }
    return {
      ...plan,
      availableSheets: [...new Set(rows.map((row) => row.sheet))],
      groups: [...groups.values()].map((same) => ({
        sheet: same[0].sheet,
        group: same[0].group,
        sourceId: same.every((row) => row.sourceId === same[0].sourceId)
          ? same[0].sourceId
          : null,
      })),
      advisors: [...advisors.values()].map((same) => ({
        advisor: same[0].advisor,
        variants: [...new Set(same.map((row) => row.advisor))],
        resolved: same.every((row) => row.assignmentResolved),
        assignedToId: same.every(
          (row) => row.assignedToId === same[0].assignedToId,
        )
          ? same[0].assignedToId
          : null,
      })),
    };
  }
  private async resolveMappings(
    tx: Tx,
    rows: Awaited<ReturnType<typeof parseLeadImport>>['rows'],
  ) {
    const [rules, sources, users] = await Promise.all([
      tx.leadImportMapping.findMany(),
      tx.leadSource.findMany({ where: { isActive: true } }),
      tx.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } } },
        },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return resolveImportMappings(rows, rules, sources, users);
  }

  private async acknowledge(
    tx: Tx,
    rows: Array<{
      id: string;
      externalMatches: string[];
      reviewedMatches: string[];
    }>,
  ) {
    const changes = rows
      .filter(
        (row) =>
          row.externalMatches.join(',') !==
          [...row.reviewedMatches].sort().join(','),
      )
      .map((row) => ({ id: row.id, matches: row.externalMatches }));
    if (changes.length)
      await tx.$executeRaw`
      UPDATE lead_import_rows AS r SET "reviewedMatches" = ARRAY(SELECT jsonb_array_elements_text(v.matches))
      FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS v(id text, matches jsonb)
      WHERE r.id = v.id`;
  }
  async get(id: string, actor: AuthenticatedUser, page = 1, filter = 'ALL') {
    return this.db.$transaction(
      async (tx) => {
        const batch = await this.batch(tx, id, actor);
        const preview = await this.analyze(tx, batch);
        const filtered = preview.rows.filter(
          (row) =>
            filter === 'ALL' ||
            (filter === 'DUPLICATES' && row.duplicate) ||
            (filter === 'REVIEW' && row.action === 'REVIEW') ||
            filter === row.action,
        );
        const items = filtered
          .slice((page - 1) * 50, page * 50)
          .map(
            ({
              reviewedMatches: _reviewed,
              externalMatches: _external,
              ...row
            }) => {
              void _reviewed;
              void _external;
              return row;
            },
          );
        return {
          ...batch,
          ...preview,
          rows: undefined,
          items,
          page,
          pageSize: 50,
          rowTotal: filtered.length,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15_000 },
    );
  }
  async patch(id: string, dto: ImportPatchDto, actor: AuthenticatedUser) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      this.version(batch.version, dto.version);
      if (dto.duplicates || dto.bulkCleanup)
        this.checkReview(
          (await this.analyze(tx, batch)).reviewToken,
          dto.reviewToken,
        );
      if (
        batch.status === 'COMPLETE' ||
        (batch.status === 'IMPORTING' && (dto.sheets || dto.mappings))
      )
        throw new ConflictException(
          'La carga ya comenzó; solo podés revisar filas pendientes',
        );
      if (dto.bulkCleanup) {
        const preview = await this.analyze(tx, batch);
        const kind = dto.bulkCleanup;
        const changes = preview.rows
          .filter((row) => canCleanOptionalContact(row, kind))
          .map((row) => {
            const cleaned = cleanOptionalContact(row, kind);
            return {
              id: row.id,
              email: cleaned.email,
              phone: cleaned.phone,
              formulas: cleaned.formulaFields,
              metadata: cleaned.metadata,
            };
          });
        if (changes.length)
          await tx.$executeRaw`
          UPDATE lead_import_rows AS r SET email=v.email, phone=v.phone,
            "formulaFields"=ARRAY(SELECT jsonb_array_elements_text(v.formulas)),
            metadata=v.metadata, "reviewedMatches"=ARRAY[]::TEXT[]
          FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb)
            AS v(id TEXT,email TEXT,phone TEXT,formulas JSONB,metadata JSONB)
          WHERE r.id=v.id AND r."batchId"=${id} AND r."leadId" IS NULL`;
      }
      if (dto.sheets) {
        const available = await tx.leadImportRow.findMany({
          where: { batchId: id },
          distinct: ['sheet'],
          select: { sheet: true },
        });
        if (
          dto.sheets.some(
            (sheet) => !available.some((item) => item.sheet === sheet),
          )
        )
          throw new BadRequestException('Hoja no disponible en el archivo');
      }
      for (const mapping of dto.mappings ?? []) {
        if (!mapping.sheet && mapping.advisor === undefined)
          throw new BadRequestException('Indicá hoja o asesor para relacionar');
        if (
          mapping.sourceId !== undefined &&
          !(await tx.leadSource.findFirst({
            where: { id: mapping.sourceId, isActive: true },
          }))
        )
          throw new BadRequestException('Origen no disponible');
        if (mapping.assignedToId)
          await this.validateManualResponsible(tx, mapping.assignedToId);
        const aliases = new Set(
          [mapping.advisor ?? '', ...(mapping.aliases ?? [])].map(importKey),
        );
        const candidates = await tx.leadImportRow.findMany({
          where: {
            batchId: id,
            leadId: null,
            ...(mapping.sheet && { sheet: mapping.sheet }),
            ...(mapping.group !== undefined && { group: mapping.group }),
          },
        });
        const matched = candidates.filter((row) =>
          mapping.advisor !== undefined
            ? aliases.has(importKey(row.advisor))
            : true,
        );
        if (mapping.sourceId !== undefined)
          await tx.leadImportRow.updateMany({
            where: { id: { in: matched.map((row) => row.id) } },
            data: { sourceId: mapping.sourceId },
          });
        if (mapping.assignedToId !== undefined)
          await tx.leadImportRow.updateMany({
            where: {
              id: {
                in: matched
                  .filter(
                    (row) => mapping.advisor !== undefined || !row.advisor,
                  )
                  .map((row) => row.id),
              },
            },
            data: {
              assignedToId: mapping.assignedToId,
              assignmentResolved: true,
            },
          });
        if (mapping.remember !== false) {
          const rules = [
            ...(mapping.sourceId !== undefined && mapping.sheet
              ? [
                  {
                    kind: 'ORIGIN',
                    scope: mapping.sheet,
                    key:
                      mapping.group === undefined
                        ? '*'
                        : importKey(mapping.group),
                  },
                ]
              : []),
            ...(mapping.assignedToId !== undefined
              ? mapping.advisor !== undefined
                ? [...aliases]
                    .filter(Boolean)
                    .map((key) => ({ kind: 'ADVISOR', scope: '*', key }))
                : mapping.sheet
                  ? [{ kind: 'DEFAULT', scope: mapping.sheet, key: '*' }]
                  : []
              : []),
          ];
          for (const rule of rules)
            await rememberImportMapping(
              tx,
              rule,
              {
                sourceId: mapping.sourceId,
                assignedToId: mapping.assignedToId,
              },
              actor.id,
            );
        }
      }
      const updated = await tx.leadImportBatch.update({
        where: { id },
        data: {
          ...(dto.sheets && { sheets: [...new Set(dto.sheets)] }),
          version: { increment: 1 },
        },
      });
      if (dto.duplicates) {
        const preview = await this.analyze(tx, updated);
        const ids = preview.rows
          .filter((row) => row.active && row.duplicate && !row.leadId)
          .map((row) => row.id);
        await tx.leadImportRow.updateMany({
          where: { id: { in: ids } },
          data: { decision: dto.duplicates },
        });
        await this.acknowledge(tx, preview.rows);
      }
      return { id, version: updated.version };
    });
  }
  private async validateManualResponsible(tx: Tx, id: string) {
    if (
      !(await tx.user.findFirst({
        where: {
          id,
          isActive: true,
          roles: {
            some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } },
          },
        },
      }))
    )
      throw new BadRequestException('Responsable no disponible');
  }
  async patchRow(
    id: string,
    rowId: string,
    dto: ImportRowPatchDto,
    actor: AuthenticatedUser,
  ) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      this.version(batch.version, dto.version);
      if (batch.status === 'COMPLETE')
        throw new ConflictException('La carga ya terminó');
      const row = await tx.leadImportRow.findFirst({
        where: { id: rowId, batchId: id, leadId: null },
      });
      if (!row) throw new NotFoundException('Fila no disponible');
      if (
        dto.sourceId &&
        !(await tx.leadSource.findFirst({
          where: { id: dto.sourceId, isActive: true },
        }))
      )
        throw new BadRequestException('Origen no disponible');
      if (dto.assignedToId)
        await this.validateManualResponsible(tx, dto.assignedToId);
      const {
        version: _version,
        reviewToken,
        acknowledgeDuplicates,
        assignedToId,
        excludePending: _excludePending,
        ...data
      } = dto;
      void _version;
      void _excludePending;
      const contactChanged =
        (dto.email !== undefined &&
          dto.email.trim().toLowerCase() !== row.email) ||
        (dto.phone !== undefined && dto.phone.trim() !== row.phone);
      if (acknowledgeDuplicates)
        this.checkReview(
          (await this.analyze(tx, batch)).reviewToken,
          reviewToken,
        );
      await tx.leadImportRow.update({
        where: { id: rowId },
        data: {
          ...data,
          formulaFields: row.formulaFields.filter(
            (field) =>
              dto[field as 'name' | 'email' | 'phone' | 'observations'] ===
              undefined,
          ),
          ...(dto.name !== undefined && {
            name: dto.name.trim(),
            nameResolved: true,
          }),
          ...(dto.email !== undefined && {
            email: dto.email.trim().toLowerCase(),
          }),
          ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
          ...(contactChanged && {
            reviewedMatches: [],
            decision: dto.decision ?? 'AUTO',
          }),
          ...(assignedToId !== undefined && {
            assignedToId,
            assignmentResolved: true,
          }),
        },
      });
      if (acknowledgeDuplicates && !contactChanged) {
        const preview = await this.analyze(tx, batch);
        await this.acknowledge(
          tx,
          preview.rows.filter((item) => item.id === rowId),
        );
      }
      const updated = await tx.leadImportBatch.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      return { id, version: updated.version };
    });
  }
  private checkReview(actual: string, expected?: string) {
    if (actual !== expected)
      throw new ConflictException(
        'Las coincidencias cambiaron. Actualizá la revisión antes de continuar',
      );
  }
  async review(
    id: string,
    version: number,
    actor: AuthenticatedUser,
    reviewToken?: string,
  ) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      this.version(batch.version, version);
      const preview = await this.analyze(tx, batch);
      this.checkReview(preview.reviewToken, reviewToken);
      await this.acknowledge(tx, preview.rows);
      return tx.leadImportBatch.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    });
  }
  async confirm(
    id: string,
    version: number,
    actor: AuthenticatedUser,
    excludePending = false,
  ) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      if (batch.status === 'COMPLETE') return this.progress(batch);
      this.version(batch.version, version);
      let preview = await this.analyze(tx, batch);
      let excluded = 0;
      if (excludePending) {
        const ids = preview.rows
          .filter((row) => row.action === 'REVIEW')
          .map((row) => row.id);
        excluded = ids.length;
        await tx.leadImportRow.updateMany({
          where: { id: { in: ids } },
          data: { decision: 'OMIT' },
        });
        preview = await this.analyze(tx, batch);
      }
      if (preview.summary.requiresReview)
        throw new ConflictException(
          'Aparecieron coincidencias nuevas. Revisalas y confirmá la revisión de duplicados',
        );
      if (preview.summary.invalid)
        throw new BadRequestException(
          'Corregí, omití o excluí explícitamente las excepciones pendientes',
        );
      const selected = preview.rows
        .filter((row) => row.selected)
        .sort(
          (a, b) =>
            Number(b.action === 'CREATE') - Number(a.action === 'CREATE'),
        );
      const targets = new Map<string, string>();
      let created = 0;
      let merged = 0;
      const updatedTargets = new Set<string>();
      const previousUpdated = await tx.leadImportRow.findMany({
        where: { batchId: id, outcome: 'UPDATE' },
        select: { leadId: true },
      });
      const previousIds = new Set(previousUpdated.map((row) => row.leadId));
      for (const row of selected.slice(0, 100)) {
        const keys = contactKeys(row.email, row.phone);
        let leadId = row.targetId ?? targets.get(row.leaderId);
        let outcome = row.action;
        if (!leadId && row.action === 'MERGE') {
          const leader = await tx.leadImportRow.findUniqueOrThrow({
            where: { id: row.leaderId },
          });
          leadId = leader.leadId ?? undefined;
        }
        if (!leadId && row.action === 'CREATE') {
          const lead = await this.crm.createLeadInTransaction(
            tx,
            {
              name: row.name,
              email: keys.emailKey ?? '',
              phone: keys.phoneKey ?? '',
              observations: row.observations,
              sourceId: row.sourceId!,
            },
            actor,
            {
              assignedToId: row.assignedToId,
              metadata: {
                ...(row.metadata as Prisma.InputJsonObject),
                batchId: id,
                sheet: row.sheet,
                rowNumber: row.rowNumber,
              },
              batchId: id,
              sheet: row.sheet,
              rowNumber: row.rowNumber,
            },
          );
          leadId = lead.id;
          targets.set(row.id, lead.id);
          created++;
        } else if (leadId) {
          const lead = await tx.lead.findUniqueOrThrow({
            where: { id: leadId },
          });
          // Only fill empty contact fields. Never alter current commercial decisions.
          await tx.lead.update({
            where: { id: leadId },
            data: {
              ...(!lead.email &&
                keys.emailKey && {
                  email: keys.emailKey,
                  emailKey: keys.emailKey,
                }),
              ...(!lead.phone &&
                keys.phoneKey && {
                  phone: keys.phoneKey,
                  phoneKey: keys.phoneKey,
                }),
              version: { increment: 1 },
            },
          });
          if (
            row.action === 'MERGE' ||
            previousIds.has(leadId) ||
            updatedTargets.has(leadId) ||
            preview.rows.some(
              (other) => other.leadId === leadId && other.outcome === 'CREATE',
            ) ||
            [...targets.values()].includes(leadId)
          ) {
            merged++;
            outcome = 'MERGE';
          } else if (!previousIds.has(leadId)) updatedTargets.add(leadId);
        }
        if (!leadId)
          throw new ConflictException(
            'La consolidación cambió; actualizá la revisión',
          );
        await tx.leadImportAppearance.create({
          data: {
            fingerprint: row.fingerprint,
            leadId,
            batchId: id,
            fileName: batch.fileName,
            sheet: row.sheet,
            rowNumber: row.rowNumber,
            sourceId: row.sourceId!,
            original: {
              name: row.name,
              phone: row.phone,
              email: row.email,
              advisor: row.advisor,
              observations: row.observations,
              group: row.group,
              ...(row.metadata as Prisma.InputJsonObject),
            },
          },
        });
        if (outcome !== 'CREATE')
          await tx.leadActivity.create({
            data: {
              leadId,
              actorId: actor.id,
              kind: 'imported_history',
              detail: {
                batchId: id,
                sheet: row.sheet,
                rowNumber: row.rowNumber,
                fingerprint: row.fingerprint,
                observations: row.observations,
                historicalSourceId: row.sourceId,
                fileName: batch.fileName,
                history: row.metadata,
              },
            },
          });
        await tx.leadImportRow.update({
          where: { id: row.id },
          data: { leadId, outcome },
        });
      }
      const complete = selected.length <= 100;
      const updated = await tx.leadImportBatch.update({
        where: { id },
        data: {
          status: complete ? 'COMPLETE' : 'IMPORTING',
          version: { increment: 1 },
          imported: { increment: Math.min(100, selected.length) },
          created: { increment: created },
          updated: { increment: updatedTargets.size },
          merged: { increment: merged },
          excluded: { increment: excluded },
          ...(complete && {
            completedAt: new Date(),
            omitted: preview.rows.filter((row) => !row.leadId && !row.selected)
              .length,
          }),
        },
      });
      return this.progress(updated);
    });
  }
  private progress(batch: {
    id: string;
    status: string;
    version: number;
    imported: number;
    omitted: number;
    created: number;
    updated: number;
    merged: number;
    excluded: number;
  }) {
    return {
      id: batch.id,
      status: batch.status,
      version: batch.version,
      imported: batch.imported,
      omitted: batch.omitted,
      created: batch.created,
      updated: batch.updated,
      merged: batch.merged,
      excluded: batch.excluded,
    };
  }
}
