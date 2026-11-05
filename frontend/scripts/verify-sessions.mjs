import assert from 'node:assert/strict';
import { sessionModule } from './session-module.mjs';
const {restoreSession,sessionFetch,safeReturnPath,withSessionLock}=await import(sessionModule);
const originalFetch=globalThis.fetch;
const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
let queue=Promise.resolve();
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(_key,fn)=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;}}}});
let navigated='';globalThis.window={location:{assign:path=>{navigated=path;}}};
try {
  let valid=false;let refreshes=0;let writes=0;let reads=0;
  globalThis.fetch=async(path,init={})=>{
    if(path==='/api/crm/session') return Response.json({}, {status:valid?200:401});
    if(path==='/api/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,5));valid=true;return Response.json({ok:true});}
    if(init.method==='POST'){writes++;return Response.json({}, {status:valid?201:401});}
    reads++;return Response.json({}, {status:valid?200:401});
  };
  await Promise.all([restoreSession(),restoreSession(),restoreSession()]);assert.equal(refreshes,1);
  valid=false;const response=await sessionFetch('/api/crm/leads');assert.equal(response.status,200);assert.equal(reads,2);
  valid=false;await assert.rejects(sessionFetch('/api/crm/leads',{method:'POST',body:'{}'}),/volvé a confirmar/);assert.equal(writes,1);
  let order=[];await Promise.all([withSessionLock(async()=>{order.push('logout');await new Promise(r=>setTimeout(r,5));order.push('done');}),withSessionLock(async()=>{order.push('next');})]);assert.deepEqual(order,['logout','done','next']);
  globalThis.fetch=async()=>Response.json({}, {status:503});await assert.rejects(restoreSession(),/verificar/);assert.equal(navigated,'');
  globalThis.fetch=async path=>Response.json({}, {status:path==='/api/auth/refresh'?503:401});await assert.rejects(restoreSession(),/renovar/);assert.equal(navigated,'');
  globalThis.fetch=async()=>Response.json({}, {status:401});await sessionFetch('/api/crm/leads');assert.equal(navigated,'/auth/sign-in');
  for(const value of ['//evil.example','https://evil.example','/\\evil','/auth/restore','/api/auth/logout','/\nfoo',null]) assert.equal(safeReturnPath(value),'/leads');
  assert.equal(safeReturnPath('/settings?tab=users'),'/settings?tab=users');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});await assert.rejects(restoreSession(),/Restaurá/);assert.equal(await restoreSession(true),false);
  console.log('Session checks passed: cross-tab single rotation, read retry, no mutation replay, logout ordering, temporary errors, invalid session, return path and manual fallback.');
} finally {
  globalThis.fetch=originalFetch;
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else delete globalThis.window;
}
