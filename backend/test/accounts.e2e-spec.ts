import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, User } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AccountsService } from '../src/users/accounts.service';
import { AuthService } from '../src/auth/auth.service';

const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite('Account lifecycle and session races', () => {
  let app: INestApplication<App>;
  let db: PrismaClient;
  let admin: User;
  let token: string;
  let accounts: AccountsService;
  let authService: AuthService;
  const password = 'Synthetic-only-password-2026';
  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const actor = () => ({
    id: admin.id,
    email: admin.email,
    roles: ['ADMIN'],
    permissions: ['users:read', 'users:manage'],
  });
  async function create(role: 'ADMIN' | 'VENDEDOR' = 'VENDEDOR') {
    return accounts.create(
      {
        firstName: 'Sintético',
        email: `${randomUUID()}@example.com`,
        password,
        role,
      },
      actor(),
    );
  }
  beforeAll(async () => {
    const url = new URL(database!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/starter_test'
    )
      throw new Error('Use only localhost/starter_test');
    url.searchParams.set(
      'schema',
      `accounts_test_${randomUUID().replaceAll('-', '')}`,
    );
    process.env.DATABASE_URL = url.href;
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      'synthetic-accounts-integration-secret-2026';
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient();
    const role = await db.role.create({ data: { name: 'ADMIN' } });
    await db.role.create({ data: { name: 'VENDEDOR' } });
    for (const action of ['read', 'manage'])
      await db.permission.create({
        data: {
          resource: 'users',
          action,
          roles: { create: { roleId: role.id } },
        },
      });
    admin = await db.user.create({
      data: {
        email: 'account-admin@example.com',
        password: await bcrypt.hash(password, 4),
        roles: { create: { roleId: role.id } },
      },
    });
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
    accounts = app.get(AccountsService);
    authService = app.get(AuthService);
    token = (await authService.login({ email: admin.email, password }))
      .accessToken;
  }, 90000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });

  it('blocks incompatible legacy roles and normalized-email collisions before migration writes', async () => {
    // Execute only the trusted migration preflight inside rolled-back test transactions.
    const preflight = readFileSync(
      'prisma/migrations/20261103160000_account_management/migration.sql',
      'utf8',
    ).split('ALTER TABLE')[0];
    await expect(
      db.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            email: 'roleless@example.test',
            password: 'synthetic-unused-hash',
          },
        });
        await tx.$executeRawUnsafe(preflight);
      }),
    ).rejects.toThrow('Incompatible account roles');
    await expect(
      db.$transaction(async (tx) => {
        const role = await tx.role.findUniqueOrThrow({
          where: { name: 'ADMIN' },
        });
        await tx.user.create({
          data: {
            email: admin.email.toUpperCase(),
            password: 'synthetic-unused-hash',
            roles: { create: { roleId: role.id } },
          },
        });
        await tx.$executeRawUnsafe(preflight);
      }),
    ).rejects.toThrow('Duplicate normalized account emails');
  });

  it('creates either role without sessions and validates fields and normalized emails', async () => {
    const email = `${randomUUID()}@example.com`;
    const response = await api()
      .post('/users')
      .set(auth())
      .send({
        firstName: ' Ada ',
        email: email.toUpperCase(),
        password,
        role: 'ADMIN',
      })
      .expect(201);
    const user = response.body as User;
    expect(user.firstName).toBe('Ada');
    expect(user.email).toBe(email);
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('accessToken');
    expect(await db.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    await api()
      .post('/users')
      .set(auth())
      .send({ firstName: 'Otro', email, password, role: 'VENDEDOR' })
      .expect(409);
    for (const values of [
      { firstName: ' ' },
      { password: 'short' },
      { password: 'á'.repeat(37) },
      { role: 'OWNER' },
    ])
      await api()
        .post('/users')
        .set(auth())
        .send({
          firstName: 'Vendedor',
          email: `${randomUUID()}@example.com`,
          password,
          role: 'VENDEDOR',
          ...values,
        })
        .expect(400);
    await api()
      .get('/users?page=1&pageSize=1&role=ADMIN&q=ada')
      .set(auth())
      .expect(200)
      .expect((res) => {
        expect((res.body as { items: unknown[] }).items).toHaveLength(1);
      });
  });
  it('rejects vendors on every administrative operation', async () => {
    const seller = await create();
    const login = await authService.login({ email: seller.email, password });
    for (const [method, path, body] of [
      ['get', '/users', undefined],
      [
        'post',
        '/users',
        { firstName: 'X', email: 'x@example.com', password, role: 'ADMIN' },
      ],
      ['patch', `/users/${admin.id}`, { version: 1, role: 'VENDEDOR' }],
      ['post', `/users/${admin.id}/delete`, { version: 1 }],
      ['post', `/users/${admin.id}/restore`, { version: 1 }],
    ] as const) {
      await api()
        [method](path)
        .set({ Authorization: `Bearer ${login.accessToken}` })
        .send(body)
        .expect(403);
    }
  });
  it('atomically transfers leads and pending independent/linked tasks and preserves completed history', async () => {
    const seller = await create();
    const replacement = await create();
    const login = await authService.login({ email: seller.email, password });
    const source = await db.leadSource.findFirstOrThrow();
    const lead = await db.lead.create({
      data: {
        name: 'Lead sintético',
        sourceId: source.id,
        assignedToId: seller.id,
      },
    });
    const task = {
      contact: 'Sintético',
      title: 'Llamar',
      ownerId: seller.id,
      createdById: seller.id,
      dueAt: new Date(),
    };
    await db.commercialTask.create({ data: { ...task, leadId: lead.id } });
    await db.commercialTask.create({ data: task });
    const completed = await db.commercialTask.create({
      data: { ...task, leadId: lead.id, completedAt: new Date() },
    });
    await api()
      .post(`/users/${seller.id}/delete`)
      .set(auth())
      .send({ version: 1 })
      .expect(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: seller.id } })).isActive,
    ).toBe(true);
    await api()
      .post(`/users/${seller.id}/delete`)
      .set(auth())
      .send({ version: 1, replacementId: replacement.id })
      .expect(201);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: lead.id } }))
        .assignedToId,
    ).toBe(replacement.id);
    expect(
      await db.commercialTask.count({
        where: { ownerId: replacement.id, completedAt: null },
      }),
    ).toBe(2);
    expect(
      (
        await db.commercialTask.findUniqueOrThrow({
          where: { id: completed.id },
        })
      ).ownerId,
    ).toBe(seller.id);
    expect(
      await db.accountAudit.count({
        where: { targetId: seller.id, kind: 'transferred' },
      }),
    ).toBe(1);
    await api()
      .get('/users/me')
      .set({ Authorization: `Bearer ${login.accessToken}` })
      .expect(401);
    await expect(authService.refresh(login.refreshToken)).rejects.toThrow();
    await api()
      .post(`/users/${seller.id}/restore`)
      .set(auth())
      .send({ version: 2, password: password + '-new' })
      .expect(201);
    const restored = await db.user.findUniqueOrThrow({
      where: { id: seller.id },
    });
    expect(restored.receivesLeads).toBe(false);
    expect(restored.deletedAt).toBeNull();
    expect(await db.lead.count({ where: { assignedToId: seller.id } })).toBe(0);
    await expect(
      authService.login({ email: seller.email, password }),
    ).rejects.toThrow();
    await expect(
      authService.login({ email: seller.email, password: password + '-new' }),
    ).resolves.toHaveProperty('accessToken');
  });
  it('detects stale versions, preserves password on ordinary edits, revokes on credential/role edits', async () => {
    const seller = await create();
    const login = await authService.login({ email: seller.email, password });
    await api()
      .patch(`/users/${seller.id}`)
      .set(auth())
      .send({ version: 1, firstName: 'Renombrado' })
      .expect(200);
    await api()
      .patch(`/users/${seller.id}`)
      .set(auth())
      .send({ version: 1, firstName: 'Obsoleto' })
      .expect(409);
    await api()
      .get('/users/me')
      .set({ Authorization: `Bearer ${login.accessToken}` })
      .expect(200);
    await api()
      .patch(`/users/${seller.id}`)
      .set(auth())
      .send({ version: 2, email: `${randomUUID()}@example.com`, role: 'ADMIN' })
      .expect(200);
    await api()
      .get('/users/me')
      .set({ Authorization: `Bearer ${login.accessToken}` })
      .expect(401);
    await expect(authService.refresh(login.refreshToken)).rejects.toThrow();
    await api()
      .post(`/users/${admin.id}/delete`)
      .set(auth())
      .send({ version: admin.version })
      .expect(400);
    await api()
      .patch(`/users/${admin.id}`)
      .set(auth())
      .send({ version: admin.version, role: 'VENDEDOR' })
      .expect(400);
  });
  it('does not let simultaneous password revocation and refresh leave a surviving session', async () => {
    const seller = await create();
    const login = await authService.login({ email: seller.email, password });
    const results = await Promise.allSettled([
      authService.refresh(login.refreshToken),
      accounts.change(
        seller.id,
        { version: 1, password: password + '-changed' },
        actor(),
      ),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(await db.refreshToken.count({ where: { userId: seller.id } })).toBe(
      0,
    );
    if (results[0].status === 'fulfilled')
      await api()
        .get('/users/me')
        .set({ Authorization: `Bearer ${results[0].value.accessToken}` })
        .expect(401);
  });
  it('serializes login with deactivation and revokes all concurrently issued access', async () => {
    const seller = await create();
    const results = await Promise.allSettled([
      authService.login({ email: seller.email, password }),
      accounts.change(seller.id, { version: 1 }, actor(), 'deactivate'),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(await db.refreshToken.count({ where: { userId: seller.id } })).toBe(
      0,
    );
    if (results[0].status === 'fulfilled')
      await api()
        .get('/users/me')
        .set({ Authorization: `Bearer ${results[0].value.accessToken}` })
        .expect(401);
  });
  it('serializes simultaneous demotions without removing the final active admin', async () => {
    // Remove other synthetic admins from this test fixture, preserving the primary admin.
    await db.user.updateMany({
      where: {
        id: { not: admin.id },
        roles: { some: { role: { name: 'ADMIN' } } },
      },
      data: { isActive: false },
    });
    const second = await create('ADMIN');
    const secondActor = {
      id: second.id,
      email: second.email,
      roles: ['ADMIN'],
      permissions: ['users:manage'],
    };
    const results = await Promise.allSettled([
      accounts.change(second.id, { version: 1, role: 'VENDEDOR' }, actor()),
      accounts.change(
        admin.id,
        { version: admin.version, role: 'VENDEDOR' },
        secondActor,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.user.count({
        where: {
          isActive: true,
          deletedAt: null,
          roles: { some: { role: { name: 'ADMIN' } } },
        },
      }),
    ).toBe(1);
  });
});
