// Real NestJS + Next.js BFF integration. Only a disposable local starter_test is accepted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const { PrismaClient } = requireBackend('@prisma/client');
const bcrypt = requireBackend('bcrypt');
const url = new URL(process.env.CRM_TEST_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/starter_test', 'Use only localhost/starter_test');
const schema = `crm_bff_${randomBytes(8).toString('hex')}`;
url.searchParams.set('schema', schema);
const databaseUrl = url.href;
const secret = randomBytes(32).toString('hex');
const password = 'Synthetic-browser-password-2026';
const api = 'http://127.0.0.1:3321';
const web = 'http://localhost:3320';
const children = [];
let checks = 0;
function start(file, cwd, env, args = []) {
  const child = spawn(process.execPath, [file, ...args], { cwd: path.join(root, cwd), env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-5000); });
  child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-5000); });
  child.on('error', (error) => { logs = error.message; });
  children.push(child);
  return { child, logs: () => logs };
}
async function ready(target, process) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.child.exitCode !== null) throw new Error(process.logs());
    try { if ((await fetch(target)).ok) return; } catch { /* Starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server unavailable: ${process.logs()}`);
}
async function check(target, status, options = {}) {
  const response = await fetch(target, { ...options, redirect: 'manual' });
  assert.equal(response.status, status, `${new URL(target).pathname}: ${response.status} instead of ${status}`);
  checks++;
  return response;
}
const json = (body, cookie, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json', Origin: web, ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
async function login(email) {
  const response = await check(`${web}/api/auth/login`, 200, json({ email, password }));
  const cookies = response.headers.getSetCookie();
  assert(cookies.every((value) => /HttpOnly/i.test(value) && /SameSite=strict/i.test(value)));
  assert.deepEqual(await response.json(), { ok: true });
  return cookies.map((value) => value.split(';')[0]).join('; ');
}

let db;
try {
  execFileSync(process.execPath, [requireBackend.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(root, 'backend'), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const adminRole = await db.role.create({ data: { name: 'ADMIN' } });
  const sellerRole = await db.role.create({ data: { name: 'VENDEDOR' } });
  await db.permission.create({data:{resource:'users',action:'read',roles:{create:{roleId:adminRole.id}}}});
  const hash = await bcrypt.hash(password, 4);
  const admin = await db.user.create({ data: { email: 'browser-admin@example.com', password: hash, roles: { create: { roleId: adminRole.id } } } });
  const vendor = await db.user.create({ data: { email: 'browser-vendor@example.com', password: hash, roles: { create: { roleId: sellerRole.id } } } });
  const backend = start('dist/main.js', 'backend', { NODE_ENV: 'test', PORT: '3321', DATABASE_URL: databaseUrl, JWT_ACCESS_SECRET: secret, CORS_ORIGIN: web });
  await ready(`${api}/ready`, backend);
  cpSync(path.join(root, 'frontend/.next/static'), path.join(root, 'frontend/.next/standalone/.next/static'), { recursive: true });
  cpSync(path.join(root, 'frontend/public'), path.join(root, 'frontend/.next/standalone/public'), { recursive: true });
  const frontend = start('.next/standalone/server.js', 'frontend', { NODE_ENV: 'production', PORT: '3320', HOSTNAME: '127.0.0.1', BACKEND_URL: api, APP_ORIGIN: web, ENABLE_STARTER_DEMOS: 'true' });
  await ready(`${web}/api/health`, frontend);
  const adminCookies = await login(admin.email);
  const vendorCookies = await login(vendor.email);
  const cookies = (Cookie) => ({ headers: { Cookie } });
  await check(`${web}/leads`, 200, cookies(adminCookies));
  await check(`${web}/leads`, 200, cookies(vendorCookies));
  await check(`${web}/followups`, 200, cookies(vendorCookies));
  await check(`${web}/settings`, 200, cookies(adminCookies));
  await check(`${web}/settings`, 404, cookies(vendorCookies));
  await check(`${web}/pipeline`, 200, cookies(adminCookies));
  await check(`${web}/pipeline`, 200, cookies(vendorCookies));
  await check(`${web}/reports`, 200, cookies(adminCookies));
  await check(`${web}/reports`, 404, cookies(vendorCookies));
  await check(`${web}/avalian`, 404, cookies(adminCookies));
  await check(`${web}/api/demo/lead-profiles/demo-1`, 404, cookies(adminCookies));
  const accountBase=`${web}/api/admin/users`;
  await check(accountBase,403,cookies(vendorCookies));
  await check(accountBase,401);
  await check(accountBase,403,{method:'POST',headers:{Cookie:adminCookies,Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'});
  const managed=await (await check(accountBase,201,json({firstName:'Cuenta BFF',email:'managed-bff@example.test',password,role:'ADMIN'},adminCookies))).json();
  assert.equal(managed.roles[0].role.name,'ADMIN');assert(!('password' in managed));assert(!('accessToken' in managed));
  assert.equal(await db.refreshToken.count({where:{userId:managed.id}}),0);
  const managedLogin=await login(managed.email);
  const accountList=await (await check(`${accountBase}?q=Cuenta&role=ADMIN&state=active&pageSize=1`,200,cookies(adminCookies))).json();
  assert.equal(accountList.total,1);assert.equal(accountList.items[0].id,managed.id);
  await check(`${accountBase}/${managed.id}`,403,json({version:1,role:'ADMIN'},vendorCookies,'PATCH'));
  await check(`${accountBase}/${managed.id}`,200,json({version:1,firstName:'Cuenta editada'},adminCookies,'PATCH'));
  await check(`${accountBase}/${managed.id}`,409,json({version:1,firstName:'Obsoleto'},adminCookies,'PATCH'));
  await check(`${accountBase}/${managed.id}/delete`,201,json({version:2},adminCookies));
  await check(`${web}/api/crm/session`,401,cookies(managedLogin));
  await check(`${accountBase}/${managed.id}/restore`,201,json({version:3},adminCookies));
  await check(`${accountBase}/${managed.id}/delete`,403,json({version:4},vendorCookies));
  await check(accountBase,413,json({padding:'x'.repeat(17000)},adminCookies));
  const catalog = await (await check(`${web}/api/crm/catalogs`, 200, cookies(vendorCookies))).json();
  assert.equal(catalog.statuses.length, 9);
  assert.equal(catalog.sources.length, 6);
  const sourceId = catalog.sources[0].id;
  const lead = await (await check(`${web}/api/crm/leads`, 201, json({ name: 'Lead BFF sintético', phone: 'Teléfono sintético', sourceId }, adminCookies))).json();
  await check(`${web}/api/crm/leads/${lead.id}`, 404, cookies(vendorCookies));
  await check(`${web}/api/crm/leads/${lead.id}/notes`, 404, json({ text: 'Ajeno' }, vendorCookies));
  const forged = json({ name: 'CSRF', phone: 'Sintético', sourceId }, adminCookies);
  forged.headers.Origin = 'https://attacker.invalid';
  await check(`${web}/api/crm/leads`, 403, forged);
  await check(`${web}/api/crm/leads`, 401);
  await check(`${web}/api/crm/users`, 403, cookies(vendorCookies));
  const createdUser = await (await check(`${web}/api/crm/users`, 201, json({ email: 'browser-new@example.com', password, firstName: 'Sintético' }, adminCookies))).json();
  assert(!('accessToken' in createdUser) && !('refreshToken' in createdUser) && !('password' in createdUser));
  await check(`${web}/api/crm/users/${vendor.id}`, 200, json({ receivesLeads: true }, adminCookies, 'PATCH'));
  const assigned = await (await check(`${web}/api/crm/leads/${lead.id}`, 200, cookies(vendorCookies))).json();
  assert.equal(assigned.assignedToId, vendor.id);
  const task = await (await check(`${web}/api/crm/tasks`, 201, json({ leadId: lead.id, title: 'Tarea BFF', dueAt: '2026-11-02T12:00:00Z', duration: 60, priority: 'HIGH' }, vendorCookies))).json();
  const profile = await (await check(`${web}/api/crm/leads/${lead.id}`, 200, cookies(vendorCookies))).json();
  assert.equal(profile.nextActivity.id, task.id);
  await check(`${web}/api/crm/tasks/${task.id}`, 200, json({ version: task.version, completed: true }, vendorCookies, 'PATCH'));
  await check(`${web}/api/crm/tasks/${task.id}`, 409, json({ version: task.version, completed: false }, vendorCookies, 'PATCH'));
  const definition = await (await check(`${api}/docs-json`, 200)).json();
  assert(definition.paths['/crm/leads'].get.responses['200'].content['application/json'].schema.properties.items);
  assert(definition.paths['/crm/lead-imports/{id}'].get.responses['200'].content['application/json'].schema.properties.items);
  assert(definition.paths['/crm/reports/preview'].post.responses['201'].content['application/json'].schema.properties.summary);
  const board = await (await check(`${web}/api/crm/pipeline?page=1&pageSize=50`,200,cookies(vendorCookies))).json();
  assert.equal(board.items.length,1);
  const closed = await (await check(`${web}/api/crm/pipeline/${lead.id}`,200,json({version:board.items[0].version,stage:'CLOSED'},vendorCookies,'PATCH'))).json();
  assert.equal(closed.commercialStage,'CLOSED');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const reportInput={name:'Reporte BFF sintético',from:day,to:day,sourceIds:[sourceId],responsibleIds:[],investments:[{sourceId,amount:'200000.10'}]};
  await check(`${web}/api/crm/reports`,401);
  await check(`${web}/api/crm/reports/catalogs`,403,cookies(vendorCookies));
  await check(`${web}/api/crm/reports/preview`,403,json(reportInput,vendorCookies));
  const malicious=json(reportInput,adminCookies);malicious.headers.Origin='https://attacker.invalid';
  await check(`${web}/api/crm/reports/preview`,403,malicious);
  const preview=await(await check(`${web}/api/crm/reports/preview`,201,json(reportInput,adminCookies))).json();
  assert.equal(preview.summary.entered,1);assert.equal(preview.summary.cohortClosures,1);assert.equal(preview.summary.cpl,'200000.10');
  const operationKey=randomUUID();
  const saved=await(await check(`${web}/api/crm/reports`,201,json({...reportInput,operationKey},adminCookies))).json();
  const retried=await(await check(`${web}/api/crm/reports`,201,json({...reportInput,operationKey},adminCookies))).json();
  assert.equal(saved.id,retried.id);
  await check(`${web}/api/crm/reports`,400,json({...reportInput,operationKey:randomUUID(),summary:{entered:999}},adminCookies));
  for(const suffix of ['',`/${saved.id}`,`/${saved.id}/pdf`])await check(`${web}/api/crm/reports${suffix}`,403,cookies(vendorCookies));
  const pdf=await check(`${web}/api/crm/reports/${saved.id}/pdf`,200,cookies(adminCookies));
  assert(pdf.headers.get('content-type').includes('application/pdf'));
  assert(pdf.headers.get('content-disposition').startsWith('attachment;'));
  assert(pdf.headers.get('cache-control').includes('no-store'));
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  assert.deepEqual((await(await check(`${web}/api/crm/reports/${saved.id}`,200,cookies(adminCookies))).json()).snapshot,saved.snapshot);
  // Exercise the actual Next -> Nest body parsers above the ordinary 16 KiB limit.
  const extraSources = Array.from({ length: 499 }, (_, i) => ({
    id: randomUUID(), code: `report-qa-${i}`, name: `Canal sintético ${i}`,
  }));
  await db.leadSource.createMany({ data: extraSources });
  const allSourceIds = [sourceId, ...extraSources.map((s) => s.id)];
  const fullSelection = { ...reportInput, sourceIds: allSourceIds,
    investments: allSourceIds.map((id) => ({ sourceId: id, amount: '0.00' })) };
  assert(Buffer.byteLength(JSON.stringify(fullSelection)) > 16384);
  const largePreview = await (await check(`${web}/api/crm/reports/preview`, 201, json(fullSelection, adminCookies))).json();
  assert.equal(largePreview.sources.length, 500);
  assert.equal(largePreview.summary.entered, 1);
  assert.equal(largePreview.summary.cpl, '0.00');
  const ExcelJS = requireBackend('exceljs');
  const importBook = new ExcelJS.Workbook();
  const importSheet = importBook.addWorksheet('Fede');
  importSheet.addRow(['FECHA', 'NOMBRE', 'TEL', 'HORARIO', 'MAIL', 'SEGMENTO', 'ASESOR', 'OBSERVACION']);
  importSheet.addRow(['2/8', 'Importado BFF uno', '', 'Tarde', 'import-bff@example.test', 'Grupo', '', 'Nota']);
  importSheet.addRow(['2/8', 'Importado BFF uno', '', '', 'IMPORT-BFF@example.test']);
  const importBytes = await importBook.xlsx.writeBuffer();
  function importFileOptions(cookie, origin = web) {
    const body = new FormData(); body.set('file', new Blob([importBytes]), 'synthetic.xlsx');
    return { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body };
  }
  await check(`${web}/api/crm/lead-imports`, 403, cookies(vendorCookies));
  await check(`${web}/api/crm/lead-imports`, 403, importFileOptions(vendorCookies));
  await check(`${web}/api/crm/lead-imports`, 403, importFileOptions(adminCookies, 'https://attacker.invalid'));
  await check(`${web}/api/crm/lead-imports`, 401, importFileOptions(''));
  const importedBatch = await (await check(`${web}/api/crm/lead-imports`, 201, importFileOptions(adminCookies))).json();
  const importPath = `${web}/api/crm/lead-imports/${importedBatch.id}`;
  await check(importPath, 403, cookies(vendorCookies));
  let importPreview = await (await check(importPath, 200, cookies(adminCookies))).json();
  assert.equal(importPreview.items.length, 2);
  await check(importPath, 200, json({ version: importPreview.version, mappings: [{ sheet: 'Fede', sourceId }] }, adminCookies, 'PATCH'));
  importPreview = await (await check(importPath, 200, cookies(adminCookies))).json();
  assert.equal(importPreview.summary.pending, 2);
  assert.equal(importPreview.summary.creates, 1);
  assert.equal(importPreview.summary.merged, 1);
  assert.equal(importPreview.summary.omitted, 0);
  await check(importPath, 403, json({ version: importPreview.version }, vendorCookies, 'PATCH'));
  await check(`${importPath}/rows/${importPreview.items[0].id}`, 403, json({ version: importPreview.version, decision: 'OMIT' }, vendorCookies, 'PATCH'));
  await check(`${importPath}/review`, 403, json({ version: importPreview.version }, vendorCookies));
  await check(`${importPath}/confirm`, 403, json({ version: importPreview.version }, vendorCookies));
  await check(importPath, 200, json({ version: importPreview.version, reviewToken: importPreview.reviewToken, duplicates: 'INCLUDE' }, adminCookies, 'PATCH'));
  importPreview = await (await check(importPath, 200, cookies(adminCookies))).json();
  const importResult = await (await check(`${importPath}/confirm`, 201, json({ version: importPreview.version }, adminCookies))).json();
  assert.equal(importResult.imported, 2);
  await check(`${importPath}/confirm`, 201, json({ version: importPreview.version }, adminCookies));
  const imported = await db.lead.findMany({ where: { emailKey: 'import-bff@example.test' } });
  assert.equal(imported.length, 1);
  assert.equal(await db.leadImportAppearance.count({where: {batchId: importedBatch.id}}), 2);
  assert(imported.every((entry) => entry.importData.originalDate === '2/8'));
  const mappingPath=`${web}/api/crm/import-mappings`;
  await check(mappingPath,401); await check(mappingPath,403,cookies(vendorCookies));
  const mappings=await (await check(mappingPath,200,cookies(adminCookies))).json();
  const mapping=mappings.items.find((entry)=>entry.kind==='ORIGIN'&&entry.scope==='Fede'); assert(mapping);
  const mappingIdentity={kind:mapping.kind,scope:mapping.scope,key:mapping.key,expectedUpdatedAt:mapping.updatedAt};
  await check(mappingPath,403,json(mappingIdentity,vendorCookies,'DELETE'));
  for(const method of ['PATCH','DELETE']) {const forged=json(mappingIdentity,adminCookies,method);forged.headers.Origin='https://attacker.invalid';await check(mappingPath,403,forged);}
  const provenance=await (await check(`${web}/api/crm/leads/${imported[0].id}/import-appearances`,200,cookies(adminCookies))).json();assert.equal(provenance.total,2);assert.equal(provenance.legacy,null);
  await check(`${web}/api/crm/leads/${imported[0].id}/import-appearances`,401);
  const privateHistory=await db.lead.create({data:{name:'BFF provenance scope synthetic',email:'private-provenance@example.test',sourceId}});
  await check(`${web}/api/crm/leads/${privateHistory.id}/import-appearances`,404,cookies(vendorCookies));
  const oversizedImport = new FormData(); oversizedImport.set('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 8192)]), 'oversized.xlsx');
  await check(`${web}/api/crm/lead-imports`, 413, { method: 'POST', headers: { Cookie: adminCookies, Origin: web }, body: oversizedImport });
  await check(`${web}/api/auth/logout`, 200, json({}, vendorCookies));
  await check(`${web}/api/crm/leads`, 401, cookies(vendorCookies));
  const originalAccess=adminCookies.split('; ').find(part=>part.startsWith('ip_access=')).slice('ip_access='.length);
  const payload=JSON.parse(Buffer.from(originalAccess.split('.')[1],'base64url').toString());
  const {JwtService}=requireBackend('@nestjs/jwt');
  const expiredAccess=new JwtService().sign({...payload,exp:1},{secret});
  const expiredCookies=adminCookies.replace(originalAccess,expiredAccess);
  const restoreRedirect=await check(`${web}/settings`,307,{...cookies(expiredCookies),redirect:'manual'});
  assert(restoreRedirect.headers.get('location').startsWith('/auth/restore?returnTo='));
  const rotated=await check(`${web}/api/auth/refresh`,200,json({},expiredCookies));
  const rotatedCookies=rotated.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  await check(`${web}/api/admin/users`,200,cookies(rotatedCookies));
  await check(`${web}/api/crm/session`,401,cookies(adminCookies));
  if (process.env.CRM_RUN_IMPORT_UI === 'true') {
    execFileSync(process.execPath, [path.join(root, 'scripts/verify-import-ui.cjs')], {env:process.env,stdio:'inherit',timeout:180000});
  }
  console.log(`PASS: ${checks} BFF, CSRF, production pages, contracts and persistence checks with Node ${process.version}`);
  if (process.env.CRM_BROWSER_PREVIEW === 'true') {
    // Deliberately synthetic credentials. Never use real accounts in this harness.
    console.log(`Browser preview: ${web}; browser-admin@example.com / ${password}`);
    console.log(`Vendor preview: browser-new@example.com / ${password}; Ctrl+C stops both servers.`);
    await new Promise((resolve) => process.once('SIGINT', resolve));
  }
} finally {
  for (const child of children.reverse()) {
    child.kill();
    await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  }
  if (db) await db.$disconnect();
}
