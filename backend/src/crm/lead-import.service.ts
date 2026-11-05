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
import { createHash } from 'node:crypto';
import { importContactErrors, parseLeadImport } from './lead-import.parser';
import { ImportPatchDto, ImportRowPatchDto } from './lead-import.dto';
type Tx = Prisma.TransactionClient;
type Match = {
  kind: 'email' | 'phone';
  leadId?: string;
  rowId?: string;
  name: string;
  sheet?: string;
  rowNumber?: number;
};

@Injectable()
export class LeadImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadImportService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleanup?: Promise<void>;
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
      .catch(() => {
        this.logger.error(
          'No se pudo limpiar la revisión de importaciones; se reintentará',
        );
      })
      .finally(() => {
        this.cleanup = undefined;
      });
  }
  async purgeExpired() {
    await this.crm.write(async (tx) => {
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
      // Keep inserts bounded; all rows belong to this atomic preparation.
      for (let i = 0; i < parsed.rows.length; i += 100)
        await tx.leadImportRow.createMany({
          data: parsed.rows.slice(i, i + 100).map((row) => ({
            ...row,
            batchId: batch.id,
            reviewedMatches: [],
            assignmentResolved: !row.advisor,
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
    const active = rows.filter((row) => batch.sheets.includes(row.sheet));
    const keys = active.map((row) => contactKeys(row.email, row.phone));
    const emailKeys = [
      ...new Set(
        keys.map((key) => key.emailKey).filter((key): key is string => !!key),
      ),
    ];
    const phoneKeys = [
      ...new Set(
        keys.map((key) => key.phoneKey).filter((key): key is string => !!key),
      ),
    ];
    const ownIds = rows
      .map((row) => row.leadId)
      .filter((id): id is string => !!id);
    const [leads, sources, sellers] = await Promise.all([
      tx.lead.findMany({
        where: {
          OR: [
            { emailKey: { in: emailKeys } },
            { phoneKey: { in: phoneKeys } },
          ],
          ...(ownIds.length && { id: { notIn: ownIds } }),
        },
        select: { id: true, name: true, emailKey: true, phoneKey: true },
      }),
      tx.leadSource.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
      tx.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } },
          },
        },
        select: { id: true },
      }),
    ]);
    const sourceIds = new Set(sources.map((source) => source.id));
    const sellerIds = new Set(sellers.map((seller) => seller.id));
    const external = new Map<string, typeof leads>();
    const internal = new Map<string, LeadImportRow[]>();
    for (const lead of leads)
      for (const key of [
        lead.emailKey && `e:${lead.emailKey}`,
        lead.phoneKey && `p:${lead.phoneKey}`,
      ])
        if (key) external.set(key, [...(external.get(key) ?? []), lead]);
    for (const row of active) {
      const key = contactKeys(row.email, row.phone);
      for (const value of [
        key.emailKey && `e:${key.emailKey}`,
        key.phoneKey && `p:${key.phoneKey}`,
      ])
        if (value) internal.set(value, [...(internal.get(value) ?? []), row]);
    }
    const selectedKeys = new Set<string>();
    const result = rows.map((row) => {
      const key = contactKeys(row.email, row.phone);
      const matches: Match[] = [];
      for (const [kind, value] of [
        ['email', key.emailKey && `e:${key.emailKey}`],
        ['phone', key.phoneKey && `p:${key.phoneKey}`],
      ] as const) {
        if (!value) continue;
        for (const lead of external.get(value) ?? [])
          matches.push({ kind, leadId: lead.id, name: lead.name });
        for (const other of (internal.get(value) ?? [])
          .filter((other) => other.id !== row.id)
          .slice(0, 20))
          matches.push({
            kind,
            rowId: other.id,
            name: other.name,
            sheet: other.sheet,
            rowNumber: other.rowNumber,
          });
      }
      const errors = importContactErrors(row);
      if (!row.sourceId || !sourceIds.has(row.sourceId))
        errors.push('Confirmá un origen activo');
      if (!row.assignmentResolved)
        errors.push(
          'Relacioná el asesor con un responsable o elegí reparto automático',
        );
      if (row.assignedToId && !sellerIds.has(row.assignedToId))
        errors.push('El responsable no está disponible');
      const active = batch.sheets.includes(row.sheet);
      const values = [
        key.emailKey && `e:${key.emailKey}`,
        key.phoneKey && `p:${key.phoneKey}`,
      ].filter((value): value is string => !!value);
      const externalMatches = [
        ...new Set(
          matches.filter((match) => match.leadId).map((match) => match.leadId!),
        ),
      ].sort();
      const duplicate = matches.length > 0;
      const selected =
        active &&
        !row.leadId &&
        row.decision !== 'OMIT' &&
        (row.decision === 'INCLUDE' ||
          (!externalMatches.length &&
            !values.some((value) => selectedKeys.has(value))));
      // Invalid candidates must not suppress the first valid row in their group.
      if (active && (row.leadId || (selected && !errors.length)))
        for (const value of values) selectedKeys.add(value);
      const requiresReview =
        active &&
        !row.leadId &&
        row.decision !== 'OMIT' &&
        externalMatches.some((id) => !row.reviewedMatches.includes(id));
      return {
        ...row,
        active,
        errors,
        matches,
        externalMatches,
        duplicate,
        selected,
        requiresReview,
      };
    });
    return {
      reviewToken: createHash('sha256')
        .update(
          JSON.stringify(result.map((row) => [row.id, row.externalMatches])),
        )
        .digest('hex'),
      rows: result,
      availableSheets: [...new Set(rows.map((row) => row.sheet))],
      groups: [
        ...new Set(active.map((row) => `${row.sheet}\u0000${row.group}`)),
      ].map((key) => {
        const [sheet, group] = key.split('\u0000');
        const same = active.filter(
          (row) => row.sheet === sheet && row.group === group && !row.leadId,
        );
        return {
          sheet,
          group,
          sourceId:
            same.length &&
            same.every((row) => row.sourceId === same[0].sourceId)
              ? same[0].sourceId
              : null,
        };
      }),
      advisors: [
        ...new Set(
          active
            .filter((row) => row.advisor && !row.leadId)
            .map((row) => row.advisor),
        ),
      ].map((advisor) => {
        const same = active.filter(
          (row) => row.advisor === advisor && !row.leadId,
        );
        return {
          advisor,
          resolved: same.every((row) => row.assignmentResolved),
          assignedToId: same.every(
            (row) => row.assignedToId === same[0].assignedToId,
          )
            ? same[0].assignedToId
            : null,
        };
      }),
      summary: {
        imported: rows.filter((row) => row.leadId).length,
        omitted: result.filter((row) => !row.leadId && !row.selected).length,
        invalid: result.filter((row) => row.selected && row.errors.length)
          .length,
        pending: result.filter((row) => row.selected).length,
        duplicates: result.filter(
          (row) => row.active && row.duplicate && !row.leadId,
        ).length,
        requiresReview: result.some((row) => row.requiresReview),
      },
    };
  }
  private async acknowledge(
    tx: Tx,
    rows: Array<{
      id: string;
      externalMatches: string[];
      reviewedMatches: string[];
    }>,
  ) {
    for (const row of rows)
      if (
        row.externalMatches.join(',') !==
        [...row.reviewedMatches].sort().join(',')
      )
        await tx.leadImportRow.update({
          where: { id: row.id },
          data: { reviewedMatches: row.externalMatches },
        });
  }
  async get(id: string, actor: AuthenticatedUser, page = 1) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      const preview = await this.analyze(tx, batch);
      const items = preview.rows
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
        rowTotal: preview.rows.length,
      };
    });
  }
  async patch(id: string, dto: ImportPatchDto, actor: AuthenticatedUser) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      this.version(batch.version, dto.version);
      if (dto.duplicates)
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
        await tx.leadImportRow.updateMany({
          where: {
            batchId: id,
            leadId: null,
            ...(mapping.sheet && { sheet: mapping.sheet }),
            ...(mapping.group !== undefined && { group: mapping.group }),
            ...(mapping.advisor !== undefined && { advisor: mapping.advisor }),
          },
          data: {
            ...(mapping.sourceId !== undefined && {
              sourceId: mapping.sourceId,
            }),
            ...(mapping.assignedToId !== undefined && {
              assignedToId: mapping.assignedToId,
              assignmentResolved: true,
            }),
          },
        });
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
        ...data
      } = dto;
      void _version;
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
  async confirm(id: string, version: number, actor: AuthenticatedUser) {
    return this.crm.write(async (tx) => {
      const batch = await this.batch(tx, id, actor);
      if (batch.status === 'COMPLETE')
        return {
          id,
          status: 'COMPLETE',
          version: batch.version,
          imported: batch.imported,
          omitted: batch.omitted,
        };
      this.version(batch.version, version);
      const preview = await this.analyze(tx, batch);
      if (preview.summary.requiresReview)
        throw new ConflictException(
          'Aparecieron coincidencias nuevas. Revisalas y confirmá la revisión de duplicados',
        );
      if (preview.summary.invalid)
        throw new BadRequestException(
          'Corregí u omití las filas con errores antes de importar',
        );
      const selected = preview.rows.filter((row) => row.selected);
      for (const row of selected.slice(0, 100)) {
        const keys = contactKeys(row.email, row.phone);
        const metadata = row.metadata as Prisma.InputJsonObject;
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
              ...metadata,
              batchId: id,
              sheet: row.sheet,
              rowNumber: row.rowNumber,
            },
            batchId: id,
            sheet: row.sheet,
            rowNumber: row.rowNumber,
          },
        );
        await tx.leadImportRow.update({
          where: { id: row.id },
          data: { leadId: lead.id },
        });
      }
      const complete = selected.length <= 100;
      const updated = await tx.leadImportBatch.update({
        where: { id },
        data: {
          status: complete ? 'COMPLETE' : 'IMPORTING',
          version: { increment: 1 },
          imported: { increment: Math.min(100, selected.length) },
          ...(complete && {
            completedAt: new Date(),
            omitted: preview.rows.filter((row) => !row.leadId && !row.selected)
              .length,
          }),
        },
      });
      return {
        id,
        status: updated.status,
        version: updated.version,
        imported: updated.imported,
        omitted: updated.omitted,
      };
    });
  }
}
