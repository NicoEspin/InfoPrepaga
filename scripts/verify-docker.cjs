// Run through stdin inside the API container of the isolated verification stack.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.STARTER_DOCKER_VERIFY, 'true', 'Explicit verification flag required');
assert.equal(database.hostname, 'postgres', 'Only the isolated Compose database is accepted');
assert.equal(database.pathname, '/starter_test', 'Only the disposable starter_test database is accepted');
assert.equal(process.env.CORS_ORIGIN, 'http://127.0.0.1:3330');
const db = new PrismaClient();
const api = 'http://127.0.0.1:3001';
const web = 'http://web:3000';
const origin = 'http://127.0.0.1:3330';
let checks = 0;

async function status(url, expected, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'manual' });
  assert.equal(response.status, expected, `${new URL(url).pathname}: HTTP ${response.status}, expected ${expected}`);
  checks++;
  return response;
}
const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

async function main() {
  assert.notEqual(process.getuid(), 0);
  assert(!fs.existsSync('/app/.env'));
  assert(!fs.existsSync('/app/node_modules/jest'));
  checks += 3;
  const version = await db.$queryRaw`SHOW server_version`;
  assert.match(version[0].server_version, /^16\.15/);
  const migrations = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
  assert(migrations.some((row) => row.migration_name === '20260801183024_init'));
  checks += 2;
  console.log(`Initial database state: ${await db.user.count()} users, ${await db.role.count()} roles`);

  const password = randomBytes(24).toString('hex');
  const email = `docker-${randomBytes(6).toString('hex')}@example.test`;
  const adminRole = await db.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
  const vendorRole = await db.role.upsert({ where: { name: 'VENDEDOR' }, update: {}, create: { name: 'VENDEDOR' } });
  const hash = await bcrypt.hash(password, 12);
  await db.user.create({ data: { email, password: hash, roles: { create: { roleId: adminRole.id } } } });
  await db.user.create({ data: { email: `vendor-${email}`, password: hash, roles: { create: { roleId: vendorRole.id } } } });

  await status(`${api}/ready`, 200);
  const health = await status(`${web}/api/health`, 200);
  assert.equal((await health.json()).backend, 'connected');
  const home = await status(`${web}/`, 200);
  const html = await home.text();
  const css = /href="([^\"]+\.css[^\"]*)"/.exec(html);
  assert(css, 'Production HTML must reference its CSS');
  await status(new URL(css[1].replaceAll('&amp;', '&'), web), 200);
  await status(`${web}/auth/sign-in`, 200);
  await status(`${web}/dashboard/overview`, 404);
  await status(`${web}/api/users`, 404);
  await status(`${api}/docs`, 404);
  await status(`${api}/users`, 401);
  await status(`${api}/auth/register`, 401, json({ email: `new-${email}`, password }));
  await status(`${web}/api/auth/login`, 403, json({ email, password }));

  const login = await status(`${web}/api/auth/login`, 200, {
    ...json({ email, password }), headers: { 'Content-Type': 'application/json', Origin: origin }
  });
  assert.deepEqual(await login.json(), { ok: true });
  const cookies = login.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    assert.match(cookie, /; Secure/i);
  }
  checks++;
  const access = cookies.find((cookie) => cookie.startsWith('ip_access=')).split(';')[0].slice('ip_access='.length);
  const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const me = await status(`${api}/users/me`, 200, bearer(access));
  const profile = await me.json();
  assert.deepEqual(profile.roles, ['ADMIN']);
  assert(!('password' in profile));
  await status(`${web}/api/auth/logout`, 200, { method: 'POST', headers: { Origin: origin, Cookie: cookieHeader } });
  await status(`${api}/users/me`, 401, bearer(access));
  await status(`${web}/api/auth/refresh`, 401, { method: 'POST', headers: { Origin: origin, Cookie: cookieHeader } });

  const vendorLogin = await status(`${api}/auth/login`, 200, json({ email: `vendor-${email}`, password }));
  const vendor = await vendorLogin.json();
  await status(`${api}/users`, 403, bearer(vendor.accessToken));
  await status(`${api}/roles`, 403, bearer(vendor.accessToken));
  await status(`${api}/permissions`, 403, bearer(vendor.accessToken));
  console.log(`PASS: ${checks} Docker checks; PostgreSQL 16.15, Prisma runtime, production assets, authentication and vendor isolation`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
