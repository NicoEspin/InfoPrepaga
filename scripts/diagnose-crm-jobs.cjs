// Uses the application's actual services and connection without printing records,
// SQL arguments, exception messages or credentials. --run permits normal maintenance.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname,'../backend');
const fromBackend = createRequire(path.join(root,'package.json'));
fromBackend('dotenv').config({path:path.join(root,'.env'),quiet:true});
fromBackend('ts-node').register({project:path.join(root,'tsconfig.json'),transpileOnly:true});
const { PrismaService } = require('../backend/src/prisma/prisma.service.ts');
const { CrmService } = require('../backend/src/crm/crm.service.ts');
const { LeadImportService } = require('../backend/src/crm/lead-import.service.ts');
const { technicalFailure } = require('../backend/src/common/periodic-job-log.ts');
const db = new PrismaService();
(async()=>{
  const crm = new CrmService({},db), imports = new LeadImportService(db,crm);
  const steps = [
    ['migrations',async()=>{
      const applied = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      return {pending:fs.readdirSync(path.join(root,'prisma/migrations'),{withFileTypes:true}).filter((entry)=>entry.isDirectory()&&!applied.some((row)=>row.migration_name===entry.name)).map((entry)=>entry.name)};
    }],
    ['commercial-lock',async()=>({rows:(await db.$queryRaw`SELECT id FROM assignment_state WHERE id=1`).length})],
    ['pending-count',()=>db.lead.count({where:{assignedToId:null}})],
    ['expired-count',()=>db.leadImportBatch.count({where:{expiresAt:{lte:new Date()},status:{in:['REVIEW','IMPORTING','COMPLETE']}}})],
  ];
  if(process.argv.includes('--run')){
    const url=new URL(process.env.DATABASE_URL);
    if(!['development','test'].includes(process.env.NODE_ENV)||!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Maintenance requires verified local development/test');
    steps.push(['pending-assignment',()=>crm.distributePending()],['import-cleanup',async()=>{await imports.purgeExpired();return 'ok';}]);
  }
  for(const [job,action] of steps){
    const started=Date.now();
    try{console.log(JSON.stringify({job,ok:true,result:await action(),elapsedMs:Date.now()-started}));}
    catch(error){console.error(JSON.stringify({job,ok:false,...technicalFailure(error)}));process.exitCode=1;}
  }
})().catch((error)=>{console.error(JSON.stringify(technicalFailure(error)));process.exitCode=1;}).finally(()=>db.$disconnect());
