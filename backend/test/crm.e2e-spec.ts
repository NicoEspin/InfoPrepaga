import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AccountsService } from '../src/users/accounts.service';
import { CrmService } from '../src/crm/crm.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { App } from 'supertest/types';
import type { Lead, CommercialTask } from '@prisma/client';

// Opt in explicitly. Each run gets a new schema; no existing data is deleted.
const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite('Commercial API with real PostgreSQL and sessions', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  let admin: string;
  let sellerA: string;
  let sellerB: string;
  let adminId: string;
  let sellerAId: string;
  let sellerBId: string;
  let sourceId: string;
  let crm: CrmService;
  const password = 'Synthetic-only-password-2026';
  const schema = `crm_test_${randomUUID().replaceAll('-', '')}`;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const taskValues = {
    contact: 'Contacto sintético',
    title: 'Seguimiento sintético',
    dueAt: '2026-11-03T02:30:00Z',
    duration: 60,
    priority: 'MEDIUM',
  };

  beforeAll(async () => {
    const url = new URL(database!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/starter_test'
    )
      throw new Error('Use only localhost/starter_test for CRM tests');
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      'synthetic-crm-integration-test-secret-2026';
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    const adminRole = await db.role.create({ data: { name: 'ADMIN' } });
    await db.permission.create({
      data: {
        action: 'manage',
        resource: 'users',
        roles: { create: { roleId: adminRole.id } },
      },
    });
    await db.role.create({ data: { name: 'VENDEDOR' } });
    const account = await db.user.create({
      data: {
        email: 'admin@example.com',
        password: await bcrypt.hash(password, 4),
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminId = account.id;
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
    crm = app.get(CrmService);
    const login = await api()
      .post('/auth/login')
      .send({ email: 'admin@example.com', password })
      .expect(200);
    admin = (login.body as { accessToken: string }).accessToken;
    for (const name of ['a', 'b']) {
      const response = await api()
        .post('/auth/register')
        .set(auth(admin))
        .send({
          email: `${name}@example.com`,
          password,
          firstName: `Vendedor ${name}`,
        })
        .expect(201);
      if (name === 'a') {
        sellerA = (response.body as { accessToken: string }).accessToken;
        sellerAId = (response.body as { user: { id: string } }).user.id;
      } else {
        sellerB = (response.body as { accessToken: string }).accessToken;
        sellerBId = (response.body as { user: { id: string } }).user.id;
      }
    }
    sourceId = (await db.leadSource.findFirstOrThrow()).id;
  }, 90_000);

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });

  it('keeps unassigned leads private and resumes FIFO distribution atomically', async () => {
    const first = (
      await api()
        .post('/crm/leads')
        .set(auth(admin))
        .send({ name: 'Primero', phone: 'Sintético 1', sourceId })
        .expect(201)
    ).body as Lead;
    const second = (
      await api()
        .post('/crm/leads')
        .set(auth(admin))
        .send({ name: 'Segundo', phone: 'Sintético 2', sourceId })
        .expect(201)
    ).body as Lead;
    expect(first.assignedToId).toBeNull();
    expect(
      (
        await api()
          .get('/crm/leads?unassigned=true')
          .set(auth(sellerA))
          .expect(200)
      ).body,
    ).toMatchObject({ total: 0 });
    await api().get(`/crm/leads/${first.id}`).set(auth(sellerA)).expect(404);
    await api()
      .patch(`/crm/users/${sellerAId}`)
      .set(auth(admin))
      .send({ receivesLeads: true })
      .expect(200);
    const pending = await db.lead.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(pending.map((lead) => lead.assignedToId)).toEqual([
      sellerAId,
      sellerAId,
    ]);
    const events = await db.leadActivity.findMany({
      where: { kind: 'assigned' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.leadId)).toEqual([first.id, second.id]);
    await api()
      .patch(`/crm/users/${sellerBId}`)
      .set(auth(admin))
      .send({ receivesLeads: true })
      .expect(200);
    const created = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        api()
          .post('/crm/leads')
          .set(auth(admin))
          .send({
            name: `Concurrente ${index}`,
            phone: `Sintético ${index}`,
            sourceId,
          })
          .expect(201),
      ),
    );
    expect(
      created.filter(
        (response) => (response.body as Lead).assignedToId === sellerAId,
      ),
    ).toHaveLength(6);
    expect(
      created.filter(
        (response) => (response.body as Lead).assignedToId === sellerBId,
      ),
    ).toHaveLength(6);
    const assignments = await db.leadActivity.count({
      where: {
        leadId: {
          in: created.map((response) => (response.body as Lead).id),
        },
        kind: 'assigned',
      },
    });
    expect(assignments).toBe(12);
  });

  it('enforces scope for search, detail, history, notes, editing and task counts', async () => {
    const other = await db.lead.findFirstOrThrow({
      where: { assignedToId: sellerBId },
    });
    // Search is partial: Concurrente 1 also matches Concurrente 10. Use a unique fixture marker.
    other.name = `Aislamiento ${randomUUID()}`;
    await db.lead.update({
      where: { id: other.id },
      data: { name: other.name },
    });
    const own = await db.lead.findFirstOrThrow({
      where: { assignedToId: sellerAId },
    });
    const created = await api()
      .post('/crm/tasks')
      .set(auth(sellerB))
      .send({ ...taskValues, leadId: other.id })
      .expect(201);
    const task = created.body as CommercialTask;
    const list = await api()
      .get(`/crm/leads?assignedToId=${sellerBId}`)
      .set(auth(sellerA))
      .expect(200);
    expect(list.body).toMatchObject({ items: [], total: 0 });
    expect(
      (
        await api()
          .get(`/crm/leads?q=${encodeURIComponent(other.name)}`)
          .set(auth(sellerA))
          .expect(200)
      ).body,
    ).toMatchObject({ total: 0 });
    await api().get(`/crm/leads/${other.id}`).set(auth(sellerA)).expect(404);
    await api()
      .get(`/crm/leads/${other.id}/history`)
      .set(auth(sellerA))
      .expect(404);
    await api()
      .post(`/crm/leads/${other.id}/notes`)
      .set(auth(sellerA))
      .send({ text: 'Intento ajeno' })
      .expect(404);
    await api()
      .patch(`/crm/leads/${other.id}`)
      .set(auth(sellerA))
      .send({ name: 'No permitido', version: other.version })
      .expect(404);
    await api()
      .patch(`/crm/leads/${other.id}/status`)
      .set(auth(sellerA))
      .send({ status: 'PROSPECT', version: other.version })
      .expect(404);
    await api()
      .patch(`/crm/leads/${own.id}/assignment`)
      .set(auth(sellerA))
      .send({ assignedToId: sellerBId, version: own.version })
      .expect(403);
    await api()
      .patch(`/crm/leads/${own.id}`)
      .set(auth(sellerA))
      .send({ assignedToId: sellerBId, version: own.version })
      .expect(400);
    await api()
      .post('/crm/leads')
      .set(auth(sellerA))
      .send({ name: 'No permitido', phone: 'Sintético', sourceId })
      .expect(403);
    await api()
      .post('/crm/tasks')
      .set(auth(sellerA))
      .send({ ...taskValues, leadId: other.id })
      .expect(404);
    await api()
      .patch(`/crm/tasks/${task.id}`)
      .set(auth(sellerA))
      .send({ version: task.version, completed: true })
      .expect(404);
    const hidden = await api()
      .get(`/crm/tasks?leadId=${other.id}`)
      .set(auth(sellerA))
      .expect(200);
    expect(hidden.body).toMatchObject({
      items: [],
      total: 0,
      counts: { pending: 0, completed: 0 },
    });
    await api().get('/crm/users').set(auth(sellerA)).expect(403);
    await api()
      .post('/crm/sources')
      .set(auth(sellerA))
      .send({ name: 'Prohibido' })
      .expect(403);
    await api().get('/crm/leads').expect(401);
    await api()
      .post(`/crm/leads/${own.id}/notes`)
      .set(auth(sellerA))
      .send({ text: 'Nota autorizada' })
      .expect(201);
    const history = await api()
      .get(`/crm/leads/${own.id}/history?pageSize=1`)
      .set(auth(sellerA))
      .expect(200);
    expect((history.body as { items: unknown[] }).items).toHaveLength(1);
    expect((history.body as { total: number }).total).toBeGreaterThan(1);
    await api()
      .patch(`/crm/leads/${own.id}`)
      .set(auth(sellerA))
      .send({ name: 'Obsoleto', version: own.version })
      .expect(409);
  });

  it('transfers pending tasks, preserves authorship and rejects stale concurrent writes', async () => {
    const lead = await db.lead.findFirstOrThrow({
      where: { assignedToId: sellerAId },
    });
    const task = (
      await api()
        .post('/crm/tasks')
        .set(auth(sellerA))
        .send({ ...taskValues, leadId: lead.id })
        .expect(201)
    ).body as CommercialTask;
    const complete = (
      await api()
        .post('/crm/tasks')
        .set(auth(sellerA))
        .send({ ...taskValues, leadId: lead.id })
        .expect(201)
    ).body as CommercialTask;
    await api()
      .patch(`/crm/tasks/${complete.id}`)
      .set(auth(sellerA))
      .send({ version: complete.version, completed: true })
      .expect(200);
    await api()
      .post(`/crm/leads/${lead.id}/notes`)
      .set(auth(sellerA))
      .send({ text: 'Autor original' })
      .expect(201);
    const latest = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    await api()
      .patch(`/crm/leads/${lead.id}/assignment`)
      .set(auth(admin))
      .send({ assignedToId: sellerBId, version: latest.version })
      .expect(200);
    await api()
      .patch(`/crm/leads/${lead.id}`)
      .set(auth(admin))
      .send({ name: 'Obsoleto', version: latest.version })
      .expect(409);
    await api().get(`/crm/leads/${lead.id}`).set(auth(sellerA)).expect(404);
    const invisible = await api()
      .get(`/crm/tasks?leadId=${lead.id}`)
      .set(auth(sellerA))
      .expect(200);
    expect((invisible.body as { total: number }).total).toBe(0);
    const visible = await api()
      .get(`/crm/tasks?leadId=${lead.id}`)
      .set(auth(sellerB))
      .expect(200);
    expect((visible.body as { total: number }).total).toBe(2);
    expect(
      (await db.commercialTask.findUniqueOrThrow({ where: { id: task.id } }))
        .ownerId,
    ).toBe(sellerBId);
    expect(
      (await db.commercialTask.findUniqueOrThrow({ where: { id: task.id } }))
        .createdById,
    ).toBe(sellerAId);
    expect(
      (
        await db.commercialTask.findUniqueOrThrow({
          where: { id: complete.id },
        })
      ).ownerId,
    ).toBe(sellerAId);
    expect(
      (await db.leadNote.findFirstOrThrow({ where: { leadId: lead.id } }))
        .authorId,
    ).toBe(sellerAId);
    await api()
      .patch(`/crm/tasks/${task.id}`)
      .set(auth(sellerB))
      .send({ version: task.version, title: 'Obsoleto' })
      .expect(409);
    const current = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const edits = await Promise.all(
      ['PROSPECT', 'WHATSAPP'].map((status) =>
        api()
          .patch(`/crm/leads/${lead.id}/status`)
          .set(auth(sellerB))
          .send({ version: current.version, status }),
      ),
    );
    expect(edits.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it('keeps independent tasks private and handles Buenos Aires date boundaries', async () => {
    const task = (
      await api()
        .post('/crm/tasks')
        .set(auth(sellerA))
        .send(taskValues)
        .expect(201)
    ).body as CommercialTask;
    await api()
      .post('/crm/tasks')
      .set(auth(sellerA))
      .send({ ...taskValues, ownerId: sellerBId })
      .expect(403);
    const previous = await api()
      .get('/crm/tasks?from=2026-11-02T03:00:00Z&to=2026-11-03T03:00:00Z')
      .set(auth(sellerA))
      .expect(200);
    expect(task.createdById).toBe(sellerAId);
    expect(
      (previous.body as { items: CommercialTask[] }).items.some(
        (item: CommercialTask) => item.id === task.id,
      ),
    ).toBe(true);
    const next = await api()
      .get('/crm/tasks?from=2026-11-03T03:00:00Z&to=2026-11-04T03:00:00Z')
      .set(auth(sellerA))
      .expect(200);
    expect(
      (next.body as { items: CommercialTask[] }).items.some(
        (item: CommercialTask) => item.id === task.id,
      ),
    ).toBe(false);
    await api()
      .patch(`/crm/tasks/${task.id}`)
      .set(auth(sellerB))
      .send({ version: task.version, completed: true })
      .expect(404);
    await api()
      .get('/crm/tasks?from=2026-11-04T00:00:00Z&to=2026-11-03T00:00:00Z')
      .set(auth(admin))
      .expect(400);
    await api()
      .post('/crm/tasks')
      .set(auth(sellerA))
      .send({ ...taskValues, dueAt: '2026-11-02T09:00:00' })
      .expect(400);
    await api()
      .post('/crm/tasks')
      .set(auth(sellerA))
      .send({ ...taskValues, duration: 120 })
      .expect(400);
    await api()
      .patch(`/crm/tasks/${task.id}`)
      .set(auth(sellerA))
      .send({ version: task.version, title: null })
      .expect(400);
  });

  it('preserves inactive source history and enforces contact and version validation', async () => {
    await api()
      .post('/auth/register')
      .set(auth(admin))
      .send({ email: 'weak@example.com', password: 'short-pass' })
      .expect(400);
    await api()
      .get('/crm/leads?page=99999999999999999')
      .set(auth(admin))
      .expect(400);
    const source = (
      await api()
        .post('/crm/sources')
        .set(auth(admin))
        .send({ name: 'Base sintética' })
        .expect(201)
    ).body as { id: string };
    const lead = (
      await api()
        .post('/crm/leads')
        .set(auth(admin))
        .send({
          name: 'Base histórica',
          email: 'lead@example.com',
          sourceId: source.id,
        })
        .expect(201)
    ).body as Lead;
    await api()
      .patch(`/crm/sources/${source.id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(200);
    await api().get(`/crm/leads/${lead.id}`).set(auth(admin)).expect(200);
    await api()
      .post('/crm/leads')
      .set(auth(admin))
      .send({
        name: 'Origen desactivado',
        phone: 'Sintético',
        sourceId: source.id,
      })
      .expect(400);
    await api()
      .post('/crm/leads')
      .set(auth(admin))
      .send({ name: 'Sin contacto', sourceId })
      .expect(400);
    await api()
      .patch(`/crm/leads/${lead.id}`)
      .set(auth(admin))
      .send({ email: '', version: lead.version })
      .expect(400);
    await api()
      .patch(`/crm/leads/${lead.id}`)
      .set(auth(admin))
      .send({ name: null, version: lead.version })
      .expect(400);
    await api()
      .patch(`/crm/users/${sellerAId}`)
      .set(auth(admin))
      .send({ isActive: null })
      .expect(400);
    await api()
      .patch(`/crm/users/${adminId}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(400);
    await api()
      .patch(`/crm/leads/${lead.id}/status`)
      .set(auth(admin))
      .send({ status: 'CLOSED', version: lead.version })
      .expect(400);
    await api().delete(`/crm/leads/${lead.id}`).set(auth(admin)).expect(404);
    await api().get('/crm/leads/export').set(auth(sellerA)).expect(400);
  });

  it('recovers pending distribution after restart and revokes inactive accounts', async () => {
    await api()
      .patch(`/crm/users/${sellerAId}`)
      .set(auth(admin))
      .send({ receivesLeads: false })
      .expect(200);
    await api()
      .patch(`/crm/users/${sellerBId}`)
      .set(auth(admin))
      .send({ receivesLeads: false })
      .expect(200);
    const pending = (
      await api()
        .post('/crm/leads')
        .set(auth(admin))
        .send({ name: 'Recuperar al reiniciar', phone: 'Sintético', sourceId })
        .expect(201)
    ).body as Lead;
    // Simulate an interrupted enable operation; persisted pool state survives.
    await db.user.update({
      where: { id: sellerAId },
      data: { receivesLeads: true },
    });
    await crm.onModuleDestroy();
    const restarted = new CrmService(
      app.get(AccountsService),
      app.get(PrismaService),
    );
    restarted.onModuleInit();
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        (await db.lead.findUniqueOrThrow({ where: { id: pending.id } }))
          .assignedToId
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await restarted.onModuleDestroy();
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: pending.id } }))
        .assignedToId,
    ).toBe(sellerAId);
    expect(
      await db.leadActivity.count({
        where: { leadId: pending.id, kind: 'assigned' },
      }),
    ).toBe(1);
    await api()
      .patch(`/crm/users/${sellerAId}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(400);
    await api()
      .post(`/users/${sellerAId}/deactivate`)
      .set(auth(admin))
      .send({
        version: (await db.user.findUniqueOrThrow({ where: { id: sellerAId } }))
          .version,
        replacementId: sellerBId,
      })
      .expect(201);
    await api().get('/crm/leads').set(auth(sellerA)).expect(401);
    expect(await db.refreshToken.count({ where: { userId: sellerAId } })).toBe(
      0,
    );
    await api().get(`/crm/leads/${pending.id}`).set(auth(admin)).expect(200);
  });
  it('pauses reception across role changes using the same allocation lock', async () => {
    const adminRole = await db.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const vendorRole = await db.role.findUniqueOrThrow({
      where: { name: 'VENDEDOR' },
    });
    await api()
      .patch(`/crm/users/${sellerBId}`)
      .set(auth(admin))
      .send({ receivesLeads: true })
      .expect(200);
    await api()
      .patch(`/users/${sellerBId}/roles`)
      .set(auth(admin))
      .send({ roleIds: [adminRole.id] })
      .expect(400);
    await api()
      .post(`/users/${sellerAId}/restore`)
      .set(auth(admin))
      .send({
        version: (await db.user.findUniqueOrThrow({ where: { id: sellerAId } }))
          .version,
      })
      .expect(201);
    await api()
      .patch(`/users/${sellerBId}`)
      .set(auth(admin))
      .send({
        version: (await db.user.findUniqueOrThrow({ where: { id: sellerBId } }))
          .version,
        role: 'ADMIN',
        replacementId: sellerAId,
      })
      .expect(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: sellerBId } }))
        .receivesLeads,
    ).toBe(false);
    await api()
      .patch(`/users/${sellerBId}/roles`)
      .set(auth(admin))
      .send({ roleIds: [vendorRole.id] })
      .expect(200);
    const lead = (
      await api()
        .post('/crm/leads')
        .set(auth(admin))
        .send({ name: 'Después de cambiar rol', phone: 'Sintético', sourceId })
        .expect(201)
    ).body as Lead;
    expect(lead.assignedToId).toBeNull();
    await api()
      .patch(`/crm/users/${sellerBId}`)
      .set(auth(admin))
      .send({ receivesLeads: true })
      .expect(200);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: lead.id } }))
        .assignedToId,
    ).toBe(sellerBId);
  });
});
