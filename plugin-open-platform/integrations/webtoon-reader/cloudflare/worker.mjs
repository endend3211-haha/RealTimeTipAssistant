const API='https://api.mangadex.org';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
const encoder=new TextEncoder();
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'}});}
function validPath(path){return typeof path==='string'&&path.length<4096&&/^\/(?:manga(?:\/[a-f0-9-]{36}\/feed)?|at-home\/server\/[a-f0-9-]{36})(?:\?[^#\r\n]*)?$/i.test(path);}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function ticket(url,secret,expires=Math.floor(Date.now()/1000)+600){const mac=await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(`${expires}\n${url}`));return `${expires}.`+Array.from(new Uint8Array(mac),b=>b.toString(16).padStart(2,'0')).join('');}
export async function verify(url,token,secret){if(typeof token!=='string'||!/^\d+\.[a-f0-9]{64}$/.test(token))return false;const [expiry,hex]=token.split('.'),now=Math.floor(Date.now()/1000);if(Number(expiry)<now||Number(expiry)>now+900)return false;const bytes=Uint8Array.from(hex.match(/../g),h=>parseInt(h,16));return crypto.subtle.verify('HMAC',await key(secret),bytes,encoder.encode(`${expiry}\n${url}`));}
export function mediaUrls(data){const urls=[];for(const row of Array.isArray(data.data)?data.data:[]){if(row.type!=='manga'||! /^[a-f0-9-]{36}$/i.test(row.id))continue;for(const r of row.relationships||[]){const f=r.attributes?.fileName;if(r.type==='cover_art'&&typeof f==='string'&&/^[\w.-]+$/.test(f))urls.push(`https://uploads.mangadex.org/covers/${row.id}/${f}.256.jpg`);}}
 if(data.chapter){const base=new URL(data.baseUrl);if(base.protocol!=='https:'||base.username||base.password)throw Error('잘못된 이미지 서버');const hash=data.chapter.hash;if(!/^[a-z0-9]+$/i.test(hash))throw Error('잘못된 회차 해시');for(const kind of ['dataSaver','data'])for(const f of data.chapter[kind]||[])if(typeof f==='string'&&/^[\w.-]+$/.test(f))urls.push(`${data.baseUrl.replace(/\/$/,'')}/${kind==='dataSaver'?'data-saver':'data'}/${hash}/${f}`);}
 return urls;
}
async function upstream(url,image=false){const r=await fetch(url,{headers:{'User-Agent':'PocketManga/2.0 (MemoMind companion gateway)',Accept:image?'image/*':'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`MangaDex HTTP ${r.status}${r.status===429?' · 요청 제한 해제 후 다시 시도하세요.':''}`);const type=r.headers.get('content-type')||'';if(!type.startsWith(image?'image/':'application/json'))throw Error('MangaDex 인증 또는 HTML 응답입니다. 요청을 중단했습니다.');const reader=r.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>(image?20:2)*1024*1024)throw Error('응답 크기 제한 초과');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return {bytes,type};}
async function report(url,success,bytes,duration){if(!url.includes('/data-saver/')&&!url.includes('/data/'))return;try{await fetch('https://api.mangadex.network/report',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'PocketManga/2.0'},body:JSON.stringify({url,success,cached:false,bytes,duration}),signal:AbortSignal.timeout(1500)});}catch{}}
export default {async fetch(request,env,ctx){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(request.method!=='GET')return json({error:'GET 요청만 허용합니다.'},405);
 const u=new URL(request.url);
 if(u.pathname==='/'||u.pathname==='/health')return json({ok:true,service:'Pocket Manga HTTPS gateway',configured:typeof env.MEDIA_SECRET==='string'&&env.MEDIA_SECRET.length>=32});
 if(typeof env.MEDIA_SECRET!=='string'||env.MEDIA_SECRET.length<32)return json({error:'서버 MEDIA_SECRET 설정이 필요합니다.'},503);
 try{
  if(u.pathname==='/api'){const path=u.searchParams.get('path');if(!validPath(path))return json({error:'허용되지 않은 API 경로입니다.'},400);const query=new URL(path,API);if(query.searchParams.has('limit')){const n=Number(query.searchParams.get('limit'));if(!Number.isInteger(n)||n<1||n>100)return json({error:'목록 개수는 1~100입니다.'},400);}
   const result=await upstream(API+path),data=JSON.parse(new TextDecoder().decode(result.bytes));const tokens={};await Promise.all(mediaUrls(data).map(async url=>{tokens[url]=await ticket(url,env.MEDIA_SECRET);}));data.pocketMediaTokens=tokens;return json(data);
  }
  if(u.pathname==='/image'){const url=u.searchParams.get('url');if(!url||!await verify(url,u.searchParams.get('token'),env.MEDIA_SECRET))return json({error:'이미지 주소가 만료됐습니다. 작품을 다시 선택해 주세요.'},403);const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return json({error:'허용되지 않은 이미지 주소입니다.'},400);const start=Date.now();try{const result=await upstream(url,true);ctx.waitUntil(report(url,true,result.bytes.length,Date.now()-start));return new Response(result.bytes,{headers:{...CORS,'Content-Type':result.type}});}catch(e){ctx.waitUntil(report(url,false,0,Date.now()-start));throw e;}}
  return json({error:'알 수 없는 경로입니다.'},404);
 }catch(e){return json({error:e.message||'중계 요청에 실패했습니다.'},502);}
}};
