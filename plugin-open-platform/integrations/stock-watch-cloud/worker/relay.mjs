// Build embeds this handler with the fixed Naver URL/validation functions.
const entries=new Map(),pending=new Map(),visitors=new Map();
let active=0,cooldown=0;
const periodsAllowed=new Set(['1d','1mo','3mo','1y']);
function reply(body,status=200,extra={}){return new Response(body,{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
function failure(message,status){return reply(JSON.stringify({error:message}),status,status===429?{'Retry-After':'120'}:{});}
function rateLimit(ip){const now=Date.now(),record=visitors.get(ip);if(!record||now-record.start>=60000){if(visitors.size>=1000)visitors.delete(visitors.keys().next().value);visitors.set(ip,{start:now,count:1});return false;}return ++record.count>60;}
async function upstream(resource,code,range){
 const key=JSON.stringify([resource,code,range]),cached=entries.get(key);
 if(cached&&Date.now()-cached.at<(resource==='basic'?10000:60000))return cached.body;
 if(Date.now()<cooldown)throw Object.assign(Error('네이버 요청 제한: 잠시 후 다시 시도하세요'),{status:429});
 if(pending.has(key))return pending.get(key);
 if(active>=2)throw Object.assign(Error('조회가 많습니다. 잠시 후 다시 시도하세요'),{status:429});
 active++;
 const task=(async()=>{try{
  const response=await fetch(naverURL(resource,code,range),{headers:{Accept:'application/json','User-Agent':'MemoStockWatch/1.2 personal-use'},signal:AbortSignal.timeout(12000),redirect:'manual'});
  if(response.status===429)cooldown=Date.now()+120000;
  if(!response.ok)throw Object.assign(Error('네이버 조회 실패 HTTP '+response.status),{status:response.status===429?429:502});
  if(Number(response.headers.get('content-length'))>1000000)throw Error('데이터 크기 초과');
  const body=await response.text();if(new TextEncoder().encode(body).length>1000000)throw Error('데이터 크기 초과');
  if(resource==='search')parseSearch(JSON.parse(body));else if(resource==='basic')parseBasic(JSON.parse(body));else if(resource==='intraday')parseIntraday(JSON.parse(body));else parseHistory(body);
  if(entries.size>=100)entries.delete(entries.keys().next().value);entries.set(key,{at:Date.now(),body});return body;
 }finally{active--;pending.delete(key);}})();pending.set(key,task);return task;
}
export default {
 async fetch(request){
  if(request.method==='OPTIONS')return reply(null,204);
  if(request.method!=='GET')return failure('GET 요청만 지원합니다',405);
  const url=new URL(request.url);
  if(url.pathname==='/'||url.pathname==='/health')return reply(JSON.stringify({service:'Memo Naver Stock Relay',version:'1.3.0',status:'ok',readOnly:true}));
  if(!['/search','/data'].includes(url.pathname))return failure('없는 경로입니다',404);
  if(url.search.length>512)return failure('요청이 너무 깁니다',400);
  if(rateLimit(request.headers.get('CF-Connecting-IP')||'local'))return failure('검색 요청이 많습니다. 잠시 후 다시 시도하세요',429);
  try{
   let resource,code,range;
   if(url.pathname==='/search'){resource='search';range='search';code=(url.searchParams.get('q')||'').trim();if(!code||code.length>40||/[\x00-\x1f]/.test(code))return failure('검색어는 1~40자로 입력하세요',400);}
   else {code=url.searchParams.get('symbol')||'';resource=url.searchParams.get('resource');range=url.searchParams.get('range');if(!/^\d{6}$/.test(code)||!periodsAllowed.has(range)||!['basic','intraday','history'].includes(resource)||(resource==='history'&&range==='1d'))return failure('시세 요청 형식 오류',400);}
   return reply(await upstream(resource,code,range),200,{'Content-Type':resource==='history'?'text/plain; charset=utf-8':'application/json; charset=utf-8'});
  }catch(e){return failure(e.name==='TimeoutError'?'네이버 응답 시간 초과':e.message||'중계 오류',e.status||502);}
 }
};
