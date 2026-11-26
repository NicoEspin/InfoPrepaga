// Real PostgreSQL + NestJS + production Next.js. No requests to public sites.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const req = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = req('@prisma/client');
const bcrypt = req('bcrypt');
const url = new URL(process.env.CRM_TEST_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/starter_test',
  'Set CRM_TEST_DATABASE_URL to a disposable local starter_test database');
const schema = `landing_test_${randomBytes(8).toString('hex')}`;
url.searchParams.set('schema', schema);
const env = {
  ...process.env, DATABASE_URL: url.href, NODE_ENV: 'test', PORT: '3341',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), CORS_ORIGIN: 'http://localhost:3340',
  YCLOUD_ENABLED: 'false', CRM_DATA_CONTROLLER_ID: 'synthetic-controller',
};
const tokens = { infoprepaga: randomBytes(32).toString('hex'), 'coberturas-medicas': randomBytes(32).toString('hex') };
for (const [landing, prefix] of [['infoprepaga', 'INFOPREPAGA'], ['coberturas-medicas', 'COBERTURAS_MEDICAS']]) {
  Object.assign(env, {
    [`LANDING_${prefix}_ENABLED`]: 'true', [`LANDING_${prefix}_TOKEN`]: tokens[landing],
    [`LANDING_${prefix}_PREVIOUS_TOKEN`]: '', [`LANDING_${prefix}_CONTROLLER_ID`]: 'synthetic-controller',
    [`LANDING_${prefix}_PRIVACY_VERSION`]: 'synthetic-2026-01',
  });
}
const api = 'http://127.0.0.1:3341', web = 'http://localhost:3340';
const children = [];
let sensitiveOutput = false;
const groups = [];
let checks = 0;
function start(file, cwd, extra, args = []) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: path.join(root, cwd), env: { ...env, ...extra }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const collect = (chunk) => {
    logs = (logs + chunk).slice(-4000);
    if ([tokens.infoprepaga, tokens['coberturas-medicas'], 'María José Prueba Sintética', '+5491123456789', 'separate@example.test']
      .some((value) => logs.includes(value))) sensitiveOutput = true;
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  children.push(child);
  return { child, logs: () => logs };
}
async function ready(target, proc) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (proc.child.exitCode !== null) throw new Error(proc.logs());
    try { if ((await fetch(target)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local server unavailable');
}
async function stop(proc) {
  if (proc.child.exitCode !== null || proc.child.signalCode !== null) return;
  const ended = new Promise((resolve) => proc.child.once('exit', resolve));
  proc.child.kill();
  await ended;
}
async function check(target, expected, options = {}) {
  const response = await fetch(target, { ...options, redirect: 'manual' });
  assert.equal(response.status, expected, `${new URL(target).pathname}: expected ${expected}, received ${response.status}`);
  checks++;
  return response;
}
const json = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const payload = (formId = 'modal') => ({
  submissionId: randomUUID(), formId, name: 'María José Prueba Sintética',
  phone: '+54 9 11 2345-6789', consent: true, privacyVersion: 'synthetic-2026-01',
  employment: 'DEPENDENCIA', age: 35, group: 'INDIVIDUAL', plan: 'SIN_DEFINIR',
});
const send = (landing, body, expected, token = tokens[landing], headers = {}) =>
  check(`${web}/api/integrations/v1/leads/${landing}`, expected,
    json(body, { Authorization: `Bearer ${token}`, ...headers }));
const migrate = (schemaFile) => execFileSync(process.execPath,
  [req.resolve('prisma/build/index.js'), 'migrate', 'deploy', ...(schemaFile ? ['--schema', schemaFile] : [])],
  { cwd: path.join(root, 'backend'), env, stdio: 'pipe' });
let db;
let report;
try {
  // Apply the old migration chain first, insert an existing contact, then upgrade.
  const previous = mkdtempSync(path.join(tmpdir(), 'infoprepaga-landing-migration-'));
  cpSync(path.join(root, 'backend/prisma/schema.prisma'), path.join(previous, 'schema.prisma'));
  mkdirSync(path.join(previous, 'migrations'));
  cpSync(path.join(root, 'backend/prisma/migrations'), path.join(previous, 'migrations'), {
    recursive: true, filter: (file) => !file.includes('20261126120000_landing_submissions'),
  });
  migrate(path.join(previous, 'schema.prisma'));
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const sources = await db.leadSource.findMany();
  const ip = sources.find((source) => source.code === 'LANDING_IP');
  const cm = sources.find((source) => source.code === 'LANDING_CM');
  const legacy = await db.lead.create({ data: {
    name: 'Contacto preexistente sintético', phone: '+5491123456789',
    sourceId: ip.id, entrySourceId: ip.id, contactKeysVersion: 0,
  } });
  migrate();
  migrate();
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: legacy.id } })).name, legacy.name);
  groups.push('migration over preexisting lead; repeat deploy');
  const adminRole = await db.role.create({ data: { name: 'ADMIN' } });
  const sellerRole = await db.role.create({ data: { name: 'VENDEDOR' } });
  const password = 'Synthetic-local-test-password-2026';
  const passwordHash = await bcrypt.hash(password, 4);
  const accounts = [];
  for (const [name, role] of [['admin', adminRole], ['seller-a', sellerRole], ['seller-b', sellerRole]]) {
    accounts.push(await db.user.create({ data: { email: `${name}@example.test`, password: passwordHash,
      firstName: name, receivesLeads: false, roles: { create: { roleId: role.id } } } }));
  }
  let backend = start('dist/main.js', 'backend', {});
  await ready(`${api}/ready`, backend);
  const frontend = start('node_modules/next/dist/bin/next', 'frontend', {
    NODE_ENV: 'production', BACKEND_URL: api, APP_ORIGIN: web,
  }, ['start', '--hostname', '127.0.0.1', '--port', '3340']);
  await ready(`${web}/api/health`, frontend);
  async function login(account) {
    const response = await check(`${web}/api/auth/login`, 200,
      json({ email: account.email, password }, { Origin: web }));
    const cookies = response.headers.getSetCookie();
    assert(cookies.every((cookie) => /HttpOnly/i.test(cookie) && /SameSite=strict/i.test(cookie)));
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }
  const [adminCookie, sellerCookie, otherCookie] = await Promise.all(accounts.map(login));
  const protectedGet = (suffix, cookie, expected = 200) => check(`${web}/api/crm/${suffix}`, expected,
    { headers: { Cookie: cookie } });
  await check(`${web}/api/auth/login`, 403, json({}, { Origin: 'https://infoprepaga.com.ar' }));
  await check(`${web}/api/auth/login`, 403, json({}));
  await check(`${web}/api/crm/leads`, 401);
  await check(`${web}/api/crm/leads`, 403, json({}, { Origin: 'https://coberturasmedicas.com.ar', Cookie: adminCookie }));
  await check(`${api}/`, 200);
  groups.push('valid login behind Next; login Origin 403 unchanged; protected API/health');
  // Both endpoints work without Origin or cookies (normal server-to-server path).
  const submissions = [];
  for (const [landing, forms, source] of [['infoprepaga', ['modal', 'inferior'], ip], ['coberturas-medicas', ['principal', 'inferior'], cm]]) {
    for (const form of forms) {
      const input = { ...payload(form), ...(landing === 'coberturas-medicas' && { email: 'consulta@example.test' }) };
      assert.deepEqual(await (await send(landing, input, 201)).json(), { ok: true });
      await send(landing, input, 200);
      const entry = await db.landingSubmission.findUniqueOrThrow({ where: { landing_submissionId: { landing, submissionId: input.submissionId } } });
      assert.equal(entry.sourceId, source.id);
      assert.equal(entry.leadId, legacy.id);
      assert.equal(entry.consent, true);
      assert.equal(entry.formId, form);
      const filtered = await (await protectedGet(`leads?sourceId=${source.id}`, adminCookie)).json();
      assert(filtered.items.some((lead) => lead.id === legacy.id));
      submissions.push({ landing, input, entry });
    }
  }
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: legacy.id } })).sourceId, ip.id);
  assert.equal(await db.lead.count(), 1);
  assert.equal(await db.leadActivity.count({ where: { kind: 'landing-inquiry' } }), 4);
  groups.push('four forms; source filtering; new inquiries link without rewriting history');
  const first = submissions[0];
  await send('infoprepaga', { ...first.input, name: 'Otro nombre' }, 409);
  await send('infoprepaga', { ...first.input, phone: '011 15 2345-6789', name: '  María  José Prueba Sintética  ', submissionId: first.input.submissionId.toUpperCase() }, 200);
  await send('infoprepaga', payload(), 401, tokens['coberturas-medicas']);
  await send('coberturas-medicas', { ...payload('principal'), email: 'prueba@example.test' }, 401, tokens.infoprepaga);
  await send('infoprepaga', payload(), 401, 'invalid');
  await check(`${web}/api/integrations/v1/leads/infoprepaga`, 401, json(payload(), { Cookie: adminCookie }));
  for (const extra of [{ sourceId: cm.id }, { assignedToId: accounts[1].id }, { controllerId: 'other' }, { stage: 'CLOSED' }, { utm: { utm_source: 'unsafe' } }, { consent: false }, { consent: undefined }, { privacyVersion: 'not-published' }, { phone: '123' }, { age: '35' }, { formId: 'principal' }, { health: 'excluded' }])
    await send('infoprepaga', { ...payload(), ...extra }, 400);
  await send('coberturas-medicas', payload('principal'), 400);
  await send('infoprepaga', payload(), 403, tokens.infoprepaga, { Origin: 'https://attacker.invalid' });
  await check(`${web}/api/integrations/v1/leads/infoprepaga`, 415, { method: 'POST', headers: { Authorization: `Bearer ${tokens.infoprepaga}`, 'content-type': 'text/plain' }, body: '{}' });
  await check(`${web}/api/integrations/v1/leads/infoprepaga`, 400, { method: 'POST', headers: { Authorization: `Bearer ${tokens.infoprepaga}`, 'content-type': 'application/json' }, body: '{broken' });
  await send('infoprepaga', { ...payload(), name: 'x'.repeat(9000) }, 413);
  await check(`${api}/integrations/v1/leads/infoprepaga`, 413, json({ name: 'x'.repeat(9000) }, { Authorization: `Bearer ${tokens.infoprepaga}` }));
  for (const [landing, origin] of [['infoprepaga', 'https://infoprepaga.com.ar'], ['coberturas-medicas', 'https://coberturasmedicas.com.ar']]) {
    const preflight = await check(`${web}/api/integrations/v1/leads/${landing}`, 204, { method: 'OPTIONS', headers: { Origin: origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    const input = { ...payload(landing === 'infoprepaga' ? 'modal' : 'principal'), email: 'cors@example.test' };
    const response = await send(landing, input, 201, tokens[landing], { Origin: origin });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  await check(`${web}/api/integrations/v1/leads/infoprepaga`, 403, { method: 'OPTIONS', headers: { Origin: 'https://attacker.invalid' } });
  groups.push('credentials scoped; forbidden authority fields; schema/consent/phone/body limits; scoped CORS');
  // No candidates: persist pending. Enable a seller and let the existing drain work.
  const pendingInput = { ...payload(), phone: '+5491123456790' };
  const countsBefore = await db.lead.count();
  const turnBefore = await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } });
  const responses = await Promise.all([0, 1].map(() =>
    fetch(`${web}/api/integrations/v1/leads/infoprepaga`,
      json(pendingInput, { Authorization: `Bearer ${tokens.infoprepaga}` }))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  checks += 2;
  assert.equal(await db.lead.count(), countsBefore + 1);
  const pending = await db.landingSubmission.findUniqueOrThrow({ where: { landing_submissionId: { landing: 'infoprepaga', submissionId: pendingInput.submissionId } } });
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: pending.leadId } })).assignedToId, null);
  await send('infoprepaga', pendingInput, 200);
  assert.deepEqual(await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } }), turnBefore);
  const raced = { ...payload(), phone: '+5491123456795' };
  const conflictRace = await Promise.all(['Primer Nombre', 'Segundo Nombre'].map((name) =>
    fetch(`${web}/api/integrations/v1/leads/infoprepaga`,
      json({ ...raced, name }, { Authorization: `Bearer ${tokens.infoprepaga}` }))));
  assert.deepEqual(conflictRace.map((response) => response.status).sort(), [201, 409]);
  checks += 2;
  assert.equal(await db.landingSubmission.count({ where: { landing: 'infoprepaga', submissionId: raced.submissionId } }), 1);
  const setSeller = (id) => check(`${web}/api/crm/users/${id}`, 200, { ...json({ receivesLeads: true }, { Cookie: adminCookie, Origin: web }), method: 'PATCH' });
  await setSeller(accounts[1].id);
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: pending.leadId } })).assignedToId, accounts[1].id);
  await setSeller(accounts[2].id);
  const assignedInput = { ...payload(), phone: '+5491123456791' };
  await send('infoprepaga', assignedInput, 201);
  const assigned = await db.landingSubmission.findUniqueOrThrow({ where: { landing_submissionId: { landing: 'infoprepaga', submissionId: assignedInput.submissionId } } });
  const assignedLead = await db.lead.findUniqueOrThrow({ where: { id: assigned.leadId } });
  assert(assignedLead.assignedToId);
  const stateBeforeReplay = await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } });
  await send('infoprepaga', assignedInput, 200);
  assert.deepEqual(await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } }), stateBeforeReplay);
  const [ownerCookie, nonOwnerCookie] = assignedLead.assignedToId === accounts[1].id ? [sellerCookie, otherCookie] : [otherCookie, sellerCookie];
  await protectedGet(`leads/${assigned.leadId}`, ownerCookie);
  await protectedGet(`leads/${assigned.leadId}`, nonOwnerCookie, 404);
  await protectedGet(`leads/${assigned.leadId}/history`, nonOwnerCookie, 404);
  const hidden = await (await protectedGet(`leads?q=${encodeURIComponent(assignedLead.phone)}&sourceId=${ip.id}`, nonOwnerCookie)).json();
  assert.equal(hidden.total, 0);
  await check(`${web}/api/crm/leads/${assigned.leadId}`, 404, { ...json({ version: assignedLead.version, name: 'Unauthorized' }, { Origin: web, Cookie: nonOwnerCookie }), method: 'PATCH' });
  await check(`${web}/api/crm/leads`, 403, json({ name: 'Manual', phone: '+5491123456792', sourceId: ip.id }, { Origin: web, Cookie: sellerCookie }));
  await check(`${web}/api/crm/leads`, 201, json({ name: 'Manual sintético', phone: '+5491123456793', sourceId: cm.id }, { Origin: web, Cookie: adminCookie }));
  groups.push('concurrent idempotency; pending drain; normal assignment; manual creation; seller ownership');
  // Conflicting contact identities: never merge or overwrite either existing record.
  const conflicting = await db.lead.create({ data: { name: 'Otra ficha sintética', email: 'separate@example.test', emailKey: 'separate@example.test', sourceId: cm.id } });
  const conflictInput = { ...payload(), email: 'separate@example.test' };
  await send('infoprepaga', conflictInput, 201);
  const review = await db.landingSubmission.findUniqueOrThrow({ where: { landing_submissionId: { landing: 'infoprepaga', submissionId: conflictInput.submissionId } } });
  assert(review.needsReview);
  assert(![legacy.id, conflicting.id].includes(review.leadId));
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: legacy.id } })).name, legacy.name);
  groups.push('phone/email ambiguity preserved for administrative review');
  // A failure after lead insertion rolls back inquiry, lead, timeline and round-robin.
  await db.$executeRawUnsafe(`CREATE FUNCTION fail_landing_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_landing_test BEFORE INSERT ON landing_submissions FOR EACH ROW EXECUTE FUNCTION fail_landing_test()`);
  const failedInput = { ...payload(), phone: '+5491123456794' };
  const beforeFailure = await db.lead.count();
  const stateBeforeFailure = await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } });
  await send('infoprepaga', failedInput, 503);
  assert.equal(await db.lead.count(), beforeFailure);
  assert.deepEqual(await db.assignmentState.findUniqueOrThrow({ where: { id: 1 } }), stateBeforeFailure);
  await db.$executeRawUnsafe('DROP TRIGGER fail_landing_test ON landing_submissions');
  await send('infoprepaga', failedInput, 201);
  groups.push('atomic rollback and recovery with the same submission ID');
  // Exhaust only the dedicated handler; health/login retain their own throttling buckets.
  let limited = false;
  for (let attempt = 0; attempt < 65; attempt++) {
    const response = await fetch(`${web}/api/integrations/v1/leads/infoprepaga`, json(first.input, { Authorization: `Bearer ${tokens.infoprepaga}` }));
    if (response.status === 429) { assert(response.headers.get('retry-after')); limited = true; break; }
    assert.equal(response.status, 200);
  }
  assert(limited);
  await check(`${web}/api/health`, 200);
  await login(accounts[0]);
  groups.push('rate limit 429/Retry-After; login and health unaffected');
  // Restart with a different legal entity: credentials cannot bypass this gate.
  await stop(backend);
  backend = start('dist/main.js', 'backend', { LANDING_COBERTURAS_MEDICAS_CONTROLLER_ID: 'distinct-controller' });
  await ready(`${api}/ready`, backend);
  const countBeforeBlocked = await db.landingSubmission.count();
  await send('coberturas-medicas', { ...payload('principal'), email: 'blocked@example.test' }, 503);
  assert.equal(await db.landingSubmission.count(), countBeforeBlocked);
  await stop(backend);
  await send('infoprepaga', first.input, 503);
  groups.push('distinct legal entity blocked before matching; backend outage never confirms');
  // No application logger should emit these synthetic contact values or tokens.
  assert(!sensitiveOutput, 'No credentials/contact values in application logs');
  report = { checks, groups, scope: 'isolated local PostgreSQL, production Next HTTP → private NestJS' };
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await ended;
    }
  }
  if (db) {
    // Drop only the generated schema, never public or an existing user schema.
    assert(/^landing_test_[0-9a-f]{16}$/.test(schema));
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
}
console.log(JSON.stringify(report, null, 2));
