import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { NextRequest } from 'next/server.js';

let source = stripTypeScriptTypes(await readFile(new URL('../src/lib/crm-proxy.ts', import.meta.url), 'utf8'), { mode: 'transform' });
source = source.replace("'next/server'", JSON.stringify(import.meta.resolve('next/server.js')));
source = source.replace("import { backendFetch } from '@/lib/backend';", 'const backendFetch = (...args) => globalThis.reportUpstream(...args);');
const { handle } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const previousOrigin = process.env.APP_ORIGIN;
process.env.APP_ORIGIN = 'http://localhost:3000';
const calls = [];
globalThis.reportUpstream = async (path, init) => {
  calls.push({ path, init });
  return Response.json({ synthetic: true }, { status: 201 });
};
async function post(path, body, headers = {}) {
  return handle(new NextRequest(`http://localhost:3000/api/crm/${path}`, {
    method: 'POST', body,
    headers: { cookie: 'ip_access=synthetic-token', origin: process.env.APP_ORIGIN, 'content-type': 'application/json', ...headers }
  }), { params: Promise.resolve({ path: path.split('/') }) });
}
try {
  const sourceIds = Array.from({ length: 500 }, () => randomUUID());
  const input = {
    name: 'Á'.repeat(160), from: '2026-01-01', to: '2026-01-31', sourceIds,
    responsibleIds: Array.from({ length: 500 }, () => randomUUID()),
    investments: sourceIds.map((sourceId) => ({ sourceId, amount: '999999999999.99' })),
    operationKey: randomUUID()
  };
  const body = JSON.stringify(input);
  assert(Buffer.byteLength(body) > 16384);
  for (const path of ['reports', 'reports/preview']) {
    const { operationKey, ...preview } = input;
    const payload = path === 'reports' ? { ...preview, operationKey } : preview;
    assert.equal((await post(path, JSON.stringify(payload))).status, 201, 'A full report selection must reach NestJS');
    assert.equal(calls.at(-1).path, `/crm/${path}`);
    assert.deepEqual(JSON.parse(calls.at(-1).init.body), payload);
    assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer synthetic-token');
  }
  const count = calls.length;
  assert.equal((await post('reports', JSON.stringify({ padding: 'x'.repeat(128 * 1024) }))).status, 413);
  assert.equal((await post('leads', body)).status, 413, 'Other JSON routes retain their 16 KiB limit');
  assert.equal((await post('reports', body, { origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await post('reports', body, { cookie: '' })).status, 401);
  assert.equal(calls.length, count, 'Rejected requests must not reach NestJS');
  console.log('PASS: full report selections, preserved JSON, bounded report size, unchanged CRM limits and origin/session checks');
} finally {
  delete globalThis.reportUpstream;
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
}
