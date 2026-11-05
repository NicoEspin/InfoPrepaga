import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let source=stripTypeScriptTypes(await readFile(new URL('../src/lib/session-client.ts',import.meta.url),'utf8'),{mode:'transform'});
source=source.replace("'./query-client'",JSON.stringify(new URL('../src/lib/query-client.ts',import.meta.url).href));
export const sessionModule=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
