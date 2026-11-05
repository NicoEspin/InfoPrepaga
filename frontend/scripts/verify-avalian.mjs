import assert from 'node:assert/strict';
import {
  appendSimulatedBatch,
  createSimulatedBatch,
  demoAvalianRecords,
  filterRecords,
  getBatches,
  importDate,
  importTime,
  sortRecords
} from '../src/features/avalian/data/records.ts';

const records = demoAvalianRecords;
const before = JSON.stringify(records);
assert.equal(records.length, 24);
assert.deepEqual(
  ['Válido', 'En revisión', 'Inválido'].map((status) => records.filter((record) => record.status === status).length),
  [18, 4, 2]
);
assert.ok(records.every((record) => record.module === 'avalian' && !('leadId' in record)));
assert.equal(filterRecords(records, { search: '  alvarez ', status: 'Todos', batchId: 'Todos' })[0].internalId, 'AV-DEMO-0010');
assert.equal(filterRecords(records, { search: 'av-demo-0003', status: 'En revisión', batchId: 'LOTE-DEMO-1' }).length, 1);
assert.equal(filterRecords(records, { search: '', status: 'En revisión', batchId: 'LOTE-DEMO-1' }).length, 2);
assert.equal(filterRecords(records, { search: 'sin-coincidencias', status: 'Todos', batchId: 'Todos' }).length, 0);
assert.deepEqual(sortRecords(records, 'internalId', true).slice(0, 2).map((record) => record.internalId), ['AV-DEMO-0024', 'AV-DEMO-0023']);
assert.equal(getBatches(records).length, 3);
assert.equal(getBatches(records)[0].id, 'LOTE-DEMO-3');
console.log('PASS: record isolation, actual counts, combined filters, accent-insensitive search, sort and batches');

const batch = createSimulatedBatch(records, '2026-10-29T18:45:00Z');
assert.equal(JSON.stringify(records), before);
assert.equal(batch.id, 'LOTE-DEMO-4');
assert.equal(batch.records.length, 4);
const imported = appendSimulatedBatch(records, batch);
assert.equal(imported.length, 28);
assert.equal(imported.filter((record) => record.status === 'En revisión').length, 5);
assert.equal(new Set(imported.map((record) => record.id)).size, imported.length);
assert.equal(new Set(imported.map((record) => record.internalId)).size, imported.length);
assert.equal(appendSimulatedBatch(imported, batch), imported);
assert.equal(getBatches(imported)[0].id, batch.id);
assert.equal(createSimulatedBatch(imported, batch.importedAt).id, 'LOTE-DEMO-5');
assert.equal(importDate(batch.importedAt), '29/10/2026');
assert.equal(importTime(batch.importedAt), '15:45');
assert.equal(JSON.stringify(records), before);
console.log('PASS: preview leaves input unchanged, atomic local append, idempotent confirmation, unique IDs and Buenos Aires time');
