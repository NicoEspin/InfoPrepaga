// Full browser journey against verify-crm.mjs synthetic servers only.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');
const ExcelJS = createRequire(path.resolve(__dirname,'../backend/package.json'))('exceljs');
(async()=>{
  const url=process.env.CRM_UI_TEST_URL ?? 'http://localhost:3320';
  assert.equal(new URL(url).hostname,'localhost'); assert.equal(new URL(url).port,'3320');
  const browser=await chromium.launch({headless:true,channel:process.env.CRM_UI_BROWSER==='bundled'?undefined:process.env.CRM_UI_BROWSER??'chrome'});
  try {
    const context=await browser.newContext();
    const auth=await context.request.post(`${url}/api/auth/login`,{headers:{Origin:url},data:{email:'browser-admin@example.com',password:'Synthetic-browser-password-2026'}});
    assert.equal(auth.status(),200);
    const page=await context.newPage();
    const book=(rows)=>{const b=new ExcelJS.Workbook();const s=b.addWorksheet('Fede');s.addRow(['FECHA','NOMBRE','TEL','HORARIO','MAIL','SEGMENTO','ASESOR','OBSERVACION']);rows.forEach((row)=>s.addRow(row));return b;};
    const initial=book([
      ['5/8','Contacto UI',null,null,'ui-import@example.test',null,null,'Historia A'],
      ['5/8','CONTACTO UI',null,null,'UI-IMPORT@example.test',null,null,'Historia B'],
      ['5/8','Corregir UI',null,null,'not-an-email'],
    ]);
    async function upload(workbook,name='synthetic-ui.xlsx') {
      await page.goto(`${url}/leads`);
      await page.getByRole('button',{name:'Importar Excel',exact:true}).click();
      const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Importar leads desde Excel'})});
      await dialog.locator('input[type=file]').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await workbook.xlsx.writeBuffer())});
      await dialog.getByRole('button',{name:'Subir y revisar',exact:true}).click();
      await dialog.getByText(name,{exact:true}).waitFor();
      return dialog;
    }
    async function confirm(dialog,summary,exclude=false) {
      if(exclude)await dialog.getByRole('checkbox',{name:/Excluir explícitamente/}).check();
      await dialog.getByRole('button',{name:/^Confirmar carga/}).click();
      const confirmation=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Confirmar modificaciones',exact:true})});
      assert.match(await confirmation.innerText(),summary);
      await confirmation.getByRole('button',{name:'Confirmar y procesar',exact:true}).click();
      await dialog.getByRole('button',{name:'Cerrar',exact:true}).waitFor();
    }
    let dialog=await upload(initial);
    await dialog.getByText('3 filas detectadas',{exact:true}).waitFor();
    assert.equal(await dialog.getByRole('row').count(),2);
    assert.match(await dialog.innerText(),/Requiere corrección/);
    await confirm(dialog,/1 nuevos leads; 0 contactos existentes actualizados; 1 apariciones consolidadas/,true);
    assert.match(await dialog.innerText(),/Nuevos: 1\. Actualizados: 0\. Consolidados: 1\./);
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
    // SKIP: exact reimport preserves both original appearances, no extra events.
    dialog=await upload(initial);
    await dialog.getByText('2 omitidos',{exact:true}).waitFor();
    await confirm(dialog,/0 nuevos leads; 0 contactos existentes actualizados; 0 apariciones consolidadas/,true);
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
    const lookup=await context.request.get(`${url}/api/crm/leads?q=ui-import%40example.test`);
    const lead=(await lookup.json()).items.find((entry)=>entry.email==='ui-import@example.test'); assert(lead);
    const status=await context.request.patch(`${url}/api/crm/leads/${lead.id}/status`,{headers:{Origin:url},data:{version:lead.version,status:'PROSPECT'}}); assert.equal(status.status(),200);
    // UPDATE: inspect the actual current value and the permitted addition.
    dialog=await upload(book([['6/8','Contacto UI','011 15 2345 6789',null,'ui-import@example.test',null,null,'Historia C']]),'synthetic-update.xlsx');
    await dialog.getByText('1 existentes para actualizar',{exact:true}).waitFor();
    await dialog.getByRole('combobox',{name:'Filtrar revisión'}).click();
    await page.getByRole('option',{name:'Listos para actualizar',exact:true}).click();
    await dialog.getByRole('button',{name:'Revisar fila',exact:true}).click();
    const details=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Revisar fila 2',exact:true})});
    await details.getByRole('columnheader',{name:'Valor actual CRM',exact:true}).waitFor();
    assert.match(await details.innerText(),/Completar vacío/);assert.match(await details.innerText(),/Prospecto/);
    await details.getByRole('button',{name:'Cancelar',exact:true}).click();
    await confirm(dialog,/0 nuevos leads; 1 contactos existentes actualizados; 0 apariciones consolidadas/);
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
    const after=await(await context.request.get(`${url}/api/crm/leads/${lead.id}`)).json();
    assert.equal(after.status,'PROSPECT');assert.equal(after.assignedToId,lead.assignedToId);assert.equal(after.phone,'+5491123456789');
    const appearances=await(await context.request.get(`${url}/api/crm/leads/${lead.id}/import-appearances`)).json();assert.equal(appearances.total,3);assert.equal(appearances.legacy,null);
    // Profile renders every durable appearance, including the two different files.
    await page.goto(`${url}/leads`);
    await page.getByRole('button',{name:'Contacto UI',exact:true}).click();
    const profile=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Contacto UI',exact:true})});
    await profile.getByRole('heading',{name:'Procedencias de importación',exact:true}).waitFor();
    await profile.getByText('Historia C',{exact:true}).first().waitFor();
    assert.equal(await profile.locator('article').count(),3);
    await page.keyboard.press('Escape');
    // Safe optional correction is explicit and retains the discarded value.
    dialog=await upload(book([['7/8','Corrección opcional','not-a-phone',null,'optional-ui@example.test',null,null,'Historia opcional']]),'synthetic-optional-correction.xlsx');
    await dialog.getByText('1 errores de contacto',{exact:true}).waitFor();
    await dialog.getByText('Correcciones masivas conservadoras',{exact:true}).click();
    await dialog.getByRole('button',{name:'Descartar teléfono inválido (1)',exact:true}).click();
    await page.getByRole('button',{name:'Aplicar corrección a la revisión',exact:true}).click();
    await dialog.getByText('0 errores de contacto',{exact:true}).waitFor();
    await confirm(dialog,/1 nuevos leads/);
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
    // Seed a confirmed synthetic alias via the same protected upload API.
    const aliasFile=Buffer.from(await book([['5/8','Alias UI',null,null,'alias-ui@example.test',null,'Alias UI']]).xlsx.writeBuffer());
    const aliasUpload=await context.request.post(`${url}/api/crm/lead-imports`,{headers:{Origin:url},multipart:{file:{name:'synthetic-alias.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:aliasFile}}});assert.equal(aliasUpload.status(),201);
    const id=(await aliasUpload.json()).id,preview=await(await context.request.get(`${url}/api/crm/lead-imports/${id}`)).json();
    const mapped=await context.request.patch(`${url}/api/crm/lead-imports/${id}`,{headers:{Origin:url},data:{version:preview.version,reviewToken:preview.reviewToken,mappings:[{advisor:'Alias UI',assignedToId:null}]}});assert.equal(mapped.status(),200);
    await page.goto(`${url}/settings`);await page.getByRole('tab',{name:'Importación Excel',exact:true}).click();
    const settings=page.getByRole('region',{name:'Equivalencias de importación'});
    await settings.getByLabel('Buscar alias o grupo').fill('alias ui');await settings.getByRole('button',{name:'Buscar equivalencias',exact:true}).click();
    await settings.getByRole('cell',{name:'alias ui',exact:true}).waitFor();
    await settings.getByRole('button',{name:'Editar equivalencia',exact:true}).click();
    const editor=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Editar equivalencia',exact:true})});
    await editor.getByLabel('Alias o grupo',{exact:true}).fill('Alias UI confirmado');
    await editor.getByRole('button',{name:'Guardar equivalencia',exact:true}).click();
    await settings.getByRole('cell',{name:'alias ui confirmado',exact:true}).waitFor();
    await settings.getByRole('button',{name:'Eliminar equivalencia',exact:true}).click();
    await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();
    await settings.getByText('No hay equivalencias para este filtro.',{exact:false}).waitFor();
    // Origin equivalences use the other editor branch, without rewriting existing leads.
    const rules=await(await context.request.get(`${url}/api/crm/import-mappings?kind=ORIGIN&q=fede`)).json();const sourceRule=rules.items.find((rule)=>rule.scope==='Fede'&&rule.kind==='ORIGIN');assert(sourceRule);
    const catalogs=await(await context.request.get(`${url}/api/crm/catalogs`)).json();const newSource=catalogs.sources.find((source)=>source.isActive&&source.id!==sourceRule.sourceId);assert(newSource);
    await settings.getByLabel('Buscar alias o grupo').fill('fede');await settings.getByRole('button',{name:'Buscar equivalencias',exact:true}).click();
    await settings.getByRole('cell',{name:'Origen · Fede',exact:true}).waitFor();
    await settings.getByRole('button',{name:'Editar equivalencia',exact:true}).click();
    await page.getByLabel('Origen destino',{exact:true}).selectOption(newSource.id);
    await page.getByRole('button',{name:'Guardar equivalencia',exact:true}).click();
    await settings.getByRole('cell',{name:newSource.name,exact:true}).waitFor();
    assert.equal((await(await context.request.get(`${url}/api/crm/leads/${lead.id}`)).json()).sourceId,lead.sourceId);
    console.log('PASS: browser CREATE/UPDATE/MERGE/SKIP/REVIEW, field comparison, durable provenance, explicit optional correction and mapping administration');
  } finally {await browser.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
