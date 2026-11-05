import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

// Run the installed TypeScript sources without adding a test framework or changing package type.
const typesUrl = new URL('../src/features/lead-profile/api/types.ts', import.meta.url).href;
async function sourceModule(path, replacements) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  source = stripTypeScriptTypes(source);
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const serviceUrl = await sourceModule('../src/features/lead-profile/api/service.ts', { './types': typesUrl });
const { getLeadProfile, parseLeadProfile, LeadProfileError } = await import(serviceUrl);
const queryUrl = await sourceModule('../src/features/lead-profile/api/queries.ts', {
  './service': serviceUrl,
  '@tanstack/react-query': import.meta.resolve('@tanstack/react-query')
});
const { leadProfileOptions } = await import(queryUrl);
const profile = (id) => ({ id, name: id, email: `${id}@example.com`, phone: null, company: null,
  source: 'Web', seller: null, createdAt: '2026-10-12T13:24:00Z', status: 'Nuevo',
  observations: '', activities: [], nextActivity: null, isDemo: true });
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

assert.equal(parseLeadProfile(profile('a'), 'a').id, 'a');
assert.throws(() => parseLeadProfile(profile('a'), 'b'), (error) => error.reason === 'invalid-response');
assert.throws(() => parseLeadProfile({ id: 'a' }, 'a'), LeadProfileError);
const originalFetch = globalThis.fetch;
try {
  for (const [status, reason] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not-found']]) {
    globalThis.fetch = async () => new Response('{}', { status });
    await assert.rejects(getLeadProfile('a', new AbortController().signal), (error) => error.reason === reason);
  }
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'same-origin');
    assert.ok(init.signal instanceof AbortSignal);
    return new Response(JSON.stringify(profile('wrong-id')));
  };
  await assert.rejects(getLeadProfile('a', new AbortController().signal), (error) => error.reason === 'invalid-response');
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: response schema, identity, HTTP errors and uncached authenticated fetch');

const client = new QueryClient();
await assert.rejects(
  client.fetchQuery(leadProfileOptions('b', 'mismatched-loader', async () => profile('a'))),
  (error) => error.reason === 'invalid-response'
);
await tick();
const pending = [];
const loader = (id, signal) => new Promise((resolve) => pending.push({ id, signal, resolve }));
const aOptions = leadProfileOptions('a', 'opening-1', loader);
const a = new QueryObserver(client, aOptions);
const stopA = a.subscribe(() => {});
assert.equal(a.getCurrentResult().data, undefined);
stopA();
assert.equal(pending[0].signal.aborted, true);
await tick();
assert.equal(client.getQueryCache().find({ queryKey: aOptions.queryKey, exact: true }), undefined);

const bOptions = leadProfileOptions('b', 'opening-2', loader);
const b = new QueryObserver(client, bOptions);
const stopB = b.subscribe(() => {});
assert.equal(b.getCurrentResult().data, undefined);
pending[1].resolve(profile('b'));
await tick();
assert.equal(b.getCurrentResult().data.id, 'b');
// Deliberately ignore AbortSignal and deliver A late: B must still be B.
pending[0].resolve(profile('a'));
await tick();
assert.equal(b.getCurrentResult().data.id, 'b');
assert.equal(client.getQueryCache().find({ queryKey: aOptions.queryKey, exact: true }), undefined);
stopB();
await tick();
assert.equal(client.getQueryCache().findAll({ queryKey: ['lead-profile'] }).length, 0);

const reopened = new QueryObserver(client, leadProfileOptions('a', 'opening-3', loader));
const stopReopened = reopened.subscribe(() => {});
assert.equal(reopened.getCurrentResult().data, undefined);
assert.notEqual(pending[2].signal, pending[0].signal);
stopReopened();
assert.equal(pending[2].signal.aborted, true);
await tick();
assert.equal(client.getQueryCache().findAll({ queryKey: ['lead-profile'] }).length, 0);
client.clear();
console.log('PASS: close aborts, zero cached profiles, out-of-order responses and fresh reopening');
