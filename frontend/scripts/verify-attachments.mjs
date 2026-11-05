import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { NextRequest } from 'next/server.js';

let source = stripTypeScriptTypes(await readFile(new URL('../src/lib/crm-proxy.ts', import.meta.url), 'utf8'), { mode: 'transform' });
source = source.replace("'next/server'", JSON.stringify(import.meta.resolve('next/server.js')));
source = source.replace("import { backendFetch } from '@/lib/backend';", 'const backendFetch = (...args) => globalThis.attachmentUpstream(...args);');
const { handle: GET, handle: POST, handle: PATCH, handle: DELETE } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const originalOrigin = process.env.APP_ORIGIN;
process.env.APP_ORIGIN = 'http://localhost:3000';
const leadId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const root = `leads/${leadId}/attachments`;
const context = (path) => ({ params: Promise.resolve({ path: path.split('/') }) });
const calls = [];
globalThis.attachmentUpstream = async (path, init) => {
  calls.push({ path, init });
  return Response.json({ synthetic: true });
};
function req(path, method, body, headers = {}) {
  return new NextRequest(`http://localhost:3000/api/crm/${path}`, {
    method, body,
    headers: { cookie: 'ip_access=synthetic-token', origin: 'http://localhost:3000', ...headers }
  });
}
try {
  const body = new FormData();
  body.set('file', new File(['%PDF-1.7\nsynthetic'], 'sintetico.pdf', { type: 'application/pdf' }));
  const response = await POST(req(root, 'POST', body), context(root));
  assert.equal(response.status, 200);
  assert.equal(calls[0].path, `/crm/${root}`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic-token');
  const forwarded = new Request('http://synthetic.invalid', { method: 'POST', headers: { 'content-type': calls[0].init.headers['Content-Type'] }, body: calls[0].init.body });
  const file = (await forwarded.formData()).get('file');
  assert.equal(file.name, 'sintetico.pdf');
  assert.equal(await file.text(), '%PDF-1.7\nsynthetic');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const item = `${root}/${itemId}`;
  assert.equal((await DELETE(req(item, 'DELETE'), context(item))).status, 200);
  assert.equal(calls.at(-1).init.body, undefined);
  assert.equal((await PATCH(req(item, 'PATCH', JSON.stringify({ name: 'Nuevo.pdf', version: 1 }), { 'content-type': 'application/json' }), context(item))).status, 200);
  assert.equal((await GET(req(`${item}/download`, 'GET'), context(`${item}/download`))).status, 200);
  const count = calls.length;
  assert.equal((await POST(req(root, 'POST', body, { origin: 'https://untrusted.invalid' }), context(root))).status, 403);
  assert.equal((await POST(req(root, 'POST', body, { cookie: '' }), context(root))).status, 401);
  assert.equal((await POST(req(root, 'POST', '{}', { 'content-type': 'application/json' }), context(root))).status, 415);
  assert.equal((await DELETE(req(root, 'DELETE'), context(root))).status, 404);
  assert.equal((await POST(req(root, 'POST', new Uint8Array(10 * 1024 * 1024 + 8193), { 'content-type': 'multipart/form-data; boundary=synthetic' }), context(root))).status, 413);
  assert.equal(calls.length, count, 'Rejected requests must not reach NestJS');
  console.log('PASS: multipart byte preservation, authenticated CRUD proxy, private responses, origin/session checks, route allowlist and upload size limit');
} finally {
  delete globalThis.attachmentUpstream;
  if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalOrigin;
}
