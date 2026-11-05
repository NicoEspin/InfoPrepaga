import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { R2Service } from '../src/crm/r2.service';

const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite('Private lead attachments with PostgreSQL and simulated R2', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let leadId: string;
  let sourceId: string;
  const objects = new Map<string, Buffer>();
  const r2 = {
    assertConfigured: jest.fn(),
    put: jest.fn((key: string, body: Buffer) => {
      objects.set(key, body);
      return Promise.resolve();
    }),
    remove: jest.fn((key: string) => {
      objects.delete(key);
      return Promise.resolve();
    }),
    download: jest.fn(() =>
      Promise.resolve({
        url: 'https://synthetic.invalid/download',
        expiresIn: 60,
      }),
    ),
  };
  const api = () => request(app.getHttpServer());
  const auth = (name: string) => ({ Authorization: `Bearer ${tokens[name]}` });
  const path = () => `/crm/leads/${leadId}/attachments`;
  const pdf = Buffer.from('%PDF-1.7\nSynthetic test only');
  const upload = (actor = 'sellerA', bytes = pdf) =>
    api().post(path()).set(auth(actor)).attach('file', bytes, 'documento.pdf');
  type Item = { id: string; version: number; state: string };

  beforeAll(async () => {
    const url = new URL(database!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/starter_test'
    )
      throw new Error('Only localhost/starter_test allowed');
    url.searchParams.set(
      'schema',
      `attachments_test_${randomUUID().replaceAll('-', '')}`,
    );
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'synthetic-attachment-test-secret-2026';
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    for (const role of ['ADMIN', 'VENDEDOR'])
      await db.role.create({ data: { name: role } });
    for (const name of ['admin', 'sellerA', 'sellerB']) {
      const role = await db.role.findUniqueOrThrow({
        where: { name: name === 'admin' ? 'ADMIN' : 'VENDEDOR' },
      });
      const user = await db.user.create({
        data: {
          email: `${name}@example.test`,
          password: await bcrypt.hash('Synthetic-password-2026', 4),
          roles: { create: { roleId: role.id } },
        },
      });
      ids[name] = user.id;
    }
    sourceId = (await db.leadSource.findFirstOrThrow()).id;
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(R2Service)
      .useValue(r2)
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
    await app.listen(0, '127.0.0.1');
    for (const name of ['admin', 'sellerA', 'sellerB']) {
      const response = await api()
        .post('/auth/login')
        .send({
          email: `${name}@example.test`,
          password: 'Synthetic-password-2026',
        })
        .expect(200);
      tokens[name] = (response.body as { accessToken: string }).accessToken;
    }
  }, 90000);
  beforeEach(async () => {
    jest.clearAllMocks();
    leadId = (
      await db.lead.create({
        data: { name: 'Lead sintético', sourceId, assignedToId: ids.sellerA },
      })
    ).id;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });

  it('uploads, paginates, renames, downloads and deletes both object and metadata with audit', async () => {
    const item = (await upload().expect(201)).body as Item;
    expect(item).toMatchObject({ state: 'READY', version: 1 });
    expect(item).not.toHaveProperty('objectKey');
    const key = `leads/${leadId}/${item.id}`;
    expect(objects.get(key)).toEqual(pdf);
    const list = await api()
      .get(`${path()}?page=1&pageSize=1`)
      .set(auth('admin'))
      .expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      pageSize: 1,
      items: [{ id: item.id }],
    });
    await api()
      .patch(`${path()}/${item.id}`)
      .set(auth('sellerA'))
      .send({ name: 'Cotización.pdf', version: 1 })
      .expect(200);
    await api()
      .patch(`${path()}/${item.id}`)
      .set(auth('sellerA'))
      .send({ name: 'Viejo.pdf', version: 1 })
      .expect(409);
    const download = await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerA'))
      .expect(200);
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(r2.download).toHaveBeenCalledWith(key, 'Cotización.pdf');
    await api().delete(`${path()}/${item.id}`).set(auth('sellerA')).expect(200);
    expect(objects.has(key)).toBe(false);
    expect(await db.leadAttachment.count({ where: { id: item.id } })).toBe(0);
    expect(
      (
        await db.leadActivity.findMany({
          where: { leadId },
          orderBy: { createdAt: 'asc' },
        })
      ).map((event) => event.kind),
    ).toEqual([
      'attachment-uploaded',
      'attachment-renamed',
      'attachment-downloaded',
      'attachment-deleted',
    ]);
  });
  it('denies every operation to another vendor without consulting R2', async () => {
    const item = (await upload().expect(201)).body as Item;
    jest.clearAllMocks();
    await api().get(path()).set(auth('sellerB')).expect(404);
    await upload('sellerB').expect(404);
    await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerB'))
      .expect(404);
    await api()
      .patch(`${path()}/${item.id}`)
      .set(auth('sellerB'))
      .send({ name: 'Ajeno.pdf', version: 1 })
      .expect(404);
    await api().delete(`${path()}/${item.id}`).set(auth('sellerB')).expect(404);
    for (const method of Object.values(r2))
      expect(method).not.toHaveBeenCalled();
    await api().get(path()).expect(401);
  });
  it('follows reassignment and rejects attachment IDs belonging to another lead', async () => {
    const item = (await upload().expect(201)).body as Item;
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    await api()
      .patch(`/crm/leads/${leadId}/assignment`)
      .set(auth('admin'))
      .send({ assignedToId: ids.sellerB, version: lead.version })
      .expect(200);
    await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerA'))
      .expect(404);
    await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerB'))
      .expect(200);
    const other = await db.lead.create({
      data: { name: 'Otro sintético', sourceId, assignedToId: ids.sellerB },
    });
    await api()
      .delete(`/crm/leads/${other.id}/attachments/${item.id}`)
      .set(auth('sellerB'))
      .expect(404);
  });
  it('retains a durable deleting record on R2 error and supports retry', async () => {
    const item = (await upload().expect(201)).body as Item;
    r2.remove.mockRejectedValueOnce(new ServiceUnavailableException());
    await api().delete(`${path()}/${item.id}`).set(auth('sellerA')).expect(503);
    expect(
      await db.leadAttachment.findUnique({ where: { id: item.id } }),
    ).toMatchObject({ state: 'DELETING' });
    expect(objects.has(`leads/${leadId}/${item.id}`)).toBe(true);
    await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerA'))
      .expect(409);
    await api().delete(`${path()}/${item.id}`).set(auth('admin')).expect(200);
    expect(await db.leadAttachment.count({ where: { id: item.id } })).toBe(0);
  });
  it('keeps an interrupted upload discoverable and deletable even if R2 accepted bytes', async () => {
    r2.put.mockImplementationOnce((key, body) => {
      objects.set(key, body);
      return Promise.reject(new ServiceUnavailableException());
    });
    await upload().expect(503);
    const item = await db.leadAttachment.findFirstOrThrow({
      where: { leadId },
    });
    expect(item.state).toBe('UPLOADING');
    await api().get(path()).set(auth('sellerA')).expect(200);
    await api()
      .get(`${path()}/${item.id}/download`)
      .set(auth('sellerA'))
      .expect(409);
    await api().delete(`${path()}/${item.id}`).set(auth('sellerA')).expect(200);
    expect(objects.has(item.objectKey)).toBe(false);
  });
  it('rejects invalid bytes, empty/oversized files, invalid names and metadata injection', async () => {
    await upload('sellerA', Buffer.from('<script>synthetic</script>')).expect(
      400,
    );
    await upload('sellerA', Buffer.alloc(0)).expect(400);
    await upload('sellerA', Buffer.alloc(10 * 1024 * 1024 + 1)).expect(413);
    await api()
      .post(path())
      .set(auth('sellerA'))
      .attach('file', pdf, 'uno.pdf')
      .attach('file', pdf, 'dos.pdf')
      .expect(400);
    const item = (await upload().expect(201)).body as Item;
    await api()
      .patch(`${path()}/${item.id}`)
      .set(auth('admin'))
      .send({ name: '../escape.pdf', version: 1 })
      .expect(400);
    await api()
      .patch(`${path()}/${item.id}`)
      .set(auth('admin'))
      .send({ name: 'safe.pdf', version: 1, objectKey: 'untrusted' })
      .expect(400);
  });
  it('leaves no metadata when storage configuration is missing', async () => {
    r2.assertConfigured.mockImplementationOnce(() => {
      throw new ServiceUnavailableException();
    });
    await upload().expect(503);
    expect(await db.leadAttachment.count({ where: { leadId } })).toBe(0);
    expect(r2.put).not.toHaveBeenCalled();
  });
});
