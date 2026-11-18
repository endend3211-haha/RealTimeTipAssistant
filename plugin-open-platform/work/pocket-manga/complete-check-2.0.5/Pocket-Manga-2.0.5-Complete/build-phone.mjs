import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('.',import.meta.url));
for(const args of [['integrations/webtoon-reader/sync-pocket.mjs'],['PhoneSDK/tools/build-mmpkg.mjs','PhoneSDK/examples/pocket-manga','dist/Pocket-Manga-2.0.5.mmpkg']]){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
