// Destructive mode requires explicit test batch IDs, a verified local development
// environment, an exclusive provenance check, and a backup written before deletion.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createRequire } = require('node:module');
const fromBackend = createRequire(path.resolve(__dirname, '../backend/package.json'));
const allowedActivity = new Set(['registered', 'imported', 'imported_history', 'assigned']);
function assertEnvironment(url, mode) {
  const target = new URL(url);
  if (!['development', 'test'].includes(mode) || !['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('Only verified local development/test environments are allowed');
  return target;
}
async function snapshot(tx, batchIds) {
  if (!batchIds.length || batchIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Explicit verified test batch UUIDs are required');
  const batches = await tx.leadImportBatch.findMany({where: {id: {in: batchIds}}});
  if (batches.length !== batchIds.length) throw new Error('A selected batch is unavailable');
  const rows = await tx.leadImportRow.findMany({where: {batchId: {in: batchIds}}});
  const appearances = await tx.leadImportAppearance.findMany({where: {batchId: {in: batchIds}}});
  const created = await tx.lead.findMany({where: {OR: batchIds.map((id) => ({importData: {path: ['batchId'], equals: id}}))}});
  const ids = created.map((lead) => lead.id);
  if (appearances.some((entry) => !ids.includes(entry.leadId)) || rows.some((row) => row.leadId && !ids.includes(row.leadId))) throw new Error('Selected batches updated pre-existing contacts; automatic deletion is forbidden');
  const [notes, tasks, attachments, movements, outsideAppearances, outsideRows, activities] = await Promise.all([
    tx.leadNote.count({where:{leadId:{in:ids}}}), tx.commercialTask.count({where:{leadId:{in:ids}}}),
    tx.leadAttachment.count({where:{leadId:{in:ids}}}), tx.commercialMovement.count({where:{leadId:{in:ids}}}),
    tx.leadImportAppearance.count({where:{leadId:{in:ids},batchId:{notIn:batchIds}}}),
    tx.leadImportRow.count({where:{leadId:{in:ids},batchId:{notIn:batchIds}}}),
    tx.leadActivity.findMany({where:{leadId:{in:ids}}}),
  ]);
  if (notes || tasks || attachments || movements || outsideAppearances || outsideRows || activities.some((event) => !allowedActivity.has(event.kind) || event.kind === 'assigned' && event.actorId !== null)) throw new Error('Contacts have subsequent activity or dependencies outside the selected tests');
  if (created.some((lead) => lead.status !== 'NEW' || lead.commercialStage !== 'NEW' || !activities.some((event) => event.leadId === lead.id && event.kind === 'imported' && batchIds.includes(event.detail.batchId)))) throw new Error('Commercial state or creation provenance cannot be verified');
  return {batches, rows, appearances, leads:created, activities};
}
async function restore(tx, backup) {
  await tx.leadImportBatch.createMany({data:backup.batches});
  await tx.lead.createMany({data:backup.leads});
  await tx.leadImportRow.createMany({data:backup.rows});
  await tx.leadImportAppearance.createMany({data:backup.appearances});
  await tx.leadActivity.createMany({data:backup.activities});
}
async function remove(tx, backup) {
  const ids = backup.leads.map((lead) => lead.id), batches = backup.batches.map((batch) => batch.id);
  await tx.leadImportAppearance.deleteMany({where:{batchId:{in:batches}}});
  await tx.leadImportRow.deleteMany({where:{batchId:{in:batches}}});
  await tx.leadActivity.deleteMany({where:{leadId:{in:ids}}});
  await tx.lead.deleteMany({where:{id:{in:ids}}});
  await tx.leadImportBatch.deleteMany({where:{id:{in:batches}}});
}
const counts = (data) => Object.fromEntries(Object.entries(data).map(([key,value]) => [key,value.length]));
module.exports = { assertEnvironment, snapshot, remove, restore, counts };
if (require.main === module) {
  fromBackend('dotenv').config({path:path.resolve(__dirname,'../backend/.env'),quiet:true});
  const {PrismaClient} = fromBackend('@prisma/client');
  const db = new PrismaClient();
  (async () => {
    assertEnvironment(process.env.DATABASE_URL, process.env.NODE_ENV);
    const ids = process.argv.filter((_,i,a) => a[i-1] === '--batch');
    const backup = await db.$transaction((tx) => snapshot(tx, ids), {isolationLevel:'RepeatableRead'});
    console.log(JSON.stringify({dryRun: !process.argv.includes('--execute'), counts:counts(backup)}));
    if (!process.argv.includes('--execute')) return;
    const filename = path.join(os.tmpdir(), `infoprepaga-test-import-backup-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(backup), {flag:'wx',mode:0o600});
    // Prove restore under actual constraints, then deliberately roll it back.
    const marker = new Error('RESTORE_REHEARSAL_ROLLBACK');
    try {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM assignment_state WHERE id=1 FOR UPDATE`;
        const current = await snapshot(tx,ids);
        if (JSON.stringify(current) !== JSON.stringify(backup)) throw new Error('Data changed after backup');
        await remove(tx,backup); await restore(tx,backup);
        if (JSON.stringify(counts(await snapshot(tx,ids))) !== JSON.stringify(counts(backup))) throw new Error('Restore verification failed');
        throw marker;
      }, {timeout:30000});
    } catch(error) {if(error !== marker) throw error;}
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM assignment_state WHERE id=1 FOR UPDATE`;
      const current = await snapshot(tx,ids);
      if (JSON.stringify(current) !== JSON.stringify(backup)) throw new Error('Data changed after rehearsal');
      await remove(tx,backup);
    },{timeout:30000});
    console.log(JSON.stringify({deleted:counts(backup),recoveryBackup:filename}));
  })().catch((error) => {console.error(error.code && /^P\d{4}$/.test(error.code) ? `Technical error ${error.code}` : 'Limpieza bloqueada: verificar entorno, lotes explícitos, procedencia y dependencias. No se imprimen registros.');process.exitCode=1;}).finally(()=>db.$disconnect());
}
