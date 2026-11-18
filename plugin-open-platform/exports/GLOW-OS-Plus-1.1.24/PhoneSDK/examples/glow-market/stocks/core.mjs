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
