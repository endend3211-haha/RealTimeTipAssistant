// Run after the owner logs in with Wrangler. Never prints the signing secret.
import {randomBytes} from 'node:crypto';
import {writeFile,rm} from 'node:fs/promises';
import {runWrangler} from './wrangler.mjs';
const file=new URL('secrets.local.json',import.meta.url);
await writeFile(file,JSON.stringify({MEDIA_SECRET:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600});
try{const status=await runWrangler(['deploy',...(process.argv.includes('--temporary')?['--temporary']:[]),'--secrets-file','secrets.local.json']);if(status!==0)process.exitCode=1;}finally{await rm(file,{force:true});}
