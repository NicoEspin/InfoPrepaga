import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdmin } from '../common/authorization';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PageDto } from '../crm/crm.dto';
import { ReportInputDto, SaveReportDto } from './reports.dto';
import {
  AggregateRow,
  calculationVersion,
  metrics,
  period,
  Snapshot,
} from './report-calculation';

const personName = (p: {
  id: string;
  firstName: string | null;
  lastName: string | null;
}) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ') ||
  `Responsable ${p.id.slice(0, 8)}`;
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  async catalogs(actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => this.readCatalogs(tx), {
      isolationLevel: 'RepeatableRead',
    });
  }
  private async readCatalogs(tx: Prisma.TransactionClient) {
    const [sources, people] = await Promise.all([
      tx.leadSource.findMany({
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      tx.user.findMany({
        where: {
          OR: [
            {
              roles: {
                some: { role: { name: { in: ['ADMIN', 'VENDEDOR'] } } },
              },
            },
            { assignedLeads: { some: {} } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, isActive: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      sources,
      responsibles: people.map((p) => ({
        id: p.id,
        name: personName(p),
        isActive: p.isActive,
      })),
    };
  }
  async preview(dto: ReportInputDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.prisma.$transaction((tx) => this.calculate(tx, dto, actor), {
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
  }
  private requestHash(dto: ReportInputDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          name: dto.name.trim(),
          from: dto.from,
          to: dto.to,
          sourceIds: [...dto.sourceIds].sort(),
          responsibleIds: [...dto.responsibleIds].sort(),
          investments: [...dto.investments]
            .map((i) => ({
              sourceId: i.sourceId,
              amount:
                i.amount === null
                  ? null
                  : new Prisma.Decimal(i.amount).toFixed(2),
            }))
            .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
        }),
      )
      .digest('hex');
  }
  async save(dto: SaveReportDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const requestHash = this.requestHash(dto);
    const existing = async () => {
      const saved = await this.prisma.commercialReport.findUnique({
        where: {
          authorId_operationKey: {
            authorId: actor.id,
            operationKey: dto.operationKey,
          },
        },
      });
      if (saved && saved.requestHash !== requestHash)
        throw new ConflictException(
          'La clave de guardado ya se usó con otros filtros',
        );
      return saved;
    };
    const previous = await existing();
    if (previous) return previous;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const snapshot = await this.calculate(tx, dto, actor);
          return tx.commercialReport.create({
            data: {
              name: snapshot.name,
              authorId: actor.id,
              generatedAt: new Date(snapshot.generatedAt),
              operationKey: dto.operationKey,
              requestHash,
              snapshot,
            },
          });
        },
        { isolationLevel: 'RepeatableRead', timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const saved = await existing();
        if (saved) return saved;
      }
      throw error;
    }
  }
  async list(query: PageDto, actor: AuthenticatedUser) {
    assertAdmin(actor);
    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.commercialReport.findMany({
          select: { id: true, name: true, generatedAt: true, authorId: true },
          orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        total: await tx.commercialReport.count(),
        page: query.page,
        pageSize: query.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(id: string, actor: AuthenticatedUser) {
    assertAdmin(actor);
    const saved = await this.prisma.commercialReport.findUnique({
      where: { id },
    });
    if (!saved) throw new NotFoundException('Reporte no encontrado');
    return saved;
  }
  private async calculate(
    tx: Prisma.TransactionClient,
    dto: ReportInputDto,
    actor: AuthenticatedUser,
  ): Promise<Snapshot> {
    assertAdmin(actor);
    if (!dto.name.trim()) throw new BadRequestException('Ingresá un nombre');
    // Establish the MVCC snapshot before taking the generation clock. Writes committed afterwards are excluded.
    const catalogs = await this.readCatalogs(tx);
    const now = new Date();
    const range = period(dto.from, dto.to, now);
    const sources = dto.sourceIds.length
      ? catalogs.sources.filter((s) => dto.sourceIds.includes(s.id))
      : catalogs.sources;
    const responsibles = dto.responsibleIds.length
      ? catalogs.responsibles.filter((p) => dto.responsibleIds.includes(p.id))
      : catalogs.responsibles;
    if (
      (dto.sourceIds.length && sources.length !== dto.sourceIds.length) ||
      (dto.responsibleIds.length &&
        responsibles.length !== dto.responsibleIds.length)
    )
      throw new BadRequestException(
        'Selección de canales o responsables inválida',
      );
    if (
      new Set(dto.investments.map((i) => i.sourceId)).size !==
        dto.investments.length ||
      dto.investments.some((i) => !sources.some((s) => s.id === i.sourceId))
    )
      throw new BadRequestException(
        'Inversiones duplicadas o de canales no incluidos',
      );
    const sourceFilterA = dto.sourceIds.length
      ? Prisma.sql`l."entrySourceId" IN (${Prisma.join(dto.sourceIds)})`
      : Prisma.sql`TRUE`;
    const sourceFilterB = dto.sourceIds.length
      ? Prisma.sql`m."sourceId" IN (${Prisma.join(dto.sourceIds)})`
      : Prisma.sql`TRUE`;
    const ownerFilterA = dto.responsibleIds.length
      ? Prisma.sql`a.owner IN (${Prisma.join(dto.responsibleIds)})`
      : Prisma.sql`TRUE`;
    const ownerFilterB = dto.responsibleIds.length
      ? Prisma.sql`m."responsibleId" IN (${Prisma.join(dto.responsibleIds)})`
      : Prisma.sql`TRUE`;
    const firstAssignment = Prisma.sql`first_assignment AS (
        SELECT DISTINCT ON (a."leadId") a."leadId",
          CASE WHEN EXISTS (SELECT 1 FROM lead_activities other WHERE other."leadId"=a."leadId" AND other.kind='assigned'
            AND other."createdAt"=a."createdAt" AND other.detail->>'assignedToId' IS DISTINCT FROM a.detail->>'assignedToId'
            AND (other.detail->>'leadVersion' IS NULL OR a.detail->>'leadVersion' IS NULL))
            THEN '__UNKNOWN__' ELSE a.detail->>'assignedToId' END AS owner,
          a."createdAt" AT TIME ZONE 'UTC' AS "createdAt"
        FROM lead_activities a WHERE a.kind='assigned'
        ORDER BY a."leadId", a."createdAt", COALESCE((a.detail->>'leadVersion')::integer, 0), a.id
      )`;
    // Reuse the historical ownership/date scope for metrics and diagnostics.
    const enteredScope = Prisma.sql`
      l."createdAt" >= (${range.start}::timestamptz AT TIME ZONE 'UTC')
      AND l."createdAt" < (${range.end}::timestamptz AT TIME ZONE 'UTC')
      AND l."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      AND (${dto.responsibleIds.length === 0} OR
        (a."createdAt" < ${range.end} AND a."createdAt" <= ${now} AND ${ownerFilterA}))`;
    // Aggregate in PostgreSQL. No contact fields leave the database and no per-lead application queries.
    const rows = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
      WITH ${firstAssignment}, at_cut AS (
        SELECT DISTINCT ON ("leadId") "leadId", "to", "effectiveAt", "sourceId", "responsibleId"
        FROM commercial_movements WHERE "effectiveAt" < ${range.end} AND "effectiveAt" <= ${now}
        ORDER BY "leadId", "effectiveAt" DESC, "leadVersion" DESC
      ), population AS (
        SELECT 'A' AS population, l."entrySourceId" AS "sourceId",
          CASE WHEN a."createdAt" < ${range.end} AND a."createdAt" <= ${now} THEN a.owner
            WHEN a."leadId" IS NULL AND l."assignedToId" IS NOT NULL THEN '__UNKNOWN__' ELSE NULL END AS "responsibleId",
          CASE WHEN l."commercialStartedAt" >= ${range.end} OR l."commercialStartedAt" > ${now} THEN 'UNKNOWN'
               ELSE COALESCE(m."to"::text,'NEW') END AS stage, COALESCE(m."to"='CLOSED',false) AS won
        FROM leads l LEFT JOIN first_assignment a ON a."leadId"=l.id
        LEFT JOIN at_cut m ON m."leadId"=l.id
        WHERE ${enteredScope} AND ${sourceFilterA}
        UNION ALL
        SELECT 'B', m."sourceId", m."responsibleId", 'CLOSED', true FROM at_cut m
        WHERE m."to"='CLOSED' AND m."effectiveAt" >= ${range.start} AND ${sourceFilterB} AND ${ownerFilterB}
      ) SELECT population, "sourceId", "responsibleId", stage, won, count(*) AS count
        FROM population GROUP BY population, "sourceId", "responsibleId", stage, won
    `);
    const selectedSources = sources.map((s) => ({
      ...s,
      investment:
        dto.investments.find((i) => i.sourceId === s.id)?.amount ?? null,
    }));
    const unknownSource = rows.some((r) => r.sourceId === null);
    const unknownResponsible = rows.some(
      (r) => r.responsibleId === '__UNKNOWN__',
    );
    const selectedPeople: Snapshot['responsibles'] = [
      ...responsibles,
      ...(dto.responsibleIds.length
        ? []
        : [{ id: null, name: 'Sin asignar', isActive: true }]),
      ...(unknownResponsible
        ? [
            {
              id: '__UNKNOWN__',
              name: 'Sin atribución de responsable',
              isActive: true,
            },
          ]
        : []),
    ];
    const author = await tx.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { id: true, firstName: true, lastName: true },
    });
    const [history] = await tx.$queryRaw<
      { incomplete: bigint; unknownOrigins: bigint }[]
    >(Prisma.sql`WITH ${firstAssignment}
      SELECT count(*) FILTER (WHERE ${sourceFilterA}
        AND l."commercialStartedAt" > (l."createdAt" AT TIME ZONE 'UTC')
        AND l."commercialStartedAt" > ${range.start}) AS incomplete,
        count(*) FILTER (WHERE l."entrySourceId" IS NULL) AS "unknownOrigins"
      FROM leads l LEFT JOIN first_assignment a ON a."leadId"=l.id
      WHERE ${enteredScope}`);
    const incomplete = Number(history.incomplete);
    // Also disclose origins excluded by a specific channel filter, but only
    // within the requested period and historical responsible selection.
    const unknownOrigins = Number(history.unknownOrigins);
    const allResponsibles = !dto.responsibleIds.length;
    return {
      calculationVersion,
      name: dto.name.trim(),
      generatedAt: now.toISOString(),
      author: { id: author.id, name: personName(author) },
      from: dto.from,
      to: dto.to,
      timezone: 'America/Argentina/Buenos_Aires',
      cutoff: range.cutoff.toISOString(),
      partial: range.partial,
      allResponsibles,
      sources: selectedSources,
      responsibles: selectedPeople,
      summary: metrics(
        rows,
        [
          ...selectedSources.map((s) => s.investment),
          ...(unknownSource ? [null] : []),
        ],
        allResponsibles,
      ),
      bySource: [
        ...selectedSources.map((s) => ({
          id: s.id,
          name: s.name,
          metrics: metrics(
            rows.filter((r) => r.sourceId === s.id),
            [s.investment],
            allResponsibles,
          ),
        })),
        ...(unknownSource
          ? [
              {
                id: null,
                name: 'Sin atribución de origen',
                metrics: metrics(
                  rows.filter((r) => r.sourceId === null),
                  [null],
                  false,
                ),
              },
            ]
          : []),
      ],
      byResponsible: selectedPeople.map((p) => ({
        id: p.id,
        name: p.name,
        metrics: metrics(
          rows.filter((r) => r.responsibleId === p.id),
          [],
          false,
        ),
      })),
      warnings: [
        'Ingresados: canal al ingresar y primer responsable asignado hasta el corte. Cierres del período: canal y responsable al cerrar. Conversión y costos mantienen la atribución de ingreso.',
        'Cierres de los ingresados / ingresados × 100. Costo por lead = inversión / ingresados. Costo por cierre = inversión / cierres de los ingresados. Sin denominador: Sin datos.',
        ...(incomplete
          ? [
              'Hay registros cuyo seguimiento comercial comenzó después del inicio solicitado. No se infieren cierres anteriores; los cortes previos al seguimiento muestran Sin historial de etapa.',
            ]
          : []),
        ...(unknownOrigins
          ? [
              `${unknownOrigins} ingresados tienen origen histórico desconocido. Se incluyen como Sin atribución de origen solo al elegir Todos los canales; con canales específicos se excluyen.`,
            ]
          : []),
        ...(unknownResponsible
          ? [
              'Hay asignaciones iniciales desconocidas o simultáneas sin orden comprobable. Se muestran como Sin atribución de responsable, sin asignarlas a personas actuales.',
            ]
          : []),
        ...(range.partial
          ? [
              'Reporte parcial: la inversión declarada corresponde al período completo y no se prorratea.',
            ]
          : []),
        ...(!allResponsibles
          ? [
              'Inversión del canal solo como referencia; los costos se ocultan al seleccionar responsables específicos.',
            ]
          : []),
        ...(selectedSources.some((s) => s.investment === null)
          ? [
              'Inversión informada parcial. No se calculan costos globales con inversión incompleta.',
            ]
          : []),
        'No se atribuye inversión a personas. Los cierres de leads anteriores no integran la conversión de los ingresados.',
      ],
    };
  }
}
