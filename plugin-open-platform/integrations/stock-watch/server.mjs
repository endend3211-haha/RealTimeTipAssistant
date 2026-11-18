// Optional fixed-upstream Naver relay; no brokerage credentials.
import {naverURL} from '../../PhoneSDK/examples/stock-watch/core.mjs';
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('./connection-key.txt',import.meta.url));
if(!existsSync(file))writeFileSync(file,randomBytes(24).toString('hex'),{mode:0o600});
const token=process.env.STOCK_TOKEN||readFileSync(file,'utf8').trim();
const host=process.env.STOCK_HOST||'127.0.0.1',port=Number(process.env.STOCK_PORT||18771);
const cache=new Map(),inflight=new Map();let active=0,cooldown=0;
const allowed=new Set(['1d','1mo','3mo','1y']);
function authorized(value){const a=Buffer.from(value||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);}
async function chart(symbol,range,resource){
 const key=[symbol,range,resource].join(':');const hit=cache.get(key);if(hit&&Date.now()-hit.at<60000)return hit.body;
 if(Date.now()<cooldown)throw Object.assign(Error('Upstream rate limited; wait before retrying'),{status:429});
 if(inflight.has(key))return inflight.get(key);
 if(active>=2)throw Object.assign(Error('Busy; try later'),{status:429});
 active++;const task=(async()=>{try{const url=naverURL(resource,symbol,range);const r=await fetch(url,{headers:{'User-Agent':'MemoStockWatch/1.1 personal-use','Accept':'application/json'},signal:AbortSignal.timeout(12000),redirect:'error'});if(r.status===429)cooldown=Date.now()+120000;if(!r.ok)throw Object.assign(Error('Naver returned HTTP '+r.status),{status:r.status});const body=await r.text();if(body.length>1000000)throw Error('Response too large');if(resource!=='history')JSON.parse(body);if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{body,at:Date.now()});return body;}finally{active--;inflight.delete(key);}})();inflight.set(key,task);return task;
}
export const server=http.createServer(async(req,res)=>{
 // Bearer authentication applies to every data request; CORS alone is not authorization.
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Authorization');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(!authorized(req.headers.authorization)){res.writeHead(401);res.end('{"error":"Unauthorized"}');return;}
 try{const u=new URL(req.url,'http://localhost');if(req.method==='GET'&&u.pathname==='/search'){const q=(u.searchParams.get('q')||'').trim();if(!q||q.length>40||/[\x00-\x1f]/.test(q)){res.writeHead(400);res.end('{"error":"Invalid search"}');return;}res.end(await chart(q,'search','search'));return;}const s=u.searchParams.get('symbol')||'',range=u.searchParams.get('range'),resource=u.searchParams.get('resource');if(req.method!=='GET'||u.pathname!=='/data'||!/^\d{6}$/.test(s)||!allowed.has(range)||!['basic','intraday','history'].includes(resource)||(resource==='history'&&range==='1d')){res.writeHead(400);res.end('{"error":"Invalid chart request"}');return;}res.end(await chart(s,range,resource));}
 catch(e){res.writeHead(Number.isInteger(e.status)&&e.status>=400&&e.status<=599?e.status:502);res.end(JSON.stringify({error:e.message}));}
});
server.headersTimeout=5000;server.requestTimeout=15000;server.listen(port,host,()=>console.log(`Stock relay listening on ${host}:${port}. Connection key: ${file} (keep private).`));
