// Read-only diagnosis. Never uploads the workbook or prints contact values.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const backend = path.resolve(__dirname, '../backend');
const fromBackend = createRequire(path.join(backend, 'package.json'));
fromBackend('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
const { parseLeadImport, importContactErrors } = require('../backend/src/crm/lead-import.parser.ts');
const { planLeadImport, appearanceFingerprint } = require('../backend/src/crm/lead-import.plan.ts');
const { resolveImportMappings } = require('../backend/src/crm/lead-import.mappings.ts');
const { importExceptionSummary, cleanOptionalContact } = require('../backend/src/crm/lead-import.exceptions.ts');
const { importKey } = require('../backend/src/crm/import-normalization.ts');
const { contactKeys } = require('../backend/src/crm/contact-keys.ts');
const { technicalFailure } = require('../backend/src/common/periodic-job-log.ts');
let db;
(async () => {
  const filename = process.argv[2];
  if (!filename || filename.startsWith('--')) throw new Error('Usage: node scripts/simulate-lead-import.cjs file.xlsx [--database]');
  const parsed = await parseLeadImport(fs.readFileSync(filename));
  let rules = [], sources = [], users = [], leads = [], appearances = [];
  if (process.argv.includes('--database')) {
    fromBackend('dotenv').config({ path: path.join(backend, '.env'), quiet: true });
    const { PrismaClient } = fromBackend('@prisma/client');
    db = new PrismaClient();
    sources = await db.leadSource.findMany({ where: { isActive: true }, select: {id: true, name: true} });
    users = await db.user.findMany({ where: { isActive: true, deletedAt: null, roles: {some: {role: {name: {in: ['ADMIN','VENDEDOR']}}}} }, select: {id: true, firstName: true, lastName: true} });
    const keys = parsed.rows.map((row) => contactKeys(row.email, row.phone));
    leads = await db.lead.findMany({ where: { OR: [{emailKey: {in: keys.flatMap((key) => key.emailKey ? [key.emailKey] : [])}}, {phoneKey: {in: keys.flatMap((key) => key.phoneKey ? [key.phoneKey] : [])}}, {contactKeysVersion: 0}] }, select: {id: true, name: true, phone: true, email: true, version: true, assignedToId: true} });
    leads = leads.map((lead) => ({...lead, ...contactKeys(lead.email, lead.phone)}));
    try {
      rules = await db.leadImportMapping.findMany();
      appearances = await db.leadImportAppearance.findMany({ select: {fingerprint: true} });
    } catch (error) {
      if (error.code !== 'P2021') throw error;
      console.log(JSON.stringify({warning: 'Intelligent import migration not applied; no saved rules available'}));
    }
  }
  const rows = resolveImportMappings(parsed.rows, rules, sources, users).map((row, i) => ({...row, id: String(i), batchId: 'simulation', leadId: null, outcome: null, decision: 'AUTO', reviewedMatches: []}));
  const sourceIds = new Set(sources.map((source) => source.id)), sellerIds = new Set(users.map((user) => user.id));
  const seen = new Set(appearances.map((entry) => entry.fingerprint));
  const plan = planLeadImport(rows, parsed.sheets, leads, sourceIds, sellerIds, seen);
  const configured = rows.map((row) => ({...row, sourceId: row.sourceId ?? '__confirmed', assignedToId: sellerIds.has(row.assignedToId) ? row.assignedToId : null, assignmentResolved: true}));
  const afterConfiguration = planLeadImport(configured, parsed.sheets, leads, new Set([...sourceIds, '__confirmed']), sellerIds, seen);
  const cleaned=afterConfiguration.rows.map((row)=>['INVALID_EMAIL','INVALID_PHONE','FORMULA_PHONE'].reduce((value,kind)=>cleanOptionalContact(value,kind),row));
  const afterOptionalCleanup=planLeadImport(cleaned,parsed.sheets,leads,new Set([...sourceIds,'__confirmed']),sellerIds,seen);
  const perSheet = parsed.sheets.map((sheet) => {
    const same = plan.rows.filter((row) => row.sheet === sheet);
    return {sheet, candidates: same.length, contactErrors: same.filter((row) => importContactErrors(row).length).length, ambiguousNames: same.filter((row) => !row.nameResolved).length, identityConflicts: same.filter((row) => row.conflicts.length).length, ready: same.filter((row) => row.selected).length};
  });
  const discarded = Object.fromEntries([...new Set(parsed.discarded.map((row) => row.reason))].map((reason) => [reason, parsed.discarded.filter((row) => row.reason === reason).length]));
  console.log(JSON.stringify({readOnly: true, catalogMode: db ? 'current-database' : 'no-catalogs', perSheet, discarded, warnings: parsed.warnings, summary: plan.summary, pendingSourceGroups: new Set(rows.filter((row) => !row.sourceId).map((row) => `${row.sheet}:${row.group}`)).size, pendingAdvisorAliases: new Set(rows.filter((row) => !row.assignmentResolved).map((row) => importKey(row.advisor))).size, afterExplicitConfiguration: afterConfiguration.summary, exceptions:importExceptionSummary(afterConfiguration.rows), afterOptionalCleanup:afterOptionalCleanup.summary, differenceFromDocumented1616: parsed.rows.length - 1616, distinctAppearanceFingerprints: new Set(rows.map(appearanceFingerprint)).size}, null, 2));
})().catch((error) => { console.error(JSON.stringify(technicalFailure(error))); process.exitCode = 1; }).finally(() => db?.$disconnect());
