import {existsSync} from 'node:fs';
import {dirname,resolve,delimiter} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function runWrangler(args){
 const bundled=resolve(dirname(process.execPath),'..','node_modules','pnpm','bin','pnpm.cjs');
 const command=existsSync(bundled)?process.execPath:process.platform==='win32'?'npx.cmd':'npx';
 const parameters=existsSync(bundled)?[bundled,'dlx','wrangler@4.158.0',...args]:['--yes','wrangler@4.158.0',...args];
 return new Promise((resolveCode,reject)=>{const child=spawn(command,parameters,{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:'inherit',env:{...process.env,PATH:dirname(process.execPath)+delimiter+(process.env.PATH||'')},shell:process.platform==='win32'&&!existsSync(bundled)});child.on('error',reject);child.on('exit',resolveCode);});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runWrangler(process.argv.slice(2));
