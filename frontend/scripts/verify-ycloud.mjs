import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { NextRequest } from 'next/server.js';

let source = stripTypeScriptTypes(await readFile(new URL('../src/app/webhooks/ycloud/route.ts', import.meta.url), 'utf8'), { mode: 'transform' });
source = source.replace("import { backendFetch } from '@/lib/backend';", 'const backendFetch = (...args) => globalThis.ycloudUpstream(...args);');
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let proxy = stripTypeScriptTypes(await readFile(new URL('../src/lib/crm-proxy.ts', import.meta.url), 'utf8'), { mode: 'transform' });
proxy = proxy.replace("'next/server'", JSON.stringify(import.meta.resolve('next/server.js')));
proxy = proxy.replace("import { backendFetch } from '@/lib/backend';", 'const backendFetch = (...args) => globalThis.ycloudUpstream(...args);');
const { handle } = await import(`data:text/javascript;base64,${Buffer.from(proxy).toString('base64')}`);
const calls = [];
globalThis.ycloudUpstream = async (path, init) => {
  calls.push({ path, init });
  return Response.json({ result: 'accepted' });
};
function req(raw, headers = {}) {
  return new Request('http://localhost:3000/webhooks/ycloud', {
    method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'ycloud-signature': 't=1,s=synthetic', ...headers }
  });
}
try {
  const raw = '{  "text": "¡Hola á! 👋" }\n';
  assert.equal((await POST(req(raw))).status, 200);
  assert.equal(calls[0].path, '/webhooks/ycloud');
  assert.deepEqual(calls[0].init.body, Buffer.from(raw));
  assert.deepEqual(calls[0].init.headers, { 'content-type': 'application/json', 'ycloud-signature': 't=1,s=synthetic' });
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal((await POST(req('{}', { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await POST(req('{}', { 'content-encoding': 'gzip' }))).status, 415);
  assert.equal((await POST(req('{}', { 'ycloud-signature': '' }))).status, 401);
  assert.equal((await POST(req('x'.repeat(128 * 1024 + 1)))).status, 413);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(100 * 1024));
    controller.enqueue(new Uint8Array(30 * 1024)); controller.close();
  } });
  assert.equal((await POST(new Request('http://localhost:3000/webhooks/ycloud', {
    method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'application/json', 'ycloud-signature': 'synthetic' }
  }))).status, 413);
  assert.equal(calls.length, 1);
  for (const status of [400, 401, 403, 429, 503]) {
    globalThis.ycloudUpstream = async () => Response.json({ synthetic: true }, { status });
    assert.equal((await POST(req(raw))).status, status);
  }
  globalThis.ycloudUpstream = () => { throw new Error('synthetic outage'); };
  assert.equal((await POST(req(raw))).status, 503);
  const path = 'integrations/ycloud/events/evt_synthetic/retry';
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  for (const [cookie, suppliedOrigin, status] of [['', origin, 401], ['ip_access=synthetic', 'https://untrusted.invalid', 403]]) {
    const response = await handle(new NextRequest(`http://localhost:3000/api/crm/${path}`, {
      method: 'POST', body: '{}', headers: { cookie, origin: suppliedOrigin, 'content-type': 'application/json' }
    }), { params: Promise.resolve({ path: path.split('/') }) });
    assert.equal(response.status, status);
  }
  console.log('PASS: exact bytes, Unicode, signature header, fixed target, size/chunked/type limits, errors, session/origin checks');
} finally { delete globalThis.ycloudUpstream; }
