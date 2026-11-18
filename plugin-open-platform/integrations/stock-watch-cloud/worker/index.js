export const periods=[['1d','minute','당일'],['1mo','day','1개월'],['3mo','day','3개월'],['1y','day','1년']];
export function symbol(value){const s=String(value).trim().toUpperCase().replace(/\.(KS|KQ)$/,'');if(!/^[0-9]{6}$/.test(s))throw Error('국내 종목코드 6자리를 입력하세요. 예: 005930');return s;}
const number=value=>value===null||value===undefined||String(value).trim()===''?null:(Number.isFinite(Number(String(value).replaceAll(',','')))?Number(String(value).replaceAll(',','')):null);
export function parseBasic(j){
 const price=number(j?.closePrice),time=Date.parse(j?.localTradedAt)/1000;
 if(price===null||!Number.isFinite(time)||!j?.stockName)throw Error('네이버 현재가 또는 기준 시각이 없습니다');
 let change=number(j.compareToPreviousClosePrice),percent=number(j.fluctuationsRatio);
 const direction=String(j.compareToPreviousPrice?.code||'');
 if(['4','5'].includes(direction)){if(change!==null)change=-Math.abs(change);if(percent!==null)percent=-Math.abs(percent);}
 if(['1','2'].includes(direction)){if(change!==null)change=Math.abs(change);if(percent!==null)percent=Math.abs(percent);}
 const delay=number(j.delayTime??j.stockExchangeType?.delayTime);
 return {name:j.stockName,symbol:symbol(j.itemCode),currency:'KRW',price,previous:change===null?null:price-change,change,percent,time,timezone:'Asia/Seoul',delay,market:j.marketStatus||'',points:[]};
}
export function localTimestamp(value){const s=String(value);if(!/^\d{8}(\d{6})?$/.test(s))return NaN;const iso=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.length===14?s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14):'00:00:00'}+09:00`;return Date.parse(iso)/1000;}
function ordered(points){return [...new Map(points.filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.p)).map(p=>[p.t,p])).values()].sort((a,b)=>a.t-b.t);}
export function parseIntraday(j){if(!Array.isArray(j?.priceInfos))throw Error('네이버 당일 차트 형식 오류');return ordered(j.priceInfos.map(p=>({t:localTimestamp(p.localDateTime),p:number(p.currentPrice)})).filter(p=>p.p!==null));}
export function parseHistory(text){
 // Naver returns a Python-style array header. Parse data only; never eval source text.
 let rows;try{rows=JSON.parse(text.trim().replaceAll("'",'"').replace(/,\s*\]/g,']'));}catch{throw Error('네이버 일별 차트 형식 오류');}
 if(!Array.isArray(rows))throw Error('네이버 일별 차트 형식 오류');
 return ordered(rows.filter(r=>Array.isArray(r)&&/^\d{8}$/.test(String(r[0]))).map(r=>({t:localTimestamp(r[0]),p:number(r[4])})).filter(p=>p.p!==null));
}
export function naverURL(resource,code,range='1d',now=new Date()){
 if(resource==='search'){const q=String(code).trim();if(!q||q.length>40||/[\x00-\x1f]/.test(q))throw Error('검색어는 1~40자로 입력하세요');return `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`;}
 code=symbol(code);
 if(resource==='basic')return `https://m.stock.naver.com/api/stock/${code}/basic`;
 if(resource==='intraday')return `https://api.stock.naver.com/chart/domestic/item/${code}?periodType=day`;
 if(resource!=='history'||!['1mo','3mo','1y'].includes(range))throw Error('지원하지 않는 조회');
 const end=new Date(now.getTime()+9*3600000),start=new Date(end);start.setUTCMonth(start.getUTCMonth()-({'1mo':1,'3mo':3,'1y':12}[range]));
 const fmt=d=>d.toISOString().slice(0,10).replaceAll('-','');
 return `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${fmt(start)}&endTime=${fmt(end)}&timeframe=day`;
}
export function parseSearch(j){if(!Array.isArray(j?.items))throw Error('네이버 검색 응답 형식 오류');const seen=new Set();return j.items.filter(w=>w&&/^\d{6}$/.test(w.code)&&['KOSPI','KOSDAQ','KONEX'].includes(w.typeCode)&&typeof w.name==='string').filter(w=>{if(seen.has(w.code))return false;seen.add(w.code);return true;}).slice(0,30).map(w=>({name:w.name,symbol:w.code,market:w.typeName||w.typeCode}));}
export function linePoints(points,x,y,w,h){if(!points.length)return [];const values=points.map(p=>p.p),min=Math.min(...values),max=Math.max(...values),span=max-min||Math.max(Math.abs(min)*.01,1);return points.map((p,i)=>[x+(points.length===1?w/2:i/(points.length-1)*w),y+h-(p.p-min)/span*h]);}
export function money(n){return Number.isFinite(n)?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n):'—';}
export function signed(n,suffix=''){return Number.isFinite(n)?`${n>0?'+':''}${money(n)}${suffix}`:'—';}

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
