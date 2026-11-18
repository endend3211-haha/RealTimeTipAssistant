import {money,signed} from './core.mjs';
export const QUOTE_REFRESH_MS=15000;
export function visibleQuotes(watch,selected,mode,pageSize=5){return mode==='detail'?watch.slice(selected,selected+1):watch.slice(Math.floor(selected/pageSize)*pageSize,Math.floor(selected/pageSize)*pageSize+pageSize);}
export function quoteLabels(entry,now=Date.now()){
 const q=entry?.quote;
 if(!q)return {price:'—',change:entry?.error?'조회 실패':'시세 조회 중',stale:false};
 const stale=!!entry.error||now-entry.fetchedAt>45000;
 const arrow=q.change===null?'—':q.change>0?'▲':q.change<0?'▼':'=';
 return {price:money(q.price)+'원',change:`${arrow} ${signed(q.change)} (${signed(q.percent,'%')})${stale?' · 이전값':''}`,stale};
}
export function createQuoteFeed({fetchQuote,onUpdate,now=Date.now}){
 const entries=new Map();let items=[],key='',generation=0,control=null,running=false;
 async function refresh(){
  if(running||!items.length)return;
  const epoch=generation,selected=[...items],local=new AbortController();control=local;running=true;
  try{for(const item of selected){
   if(local.signal.aborted||epoch!==generation)break;
   try{const quote=await fetchQuote(item.symbol,local.signal);if(local.signal.aborted||epoch!==generation)break;entries.set(item.symbol,{quote,fetchedAt:now(),error:null});}
   catch(e){if(local.signal.aborted||epoch!==generation)break;entries.set(item.symbol,{...entries.get(item.symbol),error:e.message});}
   onUpdate(item.symbol,entries.get(item.symbol));
  }}finally{if(epoch===generation){running=false;control=null;}}
 }
 return {entries,refresh,set(next){const nextKey=next.map(w=>w.symbol).join(',');if(nextKey===key)return;generation++;control?.abort();running=false;key=nextKey;items=[...next];void refresh();},stop(){generation++;control?.abort();control=null;running=false;key='';items=[];},clear(){this.stop();entries.clear();}};
}
