// Real built NestJS + Next.js; accepts only a disposable local starter_test.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebhookProxy } from './ycloud-webhook-proxy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcrypt');
const database = new URL(process.env.CRM_TEST_DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/starter_test', 'Use only localhost/starter_test');
database.searchParams.set('schema', `ycloud_live_${randomBytes(8).toString('hex')}`);
const db = new PrismaClient({ datasources: { db: { url: database.href } } });
const secret = randomBytes(32).toString('hex');
const password = 'Synthetic-YCloud-live-test-2026';
const api = 'http://127.0.0.1:3341';
const web = 'http://127.0.0.1:3340';
const children = [];
let proxy;
let receiver = web;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function start(file, cwd, env, args = []) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: path.join(root, cwd), env: { ...process.env, ...env }, windowsHide: true, stdio: 'ignore',
  });
  child.on('error', () => {});
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let n = 0; n < 100; n++) {
    assert(child.exitCode === null, 'Test server exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Starting. */ }
    await wait(200);
  }
  throw new Error('Test server readiness timeout');
}
function signature(body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return `t=${timestamp},s=${createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex')}`;
}
async function deliver(body, suppliedSignature = signature(body)) {
  return fetch(`${receiver}/webhooks/ycloud`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'ycloud-signature': suppliedSignature } });
}
try {
  execFileSync(process.execPath, [backendRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(root, 'backend'), env: { ...process.env, DATABASE_URL: database.href }, stdio: 'pipe' });
  const role = await db.role.create({ data: { name: 'ADMIN' } });
  await db.user.create({ data: { email: 'ycloud-live@example.com', password: await bcrypt.hash(password, 4), roles: { create: { roleId: role.id } } } });
  await db.leadSource.create({ data: { name: 'Prueba YCloud', code: 'BASE_YCLOUD_TEST' } });
  const server = start('dist/main.js', 'backend', {
    NODE_ENV: 'production', DATABASE_URL: database.href, PORT: '3341', JWT_ACCESS_SECRET: secret,
    CORS_ORIGIN: web, YCLOUD_ENABLED: 'true', YCLOUD_WEBHOOK_SECRET: secret,
    YCLOUD_ALLOW_NON_AD_TEST_MESSAGES: 'true', YCLOUD_TEST_SENDERS: '+14155550197',
    YCLOUD_WABA_ID: '123456789', YCLOUD_BUSINESS_PHONE_NUMBER: '+14155550100', YCLOUD_LEAD_SOURCE_CODE: 'BASE_YCLOUD_TEST',
    R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET_NAME: '',
  });
  await ready(`${api}/ready`, server);
  const frontend = start(frontendRequire.resolve('next/dist/bin/next'), 'frontend', {
    NODE_ENV: 'production', BACKEND_URL: api, APP_ORIGIN: web,
    YCLOUD_ENABLED: 'false', YCLOUD_WEBHOOK_SECRET: '', YCLOUD_WABA_ID: '', YCLOUD_BUSINESS_PHONE_NUMBER: '', YCLOUD_LEAD_SOURCE_CODE: '',
  }, ['start', '-H', '127.0.0.1', '-p', '3340']);
  await ready(`${web}/api/health`, frontend);
  proxy = createWebhookProxy(`${web}/webhooks/ycloud`);
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  receiver = `http://127.0.0.1:${proxy.address().port}`;
  assert.equal((await fetch(`${receiver}/api/crm/leads`)).status, 404);
  const raw = JSON.stringify({
    id: 'evt_live_synthetic', type: 'whatsapp.inbound_message.received', apiVersion: 'v2', createTime: new Date().toISOString(),
    whatsappInboundMessage: {
      id: 'message_live_synthetic', wamid: 'wamid.live.synthetic', wabaId: '123456789',
      to: '14155550100', from: '14155550198', sendTime: '2026-11-01T00:00:00.000Z', type: 'text',
      customerProfile: { name: 'Prueba sintética á 👋' }, text: { body: 'Mensaje que no debe persistirse' },
      referral: { source_type: 'ad', source_id: 'ad_live_synthetic', ctwa_clid: 'click_live_synthetic' },
    },
  }, null, 2) + '\n';
  assert.equal((await deliver(raw + ' ', signature(raw))).status, 401);
  const accepted = await deliver(raw);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).result, 'accepted');
  const repeated = await deliver(raw);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).result, 'duplicate');
  for (let n = 0; n < 100; n++) {
    const event = await db.yCloudInboundEvent.findUniqueOrThrow({ where: { id: 'evt_live_synthetic' } });
    if (event.status === 'PROCESSED') break;
    await wait(200);
  }
  const event = await db.yCloudInboundEvent.findUniqueOrThrow({ where: { id: 'evt_live_synthetic' } });
  assert.equal(event.status, 'PROCESSED');
  assert.equal(await db.lead.count(), 1);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: event.leadId } });
  assert.equal(lead.phoneKey, '+14155550198');
  assert.equal(lead.assignedToId, null);
  assert.equal(await db.leadActivity.count({ where: { kind: 'ycloud-inbound', actorId: null, leadId: lead.id } }), 1);
  const login = await fetch(`${web}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: web }, body: JSON.stringify({ email: 'ycloud-live@example.com', password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
  const inspected = await fetch(`${web}/api/crm/integrations/ycloud/events/evt_live_synthetic`, { headers: { cookie } });
  assert.equal(inspected.status, 200);
  assert.equal((await inspected.json()).leadId, lead.id);
  assert.equal((await fetch(`${web}/api/crm/integrations/ycloud/events`)).status, 401);
  const organic = JSON.parse(raw);
  organic.id = 'evt_live_organic';
  organic.whatsappInboundMessage.id = 'message_live_organic';
  organic.whatsappInboundMessage.wamid = 'wamid.live.organic';
  organic.whatsappInboundMessage.from = '14155550197';
  delete organic.whatsappInboundMessage.referral;
  const organicRaw = JSON.stringify(organic);
  assert.equal((await deliver(organicRaw)).status, 200);
  assert.equal((await (await deliver(organicRaw)).json()).result, 'duplicate');
  for (let n = 0; n < 100; n++) {
    const row = await db.yCloudInboundEvent.findUniqueOrThrow({ where: { id: organic.id } });
    if (row.status === 'PROCESSED') break;
    await wait(200);
  }
  const organicEvent = await db.yCloudInboundEvent.findUniqueOrThrow({ where: { id: organic.id } });
  assert.equal(organicEvent.status, 'PROCESSED');
  assert.equal(organicEvent.isTestMessage, true);
  assert.deepEqual(organicEvent.attribution, {});
  const activity = await db.leadActivity.findFirstOrThrow({ where: { leadId: organicEvent.leadId, kind: 'ycloud-inbound' } });
  assert.equal(activity.detail.isTestMessage, true);
  assert.equal(await db.lead.count(), 2);
  assert.equal(event.isTestMessage, false);
  console.log('PASS: local webhook proxy → built Next.js → built NestJS (NODE_ENV=production) → migrated PostgreSQL; ad + allowlisted non-ad, signature, durable worker, duplicates, provenance and authenticated ADMIN BFF');
  if (process.argv.includes('--hold')) {
    console.log('Synthetic preview: http://127.0.0.1:3340/leads (press Enter in this test terminal to close)');
    process.stdin.resume();
    await new Promise((resolve) => {
      process.stdin.once('data', resolve);
      process.stdin.once('end', resolve);
    });
    process.stdin.pause();
  }
} finally {
  if (proxy) await new Promise((resolve) => { proxy.close(resolve); proxy.closeAllConnections(); });
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, wait(3000)]);
    }
  }
  await db.$disconnect();
}
