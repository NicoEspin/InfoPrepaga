// Integration harness: only a disposable local database named starter_test is allowed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cpSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = requireBackend('@prisma/client');
const bcrypt = requireBackend('bcrypt');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Set DATABASE_URL to a disposable database');
const url = new URL(databaseUrl);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/starter_test',
  'Only a local database named starter_test is accepted');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const children = [];
let checks = 0;
const api = 'http://127.0.0.1:3311';
const web = 'http://127.0.0.1:3310';
const secret = randomBytes(32).toString('hex');
const password = randomBytes(20).toString('hex');
const email = `admin-${randomBytes(6).toString('hex')}@example.test`;

function start(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: path.join(root, cwd), env: { ...process.env, ...env }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-8000); });
  child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-8000); });
  child.on('error', (error) => { logs += error.message; });
  children.push(child);
  return { child, logs: () => logs };
}

async function waitFor(target, proc) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (proc.child.exitCode !== null) throw new Error(proc.logs());
    try { if ((await fetch(target)).ok) return; } catch { /* Starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not start: ${proc.logs()}`);
}

async function expectStatus(endpoint, status, options = {}) {
  const response = await fetch(endpoint, { ...options, redirect: 'manual' });
  assert.equal(response.status, status, `${new URL(endpoint).pathname}: expected ${status}, received ${response.status}`);
  checks++;
  return response;
}
const json = (body, token) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body)
});
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

try {
  const adminRole = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
  const sellerRole = await prisma.role.upsert({ where: { name: 'VENDEDOR' }, update: {}, create: { name: 'VENDEDOR' } });
  const permission = await prisma.permission.upsert({
    where: { action_resource: { action: 'read', resource: 'users' } }, update: {},
    create: { action: 'read', resource: 'users' }
  });
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
    update: {}, create: { roleId: adminRole.id, permissionId: permission.id }
  });
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({ data: { email, password: hash, roles: { create: { roleId: adminRole.id } } } });
  const seller = await prisma.user.create({ data: { email: `vendor-${email}`, password: hash, roles: { create: { roleId: sellerRole.id } } } });
  const backend = start('dist/main.js', [], 'backend', {
    NODE_ENV: 'test', PORT: '3311', DATABASE_URL: databaseUrl, JWT_ACCESS_SECRET: secret,
    CORS_ORIGIN: web, JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d'
  });
  await waitFor(`${api}/ready`, backend);

  await expectStatus(`${api}/users`, 401);
  await expectStatus(`${api}/auth/register`, 401, json({ email: 'new@example.test', password }));
  const adminLogin = await expectStatus(`${api}/auth/login`, 200, json({ email, password }));
  const adminTokens = await adminLogin.json();
  const sellerLogin = await expectStatus(`${api}/auth/login`, 200, json({ email: seller.email, password }));
  const sellerTokens = await sellerLogin.json();
  const profile = await expectStatus(`${api}/users/me`, 200, bearer(sellerTokens.accessToken));
  assert.deepEqual((await profile.json()).roles, ['VENDEDOR']);
  for (const endpoint of ['/users', `/users/${admin.id}`, '/roles', '/permissions']) {
    await expectStatus(api + endpoint, 403, bearer(sellerTokens.accessToken));
  }
  await expectStatus(`${api}/users/${admin.id}/roles`, 403, {
    ...json({ roleIds: [adminRole.id] }, sellerTokens.accessToken), method: 'PATCH'
  });
  await expectStatus(`${api}/auth/register`, 403, json({ email: 'new@example.test', password }, sellerTokens.accessToken));
  await expectStatus(`${api}/auth/register`, 400, json({ email: 'new@example.test', password, role: 'ADMIN' }, adminTokens.accessToken));
  const created = await expectStatus(`${api}/auth/register`, 201, json({ email: `created-${email}`, password }, adminTokens.accessToken));
  assert.deepEqual((await created.json()).user.roles, ['VENDEDOR']);
  const users = await expectStatus(`${api}/users`, 200, bearer(adminTokens.accessToken));
  assert(!(await users.text()).includes('"password"'));

  const race = await Promise.all([1, 2].map(() => fetch(`${api}/auth/refresh`, json({ refreshToken: sellerTokens.refreshToken }))));
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 401]);
  checks++;
  const rotated = await race.find((r) => r.status === 200).json();
  await expectStatus(`${api}/users/me`, 401, bearer(sellerTokens.accessToken));
  await expectStatus(`${api}/auth/refresh`, 401, json({ refreshToken: sellerTokens.refreshToken }));
  await expectStatus(`${api}/users/me`, 200, bearer(rotated.accessToken));
  await expectStatus(`${api}/auth/logout`, 200, json({ refreshToken: rotated.refreshToken }));
  await expectStatus(`${api}/users/me`, 401, bearer(rotated.accessToken));

  cpSync(path.join(root, 'frontend/public'), path.join(root, 'frontend/.next/standalone/public'), { recursive: true });
  cpSync(path.join(root, 'frontend/.next/static'), path.join(root, 'frontend/.next/standalone/.next/static'), { recursive: true });
  const frontend = start('server.js', [], 'frontend/.next/standalone', {
    NODE_ENV: 'production', PORT: '3310', HOSTNAME: '127.0.0.1', BACKEND_URL: api,
    APP_ORIGIN: web, ENABLE_STARTER_DEMOS: 'true'
  });
  await waitFor(`${web}/api/health`, frontend);
  const health = await expectStatus(`${web}/api/health`, 200);
  assert.equal((await health.json()).backend, 'connected');
  await expectStatus(`${web}/`, 200);
  await expectStatus(`${web}/auth/sign-in`, 200);
  await expectStatus(`${web}/dashboard/overview`, 404);
  await expectStatus(`${web}/api/products`, 404);
  await expectStatus(`${web}/api/users`, 404);
  await expectStatus(`${web}/api/auth/login`, 403, json({ email, password }));
  await expectStatus(`${web}/api/auth/login`, 403, {
    ...json({ email, password }), headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }
  });
  const bffLogin = await expectStatus(`${web}/api/auth/login`, 200, {
    ...json({ email, password }), headers: { 'Content-Type': 'application/json', Origin: web }
  });
  const payload = await bffLogin.text();
  assert.equal(payload, '{"ok":true}');
  const setCookies = bffLogin.headers.getSetCookie();
  assert.equal(setCookies.length, 2);
  for (const cookie of setCookies) {
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=strict/i);
  }
  const cookies = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const access = setCookies.find((cookie) => cookie.startsWith('ip_access=')).split(';')[0].slice('ip_access='.length);
  await expectStatus(`${api}/users/me`, 200, bearer(access));
  await expectStatus(`${web}/api/auth/logout`, 200, { method: 'POST', headers: { Origin: web, Cookie: cookies } });
  await expectStatus(`${api}/users/me`, 401, bearer(access));
  await expectStatus(`${web}/api/auth/refresh`, 401, { method: 'POST', headers: { Origin: web, Cookie: cookies } });

  const dev = 'http://127.0.0.1:3312';
  const devServer = start('scripts/verify-dev-server.mjs', [], '.', {
    NODE_ENV: 'development', BACKEND_URL: api, APP_ORIGIN: dev, ENABLE_STARTER_DEMOS: 'true'
  });
  await waitFor(`${dev}/api/health`, devServer);
  await expectStatus(`${dev}/dashboard/overview`, 307);
  await expectStatus(`${dev}/api/products`, 401);
  const devLogin = await expectStatus(`${dev}/api/auth/login`, 200, {
    ...json({ email, password }), headers: { 'Content-Type': 'application/json', Origin: dev }
  });
  const devCookies = devLogin.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  assert(!devLogin.headers.getSetCookie().some((cookie) => /; Secure/i.test(cookie)));
  const demoPage = await expectStatus(`${dev}/dashboard/overview`, 200, { headers: { Cookie: devCookies } });
  assert.match(await demoPage.text(), /PLANTILLA DE PRUEBAS/);
  await expectStatus(`${dev}/api/products`, 200, { headers: { Cookie: devCookies } });
  await expectStatus(`${dev}/api/products`, 403, { method: 'POST', headers: { Cookie: devCookies } });
  const vendorDevLogin = await expectStatus(`${dev}/api/auth/login`, 200, {
    ...json({ email: seller.email, password }), headers: { 'Content-Type': 'application/json', Origin: dev }
  });
  const vendorDevCookies = vendorDevLogin.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  await expectStatus(`${dev}/api/products`, 403, { headers: { Cookie: vendorDevCookies } });
  await expectStatus(`${dev}/dashboard/overview`, 404, { headers: { Cookie: vendorDevCookies } });

  // Verify protection actually runs in the global guard chain.
  for (let index = 0; index < 12; index++) {
    const response = await fetch(`${api}/auth/login`, json({ email: 'missing@example.test', password }));
    if (response.status === 429) { checks++; break; }
    assert.equal(response.status, 401);
    if (index === 11) throw new Error('Auth rate limiting was not enforced');
  }
  console.log(`PASS: ${checks} integration checks with PostgreSQL, NestJS, Next.js standalone and development demos`);
} finally {
  for (const child of children) child.kill();
  await prisma.$disconnect();
}
