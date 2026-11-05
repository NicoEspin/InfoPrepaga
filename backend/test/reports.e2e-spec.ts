import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, CommercialStage } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import type { Snapshot } from '../src/reports/report-calculation';
import { ReportsService } from '../src/reports/reports.service';
import { PipelineService } from '../src/crm/pipeline.service';
import { R2Service } from '../src/crm/r2.service';
import { CrmService } from '../src/crm/crm.service';

const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite('Reports and persistent pipeline with isolated PostgreSQL', () => {
  let app: INestApplication<App>, db: PrismaClient;
  let admin: string,
    seller: string,
    other: string,
    adminId: string,
    sellerId: string,
    otherId: string;
  let sourceId: string, source2: string, oldLead: string;
  let reportId: string, stored: Snapshot;
  const schema = `reports_test_${randomUUID().replaceAll('-', '')}`;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const password = 'Synthetic-reports-test-2026';
  const input = () => ({
    name: 'Análisis sintético de Córdoba y José',
    from: '2026-05-01',
    to: '2026-05-31',
    sourceIds: [],
    responsibleIds: [],
    investments: [
      { sourceId, amount: '200000.10' },
      { sourceId: source2, amount: '0.00' },
    ],
  });
  async function lead(
    at: string,
    owner: string | null = sellerId,
    source: string | null = sourceId,
    start = '2026-04-01T00:00:00Z',
    assignedAt = at,
  ) {
    const l = await db.lead.create({
      data: {
        name: 'Lead sintético',
        email: 'synthetic@example.com',
        sourceId,
        entrySourceId: source,
        assignedToId: owner,
        createdAt: new Date(at),
        commercialStartedAt: new Date(start),
      },
    });
    if (owner)
      await db.leadActivity.create({
        data: {
          leadId: l.id,
          kind: 'assigned',
          detail: { assignedToId: owner },
          createdAt: new Date(assignedAt),
        },
      });
    return l.id;
  }
  async function event(
    id: string,
    to: CommercialStage,
    at: string,
    owner: string | null = sellerId,
    origin = sourceId,
  ) {
    const previous = await db.commercialMovement.findFirst({
      where: { leadId: id },
      orderBy: { leadVersion: 'desc' },
    });
    await db.commercialMovement.create({
      data: {
        leadId: id,
        from: previous?.to ?? 'NEW',
        to,
        effectiveAt: new Date(at),
        sourceId: origin,
        responsibleId: owner,
        actorId: adminId,
        reason: previous?.to === 'CLOSED' ? 'Corrección sintética' : null,
        leadVersion: (previous?.leadVersion ?? 1) + 1,
      },
    });
  }
  beforeAll(async () => {
    const url = new URL(database!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/starter_test'
    )
      throw new Error('Only localhost/starter_test is allowed');
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'synthetic-report-integration-secret-2026';
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    for (const name of ['ADMIN', 'VENDEDOR'])
      await db.role.create({ data: { name } });
    const tokens: string[] = [],
      ids: string[] = [];
    const denyR2 = () => {
      throw new Error('Reports must not call R2');
    };
    const module = await Test.createTestingModule({
      imports: [(await import('../src/app.module.js')).AppModule],
    })
      .overrideProvider(R2Service)
      .useValue({
        assertConfigured: denyR2,
        put: denyR2,
        remove: denyR2,
        download: denyR2,
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    for (const [name, role] of [
      ['admin', 'ADMIN'],
      ['seller', 'VENDEDOR'],
      ['other', 'VENDEDOR'],
    ]) {
      const r = await db.role.findUniqueOrThrow({ where: { name: role } });
      const u = await db.user.create({
        data: {
          email: `${name}@example.com`,
          firstName: name === 'admin' ? 'Administración' : 'José',
          lastName: 'Sintético',
          password: await bcrypt.hash(password, 4),
          roles: { create: { roleId: r.id } },
        },
      });
      ids.push(u.id);
      const response = await api()
        .post('/auth/login')
        .send({ email: u.email, password })
        .expect(200);
      tokens.push((response.body as { accessToken: string }).accessToken);
    }
    [admin, seller, other] = tokens;
    [adminId, sellerId, otherId] = ids;
    const origins = await db.leadSource.findMany({ orderBy: { name: 'asc' } });
    sourceId = origins[0].id;
    source2 = origins[1].id;
    // A: first and last instant of BA May, assigned after cutoff, unknown stage/origin, unassigned, cross attribution.
    const a = await lead('2026-05-01T03:00:00Z');
    await event(a, 'CLOSED', '2026-05-10T12:00:00Z');
    const b = await lead('2026-06-01T02:59:59.999Z');
    await event(b, 'CLOSED', '2026-06-01T03:00:00Z');
    await lead(
      '2026-05-15T12:00:00Z',
      sellerId,
      sourceId,
      '2026-04-01T00:00:00Z',
      '2026-06-02T12:00:00Z',
    );
    await lead('2026-05-15T12:00:00Z', null, null, '2026-07-01T00:00:00Z');
    const cross = await lead('2026-05-16T12:00:00Z');
    await event(cross, 'CLOSED', '2026-05-20T12:00:00Z', otherId, source2);
    // Reopened after cutoff: valid May closure. Reopened before cutoff and closed June: no May sale.
    const reopenedAfter = await lead('2026-05-17T12:00:00Z');
    await event(reopenedAfter, 'CLOSED', '2026-05-21T12:00:00Z');
    await event(reopenedAfter, 'FOLLOW_UP', '2026-06-05T12:00:00Z');
    const reopenedBefore = await lead('2026-05-18T12:00:00Z');
    await event(reopenedBefore, 'CLOSED', '2026-05-21T12:00:00Z');
    await event(reopenedBefore, 'NEW', '2026-05-22T12:00:00Z');
    await event(reopenedBefore, 'CLOSED', '2026-06-03T12:00:00Z');
    const twice = await lead('2026-05-19T12:00:00Z');
    await event(twice, 'CLOSED', '2026-05-20T12:00:00Z');
    await event(twice, 'NEW', '2026-05-21T12:00:00Z');
    await event(twice, 'CLOSED', '2026-05-22T12:00:00Z');
    oldLead = await lead('2026-04-30T12:00:00Z');
    await event(oldLead, 'CLOSED', '2026-05-05T12:00:00Z');
    await lead('2026-06-01T03:00:00Z'); // excluded
    await db.user.update({ where: { id: otherId }, data: { isActive: false } });
    await db.leadSource.update({
      where: { id: source2 },
      data: { isActive: false },
    });
    // Current ownership/origin differs from immutable attribution.
    await db.lead.update({
      where: { id: a },
      data: { assignedToId: otherId, sourceId: source2 },
    });
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });
  it('enforces anonymous/vendor denial on all report routes and service boundaries', async () => {
    const id = randomUUID();
    for (const token of ['', seller, other])
      for (const [method, path] of [
        ['get', '/crm/reports'],
        ['get', `/crm/reports/${id}`],
        ['get', `/crm/reports/${id}/pdf`],
        ['get', '/crm/reports/catalogs'],
        ['post', '/crm/reports/preview'],
        ['post', '/crm/reports'],
      ]) {
        const call =
          method === 'get' ? api().get(path) : api().post(path).send(input());
        if (token) call.set(auth(token));
        await call.expect(token === other ? 401 : token ? 403 : 401);
      }
    const actor = {
      id: sellerId,
      email: 'seller@example.com',
      roles: ['VENDEDOR'],
      permissions: [],
    };
    await expect(
      app.get(ReportsService).preview(input(), actor),
    ).rejects.toThrow();
  });
  it('reconstructs both populations without fabricated attribution or repeated sales', async () => {
    const response = await api()
      .post('/crm/reports/preview')
      .set(auth(admin))
      .send(input())
      .expect(201);
    const s = response.body as Snapshot;
    expect(s.summary).toMatchObject({
      entered: 8,
      periodClosures: 5,
      cohortClosures: 4,
      conversion: '50.00',
      cpl: null,
      investment: '200000.10',
      investmentPartial: true,
    });
    expect(s.summary.stages.UNKNOWN).toBe(1);
    expect(
      s.warnings.some((w) =>
        w.includes('1 ingresados tienen origen histórico desconocido'),
      ),
    ).toBe(true);
    expect(Object.values(s.summary.stages).reduce((a, b) => a + b, 0)).toBe(8);
    expect(s.byResponsible.find((p) => p.id === null)?.metrics.entered).toBe(2);
    expect(
      s.byResponsible.find((p) => p.id === otherId)?.metrics.periodClosures,
    ).toBe(1);
    expect(s.bySource.find((p) => p.id === source2)?.metrics).toMatchObject({
      entered: 0,
      periodClosures: 1,
    });
    expect(
      s.bySource.find((p) => p.id === sourceId)?.metrics.cohortClosures,
    ).toBe(4);
    expect(s.responsibles.find((p) => p.id === otherId)?.isActive).toBe(false);
    expect(s.sources.find((p) => p.id === source2)?.isActive).toBe(false);
  });
  it('filters owner separately per population and hides reference costs', async () => {
    const response = await api()
      .post('/crm/reports/preview')
      .set(auth(admin))
      .send({ ...input(), responsibleIds: [otherId] })
      .expect(201);
    expect((response.body as Snapshot).summary).toMatchObject({
      entered: 0,
      periodClosures: 1,
      cpl: null,
      cpc: null,
    });
    expect(
      (response.body as Snapshot).warnings.some((w) =>
        w.includes('origen histórico desconocido'),
      ),
    ).toBe(false);
    expect(
      (response.body as Snapshot).warnings.some((w) =>
        w.includes('seguimiento comercial comenzó'),
      ),
    ).toBe(false);
    const result = await api()
      .post('/crm/reports/preview')
      .set(auth(admin))
      .send({
        ...input(),
        sourceIds: [sourceId],
        investments: [{ sourceId, amount: '0.00' }],
      })
      .expect(201);
    expect((result.body as Snapshot).summary).toMatchObject({
      entered: 7,
      cohortClosures: 4,
      cpl: '0.00',
      cpc: '0.00',
    });
  });
  it('scopes diagnostics to entry dates and first ownership, and explains excluded unknown origins', async () => {
    const id = await lead(
      '2026-07-15T12:00:00Z',
      sellerId,
      null,
      '2026-08-01T00:00:00Z',
    );
    await db.lead.update({ where: { id }, data: { assignedToId: otherId } });
    const diagnostics = async (patch: Record<string, unknown> = {}) => {
      const response = await api()
        .post('/crm/reports/preview')
        .set(auth(admin))
        .send({
          ...input(),
          from: '2026-07-01',
          to: '2026-07-31',
          responsibleIds: [sellerId],
          investments: [],
          ...patch,
        })
        .expect(201);
      return response.body as Snapshot;
    };
    const originalOwner = await diagnostics();
    expect(originalOwner.summary.entered).toBe(1);
    expect(
      originalOwner.warnings.some((w) =>
        w.includes('1 ingresados tienen origen histórico desconocido'),
      ),
    ).toBe(true);
    expect(
      originalOwner.warnings.some((w) =>
        w.includes('seguimiento comercial comenzó'),
      ),
    ).toBe(true);
    const specificChannel = await diagnostics({ sourceIds: [sourceId] });
    expect(specificChannel.summary.entered).toBe(0);
    expect(
      specificChannel.warnings.some((w) =>
        w.includes('con canales específicos se excluyen'),
      ),
    ).toBe(true);
    expect(
      specificChannel.warnings.some((w) =>
        w.includes('seguimiento comercial comenzó'),
      ),
    ).toBe(false);
    for (const patch of [
      { responsibleIds: [otherId] },
      { from: '2026-09-01', to: '2026-09-30' },
    ]) {
      const unrelated = await diagnostics(patch);
      expect(unrelated.summary.entered).toBe(0);
      expect(
        unrelated.warnings.some(
          (w) =>
            w.includes('origen histórico desconocido') ||
            w.includes('seguimiento comercial comenzó'),
        ),
      ).toBe(false);
    }
  });
  it('validates future, reversed, invalid selection, negative/precise money and manipulated metrics', async () => {
    for (const patch of [
      { from: '2099-01-01', to: '2099-01-03' },
      { from: '2026-05-31', to: '2026-05-01' },
      { sourceIds: [randomUUID()] },
      { investments: [{ sourceId, amount: '-1' }] },
      { investments: [{ sourceId, amount: '1.234' }] },
      { summary: { entered: 999 } },
    ])
      await api()
        .post('/crm/reports/preview')
        .set(auth(admin))
        .send({ ...input(), ...patch })
        .expect(400);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const r = await api()
      .post('/crm/reports/preview')
      .set(auth(admin))
      .send({ ...input(), from: today, to: today })
      .expect(201);
    expect((r.body as Snapshot).partial).toBe(true);
  });
  it('saves once under concurrent retries, detects key reuse, freezes names and rejects updates', async () => {
    const operationKey = randomUUID();
    const results = await Promise.all(
      [1, 2].map(() =>
        api()
          .post('/crm/reports')
          .set(auth(admin))
          .send({ ...input(), operationKey })
          .expect(201),
      ),
    );
    expect((results[0].body as { id: string }).id).toBe(
      (results[1].body as { id: string }).id,
    );
    reportId = (results[0].body as { id: string }).id;
    stored = (results[0].body as { snapshot: Snapshot }).snapshot;
    await api()
      .post('/crm/reports')
      .set(auth(admin))
      .send({ ...input(), name: 'Otro', operationKey })
      .expect(409);
    await db.leadSource.update({
      where: { id: sourceId },
      data: { name: 'Nombre posterior sintético' },
    });
    await db.user.update({
      where: { id: sellerId },
      data: { firstName: 'Nombre posterior' },
    });
    await db.lead.create({
      data: {
        name: 'Ingreso posterior sintético',
        sourceId,
        entrySourceId: sourceId,
        createdAt: new Date('2026-05-04T12:00:00Z'),
      },
    });
    const detail = await api()
      .get(`/crm/reports/${reportId}`)
      .set(auth(admin))
      .expect(200);
    expect((detail.body as { snapshot: Snapshot }).snapshot).toEqual(stored);
    await expect(
      db.commercialReport.update({
        where: { id: reportId },
        data: { name: 'mutado' },
      }),
    ).rejects.toThrow();
    const list = await api()
      .get('/crm/reports?page=1&pageSize=1')
      .set(auth(admin))
      .expect(200);
    expect((list.body as { items: unknown[] }).items).toHaveLength(1);
    expect(
      (list.body as { items: { snapshot?: Snapshot }[] }).items[0].snapshot,
    ).toBeUndefined();
  });
  it('downloads a private PDF repeatedly from the same saved content without R2', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await api()
        .get(`/crm/reports/${reportId}/pdf`)
        .set(auth(admin))
        .expect(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment;');
      expect(response.headers['cache-control']).toContain('no-store');
      expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      if (process.env.REPORT_PDF_QA_PATH)
        writeFileSync(process.env.REPORT_PDF_QA_PATH, response.body as Buffer);
    }
    await api()
      .get(`/crm/reports/${randomUUID()}/pdf`)
      .set(auth(admin))
      .expect(404);
    expect(await db.commercialReport.count()).toBe(1);
    expect(
      (
        (await api().get(`/crm/reports/${reportId}`).set(auth(admin))).body as {
          snapshot: Snapshot;
        }
      ).snapshot,
    ).toEqual(stored);
  });
  it('persists authorized pipeline movement, audits correction, checks version/ownership and manual ADMIN', async () => {
    await db.user.update({ where: { id: otherId }, data: { isActive: true } });
    const leadId = await lead(new Date().toISOString());
    await api().get('/crm/pipeline').set(auth(seller)).expect(200);
    expect(
      (
        (await api().get('/crm/pipeline').set(auth(other))).body as {
          items: { id: string }[];
        }
      ).items.some((l: { id: string }) => l.id === leadId),
    ).toBe(false);
    await api()
      .patch(`/crm/pipeline/${leadId}`)
      .set(auth(other))
      .send({ version: 1, stage: 'CLOSED' })
      .expect(404);
    await expect(
      app.get<PipelineService>(PipelineService).move(
        leadId,
        { version: 1, stage: 'CLOSED' },
        {
          id: otherId,
          email: 'other@example.com',
          roles: ['VENDEDOR'],
          permissions: [],
        },
      ),
    ).rejects.toThrow();
    const results = await Promise.all(
      ['CLOSED', 'PROPOSAL'].map((stage) =>
        api()
          .patch(`/crm/pipeline/${leadId}`)
          .set(auth(seller))
          .send({ version: 1, stage }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (current.commercialStage !== 'CLOSED')
      await api()
        .patch(`/crm/pipeline/${leadId}`)
        .set(auth(admin))
        .send({ version: current.version, stage: 'CLOSED' })
        .expect(200);
    const closed = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    await api()
      .patch(`/crm/pipeline/${leadId}`)
      .set(auth(seller))
      .send({ version: closed.version, stage: 'NEW', reason: 'No permitido' })
      .expect(403);
    await api()
      .patch(`/crm/pipeline/${leadId}`)
      .set(auth(admin))
      .send({ version: closed.version, stage: 'NEW' })
      .expect(400);
    await api()
      .patch(`/crm/pipeline/${leadId}`)
      .set(auth(admin))
      .send({
        version: closed.version,
        stage: 'FOLLOW_UP',
        reason: 'Corrección documentada',
      })
      .expect(200);
    expect(
      (
        await db.commercialMovement.findFirstOrThrow({
          where: { leadId, to: 'CLOSED' },
        })
      ).responsibleId,
    ).toBe(sellerId);
    const reopened = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    await api()
      .patch(`/crm/leads/${leadId}/assignment`)
      .set(auth(admin))
      .send({ version: reopened.version, assignedToId: adminId })
      .expect(200);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: leadId } })).assignedToId,
    ).toBe(adminId);
    const beforeEdit = await db.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    await db.leadSource.update({
      where: { id: source2 },
      data: { isActive: true },
    });
    await api()
      .patch(`/crm/leads/${leadId}`)
      .set(auth(admin))
      .send({ version: beforeEdit.version, sourceId: source2 })
      .expect(200);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: leadId } }))
        .entrySourceId,
    ).toBe(sourceId);
    expect(
      (
        await db.leadActivity.findFirstOrThrow({
          where: { leadId, kind: 'source-changed' },
        })
      ).detail,
    ).toEqual({ from: sourceId, to: source2 });
    await db.user.update({
      where: { id: adminId },
      data: { receivesLeads: true },
    });
    await db.user.update({
      where: { id: sellerId },
      data: { receivesLeads: true },
    });
    await api()
      .post('/crm/leads')
      .set(auth(admin))
      .send({
        name: 'Reparto sintético',
        email: 'rotation@example.com',
        sourceId,
      })
      .expect(201);
    await app.get<CrmService>(CrmService).distributePending();
    const automatic = await db.lead.findFirstOrThrow({
      where: { email: 'rotation@example.com' },
    });
    expect(automatic.assignedToId).toBe(sellerId);
  });
});
