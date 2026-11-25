import { createHash } from 'node:crypto';
import { matchesImportSelection, importProblem } from './import-selection';
import {
  type ImportConfiguration,
  portfolioMetadata,
} from './import-portfolio';
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
import {
  importContactErrors,
  parseLeadImport,
  sourceAppearanceFingerprint,
  type ParsedImportRow,
} from './lead-import.parser';
import { ImportPatchDto, ImportRowPatchDto } from './lead-import.dto';
import {
  planLeadImport,
  appearanceFingerprint,
  legacyAppearanceFingerprint,
} from './lead-import.plan';
import { resolveImportMappings } from './lead-import.mappings';
import { importKey } from './import-normalization';
import { PeriodicJobLog } from '../common/periodic-job-log';
type Tx = Prisma.TransactionClient;
type BatchCounts = {
  total: number;
  imported: number;
  created: number;
  updated: number;
  merged: number;
  omitted: number;
  alreadyRegistered: number | null;
};

function importResult(batch: BatchCounts) {
  const alreadyRegistered = batch.alreadyRegistered ?? 0;
  return {
    created: batch.created,
    updated: batch.updated,
    merged: batch.merged,
    omitted: batch.omitted - alreadyRegistered,
    alreadyRegistered,
    pending: batch.total - batch.imported - batch.omitted,
  };
}

function legacyImportKeys(row: ParsedImportRow) {
  if (row.formulaFields.length) return [];
  const keys = [legacyAppearanceFingerprint(row)];
  // Older historical row editors sent AUTO even for a blank responsible.
  // The only contact change recoverable from that variant is an optional invalid phone:
  // originalPhone was retained verbatim and the old hash treated both values as null.
  const metadata = row.metadata;
  if (
    metadata.intakeMode === 'HISTORICAL' &&
    row.phone &&
    metadata.originalPhone === row.phone &&
    !contactKeys(row.email, row.phone).phoneKey &&
    contactKeys(row.email, row.phone).emailKey &&
    importContactErrors({ ...row, phone: '' }).length === 0
  ) {
    keys.push(
      legacyAppearanceFingerprint({
        ...row,
        metadata: { ...metadata, allowDistribution: true },
      }),
    );
  }
  return keys;
}
function recoverLegacySource(row: LeadImportRow) {
  if (row.sourceFingerprint || row.leadId || row.formulaFields.length)
    return {};
  const metadata = row.metadata as Prisma.JsonObject;
  if (metadata.reviewDecisions || metadata.reviewedOriginal) return {};
  return {
    sourceFingerprint: sourceAppearanceFingerprint({ ...row, metadata }),
    legacyFingerprints: [legacyAppearanceFingerprint(row)],
  };
}

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
          status: { in: ['REVIEW', 'IMPORTING', 'PARTIAL', 'COMPLETE'] },
        },
      }))
    )
      return;
    await this.crm.maintenanceWrite(async (tx) => {
      const expired = await tx.leadImportBatch.findMany({
        where: {
          expiresAt: { lte: new Date() },
          status: { in: ['REVIEW', 'IMPORTING', 'PARTIAL', 'COMPLETE'] },
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
          configuration: Prisma.DbNull,
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
      const count = await this.crm.write((tx) =>
        this.crm.backfillContactKeysInTransaction(tx),
      );
      if (count < 100) break;
    }
  }
  async upload(
    file: { originalname: string; buffer: Buffer } | undefined,
    actor: AuthenticatedUser,
    mode: 'NEW' | 'HISTORICAL' = 'NEW',
    configuration?: ImportConfiguration,
    replacement?: { id: string; version: number },
  ) {
    assertAdmin(actor);
    if (!file || !/\.xlsx$/i.test(file.originalname))
      throw new BadRequestException('Seleccioná un archivo .xlsx');
    const parsed = await parseLeadImport(file.buffer, configuration, mode);
    await this.backfill();
    return this.crm.write(async (tx) => {
      let existing;
      if (replacement) {
        existing = await this.batch(tx, replacement.id, actor);
        this.version(existing.version, replacement.version);
        if (existing.imported || existing.status !== 'REVIEW')
          throw new ConflictException('No se puede releer un lote ya iniciado');
        await tx.leadImportRow.deleteMany({ where: { batchId: existing.id } });
      }
      const batchData = {
        ownerId: actor.id,
        mode,
        ...(configuration && {
          configuration,
        }),
        fileName: file.originalname.split(/[\\/]/).pop()!.slice(0, 255),
        sheets: parsed.sheets,
        warnings: parsed.warnings,
        total: parsed.rows.length,
        expiresAt: new Date(
          Date.now() + (mode === 'HISTORICAL' ? 90 : 1) * 24 * 60 * 60 * 1000,
        ),
      };
      const batch = existing
        ? await tx.leadImportBatch.update({
            where: { id: existing.id },
            data: { ...batchData, version: { increment: 1 } },
          })
        : await tx.leadImportBatch.create({ data: batchData });
      if (configuration) {
        const fingerprint = createHash('sha256')
          .update(JSON.stringify(configuration))
          .digest('hex');
        await tx.leadImportConfiguration.upsert({
          where: { ownerId_fingerprint: { ownerId: actor.id, fingerprint } },
          create: {
            ownerId: actor.id,
            fingerprint,
            configuration,
          },
          update: {},
        });
      }
      const resolved = await this.resolveMappings(tx, parsed.rows);
      // Keep inserts bounded; all rows belong to this atomic preparation.
      for (let i = 0; i < parsed.rows.length; i += 100)
        await tx.leadImportRow.createMany({
          data: resolved.slice(i, i + 100).map((row) => ({
            ...row,
            batchId: batch.id,
            legacyFingerprints: legacyImportKeys(row),
            reviewedMatches: [],
          })),
        });
      const preview = await this.analyze(tx, batch);
      await this.acknowledge(tx, preview.rows);
      if (preview.summary.alreadyRegistered === batch.total)
        await tx.leadImportBatch.update({
          where: { id: batch.id },
          data: {
            status: 'COMPLETE',
            completedAt: new Date(),
            omitted: batch.total,
            alreadyRegistered: batch.total,
          },
        });
      return { id: batch.id };
    });
  }
  async configurations(actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.db.leadImportConfiguration.findMany({
      where: { ownerId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, configuration: true, createdAt: true },
    });
  }
  async list(actor: AuthenticatedUser) {
    assertAdmin(actor);
    const batches = await this.db.leadImportBatch.findMany({
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
        mode: true,
        configuration: true,
        expiresAt: true,
        sheets: true,
        created: true,
        updated: true,
        merged: true,
        omitted: true,
        alreadyRegistered: true,
      },
    });
    return Promise.all(
      batches.map(async ({ sheets, ...batch }) => {
        if (
          batch.alreadyRegistered === null &&
          (batch.status === 'PARTIAL' ||
            batch.status === 'IMPORTING' ||
            batch.omitted)
        ) {
          // Older partial batches counted their unresolved rows as omitted.
          const { summary } = await this.db.$transaction(
            (tx) => this.analyze(tx, { id: batch.id, sheets }),
            { isolationLevel: 'RepeatableRead', timeout: 15_000 },
          );
          return {
            ...batch,
            result: importResult({
              ...batch,
              omitted: summary.omitted,
              alreadyRegistered: summary.alreadyRegistered,
            }),
          };
        }
        return { ...batch, result: importResult(batch) };
      }),
    );
  }
  private managementValue(row: LeadImportRow) {
    const value = (row.metadata as Prisma.JsonObject).currentManagement;
    return typeof value === 'string' ? value : '';
  }
  private async analyze(tx: Tx, batch: { id: string; sheets: string[] }) {
    const storedRows = await tx.leadImportRow.findMany({
      where: { batchId: batch.id },
      orderBy: [{ sheet: 'asc' }, { rowNumber: 'asc' }],
    });
    const rows = storedRows.map((row) => ({
      ...row,
      ...recoverLegacySource(row),
    }));
    const fingerprints = rows.map((row) => ({
      current: appearanceFingerprint(row),
      legacy: row.legacyFingerprints,
    }));
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
        where: {
          fingerprint: {
            in: [
              ...new Set(
                fingerprints.flatMap(({ current, legacy }) => [
                  current,
                  ...legacy,
                ]),
              ),
            ],
          },
        },
        select: { fingerprint: true },
      }),
    ]);
    const stored = new Set(appearances.map((entry) => entry.fingerprint));
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
      new Set(
        fingerprints
          .filter(
            ({ current, legacy }) =>
              stored.has(current) || legacy.some((key) => stored.has(key)),
          )
          .map(({ current }) => current),
      ),
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
    const active = plan.rows.filter(
      (row) =>
        row.active && !row.leadId && !row.replay && row.decision !== 'OMIT',
    );
    const groups = new Map<string, typeof active>();
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
      problems: Object.fromEntries(
        ['CONFIGURATION', 'CONTACT', 'IDENTITY', 'OWNER', 'CLASSIFICATION'].map(
          (problem) => [
            problem,
            plan.rows.filter(
              (row) =>
                row.active &&
                !row.leadId &&
                !row.replay &&
                importProblem(row, problem),
            ).length,
          ],
        ),
      ),
      managementValues: [
        ...new Set(active.map((row) => this.managementValue(row))),
      ].map((value) => ({
        value,
        count: active.filter((row) => this.managementValue(row) === value)
          .length,
      })),
      currentResponsibles: [
        ...new Set(
          active.map(
            (row) => portfolioMetadata(row.metadata).currentResponsible,
          ),
        ),
      ].map((alias) => ({
        alias,
        count: active.filter(
          (row) => portfolioMetadata(row.metadata).currentResponsible === alias,
        ).length,
      })),
      availableSheets: [...new Set(rows.map((row) => row.sheet))],
      groups: [...groups.values()]
        .map((same) => ({
          sheet: same[0].sheet,
          group: same[0].group,
          count: same.length,
          blocked: same.filter(
            (row) =>
              !row.sourceId ||
              !sources.some((source) => source.id === row.sourceId),
          ).length,
          sourceId: same.every((row) => row.sourceId === same[0].sourceId)
            ? same[0].sourceId
            : null,
        }))
        .sort(
          (a, b) =>
            b.blocked - a.blocked ||
            a.sheet.localeCompare(b.sheet) ||
            a.group.localeCompare(b.group),
        ),
      advisors: [...advisors.values()].map((same) => ({
        count: same.length,
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
  async get(
    id: string,
    actor: AuthenticatedUser,
    page = 1,
    filter = 'ALL',
    selection: import('./lead-import.dto').ImportSelectionDto = {},
  ) {
    return this.db.$transaction(
      async (tx) => {
        const batch = await this.batch(tx, id, actor);
        const preview = await this.analyze(tx, batch);
        const filtered = preview.rows.filter(
          (row) =>
            matchesImportSelection(row, selection) &&
            (filter === 'ALL' ||
              (filter === 'DUPLICATES' && row.duplicate) ||
              (filter === 'REVIEW' && row.action === 'REVIEW') ||
              filter === row.action),
        );
        filtered.sort(
          (a, b) =>
            Number(b.portfolioClass === 'ACTIVE') -
            Number(a.portfolioClass === 'ACTIVE'),
        );
        const items = filtered
          .slice((page - 1) * 50, page * 50)
          .map(
            ({
              reviewedMatches: _reviewed,
              externalMatches: _external,
              sourceFingerprint: _sourceFingerprint,
              legacyFingerprints: _legacyFingerprints,
              ...row
            }) => {
              void _reviewed;
              void _external;
              void _sourceFingerprint;
              void _legacyFingerprints;
              return row;
            },
          );
        return {
          ...batch,
          ...preview,
          result: importResult(
            batch.status === 'REVIEW' || batch.alreadyRegistered === null
              ? {
                  ...batch,
                  omitted: preview.summary.omitted,
                  alreadyRegistered: preview.summary.alreadyRegistered,
                }
              : batch,
          ),
          rows: undefined,
          items,
          page,
          pageSize: 50,
          rowTotal: filtered.length,
          selectableTotal: filtered.filter(
            (row) => row.active && !row.leadId && !row.replay,
          ).length,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15_000 },
    );
  }
  async patch(id: string, dto: ImportPatchDto, actor: AuthenticatedUser) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      this.version(batch.version, dto.version);
      if (dto.duplicates || dto.bulkCleanup || dto.bulk)
        this.checkReview(
          (await this.analyze(tx, batch)).reviewToken,
          dto.reviewToken,
        );
      if (batch.status === 'COMPLETE' || (batch.imported > 0 && dto.sheets))
        throw new ConflictException(
          'La carga ya comenzó; solo podés revisar filas pendientes',
        );
      if (dto.bulk) {
        const preview = await this.analyze(tx, batch);
        const { action, selection, expectedCount, assignedToId } = dto.bulk;
        const matched = preview.rows.filter(
          (row) =>
            row.active &&
            !row.leadId &&
            !row.replay &&
            matchesImportSelection(row, selection),
        );
        if (matched.length !== expectedCount)
          throw new ConflictException(
            'El alcance cambió. Revisá la cantidad antes de aplicar',
          );
        if (action === 'ASSIGN') {
          if (!assignedToId)
            throw new BadRequestException('Elegí un responsable actual');
          await this.validateManualResponsible(tx, assignedToId);
        }
        for (const row of matched) {
          const metadata = row.metadata as Prisma.InputJsonObject;
          if (
            ['ACTIVE', 'HISTORICAL', 'UNCLASSIFIED', 'DISTRIBUTE'].includes(
              action,
            ) &&
            batch.mode !== 'HISTORICAL'
          )
            throw new BadRequestException(
              'La clasificación de migración requiere modalidad histórica',
            );
          await tx.leadImportRow.update({
            where: { id: row.id },
            data: {
              sourceFingerprint: row.sourceFingerprint,
              legacyFingerprints: row.legacyFingerprints,
              ...(['OMIT', 'AUTO'].includes(action)
                ? { decision: action }
                : {}),
              ...(action === 'ASSIGN'
                ? { assignedToId, assignmentResolved: true }
                : {}),
              ...(action === 'DISTRIBUTE'
                ? { assignedToId: null, assignmentResolved: true }
                : {}),
              formulaFields: row.formulaFields.filter(
                (field) =>
                  !(
                    field === 'currentManagement' &&
                    ['ACTIVE', 'HISTORICAL', 'UNCLASSIFIED'].includes(action)
                  ) &&
                  !(
                    field === 'currentResponsible' &&
                    ['ASSIGN', 'DISTRIBUTE'].includes(action)
                  ),
              ),
              metadata: {
                ...metadata,
                ...(['ACTIVE', 'HISTORICAL', 'UNCLASSIFIED'].includes(action)
                  ? { portfolioClass: action }
                  : {}),
                ...(action === 'DISTRIBUTE' ? { allowDistribution: true } : {}),
                reviewDecisions: [
                  ...(Array.isArray(metadata.reviewDecisions)
                    ? (metadata.reviewDecisions as Prisma.InputJsonValue[])
                    : []),
                  {
                    action,
                    actorId: actor.id,
                    at: new Date().toISOString(),
                    assignedToId: assignedToId ?? null,
                  },
                ],
              },
            },
          });
        }
      }
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
              fingerprint: row.sourceFingerprint,
              legacy: row.legacyFingerprints,
              phone: cleaned.phone,
              formulas: cleaned.formulaFields,
              metadata: cleaned.metadata,
            };
          });
        if (changes.length)
          await tx.$executeRaw`
          UPDATE lead_import_rows AS r SET email=v.email, phone=v.phone,
            "formulaFields"=ARRAY(SELECT jsonb_array_elements_text(v.formulas)),
            metadata=v.metadata, "reviewedMatches"=ARRAY[]::TEXT[],
            "sourceFingerprint"=v.fingerprint,
            "legacyFingerprints"=ARRAY(SELECT jsonb_array_elements_text(v.legacy))
          FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb)
            AS v(id TEXT,email TEXT,phone TEXT,formulas JSONB,metadata JSONB,fingerprint TEXT,legacy JSONB)
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
        if (
          batch.mode === 'HISTORICAL' &&
          mapping.assignedToId !== undefined &&
          !mapping.currentResponsible
        )
          throw new BadRequestException(
            'El asesor histórico no determina la responsabilidad actual',
          );
        if (mapping.currentResponsible && mapping.assignedToId === null)
          throw new BadRequestException(
            'Autorizá el reparto con la acción explícita de cartera',
          );
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
            ? aliases.has(
                importKey(
                  mapping.currentResponsible
                    ? portfolioMetadata(row.metadata).currentResponsible
                    : row.advisor,
                ),
              )
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
                ? [...aliases].filter(Boolean).map((key) => ({
                    kind: mapping.currentResponsible
                      ? 'CURRENT_RESPONSIBLE'
                      : 'ADVISOR',
                    scope: '*',
                    key,
                  }))
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
          deletedAt: null,
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
        portfolioClass,
        excludePending: _excludePending,
        ...data
      } = dto;
      void _version;
      void _excludePending;
      if (portfolioClass && batch.mode !== 'HISTORICAL')
        throw new BadRequestException(
          'La clasificación de migración requiere modalidad histórica',
        );
      const contactChanged =
        (dto.email !== undefined &&
          dto.email.trim().toLowerCase() !== row.email) ||
        (dto.phone !== undefined && dto.phone.trim() !== row.phone);
      const metadata = row.metadata as Prisma.InputJsonObject;
      const previous = metadata.reviewedOriginal;
      const reviewedOriginal =
        previous && typeof previous === 'object' && !Array.isArray(previous)
          ? (previous as Prisma.InputJsonObject)
          : {};
      if (acknowledgeDuplicates)
        this.checkReview(
          (await this.analyze(tx, batch)).reviewToken,
          reviewToken,
        );
      await tx.leadImportRow.update({
        where: { id: rowId },
        data: {
          ...data,
          ...recoverLegacySource(row),
          metadata: {
            ...metadata,
            ...(contactChanged && {
              reviewedOriginal: {
                ...(dto.email !== undefined &&
                  dto.email.trim().toLowerCase() !== row.email && {
                    email: row.email,
                  }),
                ...(dto.phone !== undefined &&
                  dto.phone.trim() !== row.phone && { phone: row.phone }),
                ...reviewedOriginal,
              },
            }),
            ...(portfolioClass ? { portfolioClass } : {}),
            ...(batch.mode === 'HISTORICAL' && assignedToId !== undefined
              ? { allowDistribution: assignedToId === null }
              : {}),
            reviewDecisions: [
              ...(Array.isArray(
                (row.metadata as Prisma.InputJsonObject).reviewDecisions,
              )
                ? ((row.metadata as Prisma.InputJsonObject)
                    .reviewDecisions as Prisma.InputJsonValue[])
                : []),
              {
                actorId: actor.id,
                at: new Date().toISOString(),
                before: {
                  name: row.name,
                  email: row.email,
                  phone: row.phone,
                  observations: row.observations,
                  assignedToId: row.assignedToId,
                },
                changes: JSON.parse(
                  JSON.stringify(dto),
                ) as Prisma.InputJsonValue,
              },
            ],
          },
          formulaFields: row.formulaFields.filter(
            (field) =>
              (field === 'currentManagement'
                ? portfolioClass
                : field === 'currentResponsible'
                  ? assignedToId
                  : dto[
                      field as 'name' | 'email' | 'phone' | 'observations'
                    ]) === undefined,
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
      if (batch.status === 'COMPLETE') {
        if (batch.alreadyRegistered !== null) return this.progress(batch);
        const { summary } = await this.analyze(tx, batch);
        return this.progress({
          ...batch,
          omitted: summary.omitted,
          alreadyRegistered: summary.alreadyRegistered,
        });
      }
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
      if (preview.summary.unreviewedReady)
        throw new ConflictException(
          'Aparecieron coincidencias nuevas. Revisalas y confirmá la revisión de duplicados',
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
              assignedToId: row.consolidatedAssignedToId,
              mode: batch.mode,
              portfolioClass: row.portfolioClass ?? 'UNCLASSIFIED',
              allowDistribution: row.allowDistribution,
              originDate: portfolioMetadata(row.metadata).originDate
                ? new Date(portfolioMetadata(row.metadata).originDate!)
                : null,
              declaredLastManagedAt: portfolioMetadata(row.metadata).lastManaged
                ? new Date(portfolioMetadata(row.metadata).lastManaged!)
                : null,
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
          data: { leadId, outcome, sourceFingerprint: row.sourceFingerprint },
        });
      }
      const complete = selected.length <= 100;
      const updated = await tx.leadImportBatch.update({
        where: { id },
        data: {
          status: complete
            ? preview.summary.invalid
              ? 'PARTIAL'
              : 'COMPLETE'
            : 'IMPORTING',
          version: { increment: 1 },
          imported: { increment: Math.min(100, selected.length) },
          created: { increment: created },
          updated: { increment: updatedTargets.size },
          merged: { increment: merged },
          excluded: { increment: excluded },
          omitted: preview.summary.omitted,
          alreadyRegistered: preview.summary.alreadyRegistered,
          ...(complete && {
            completedAt: new Date(),
          }),
        },
      });
      return this.progress(updated);
    });
  }
  private progress(
    batch: BatchCounts & {
      id: string;
      status: string;
      version: number;
      excluded: number;
    },
  ) {
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
      result: importResult(batch),
    };
  }
}
