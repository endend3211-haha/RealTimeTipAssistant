export function recentContext(entries){return entries.slice(-10).map(e=>String(e.text).slice(0,500)).join('\n').slice(-1600);}
export function appendEntry(entries,text,time=Date.now(),kind='speech'){
 text=String(text).trim().slice(0,500);if(!text)return entries;
 return [...entries,{text,time,kind}].slice(-500);
}
export function packOpus(packets){
 if(packets.length<1||packets.length>500)throw Error('음성 구간 길이 오류');
 const size=4+packets.reduce((n,p)=>n+2+p.length,0),out=new Uint8Array(size),v=new DataView(out.buffer);
 v.setUint32(0,packets.length);let offset=4;
 for(const p of packets){if(p.length<1||p.length>1275)throw Error('Opus 크기 오류');v.setUint16(offset,p.length);offset+=2;out.set(p,offset);offset+=p.length;}
 return out;
}
export function cleanHistory(value){return Array.isArray(value)?value.filter(e=>typeof e?.text==='string'&&Number.isFinite(e.time)).slice(-500).map(e=>({...e,text:e.text.slice(0,500)})):[];}

export const KNOWN_TERMS=['HDR','OIS','EIS','MTF','SNR','ISP','API','SDK','LLM','NPU','GPU','EBITDA','양자화'];
export function termCandidates(text){
 const upper=String(text).toUpperCase(),found=[];
 for(const term of KNOWN_TERMS){const hit=/^[A-Z]+$/.test(term)?new RegExp('(?<![A-Z0-9])'+term+'(?![A-Z0-9])').test(upper):upper.includes(term);if(hit)found.push(term);}
 for(const hit of String(text).matchAll(/(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,9}(?![A-Za-z0-9])/g))if(!found.includes(hit[0]))found.push(hit[0]);
 return found.slice(0,6);
}
export function automaticTerm(candidates,seen,now=Date.now()){return candidates.find(t=>now-(seen.get(t)||0)>=600000)||null;}

// Consecutive 20 ms frames; segmentation is independent of host chunk boundaries.
export function createCaptionSegmenter(emit,limit=100){
 let pending=[],received=0;
 return {
  push(chunk){if(chunk.discontinuity||chunk.droppedFrameCount)throw Error('안경 음성 유실 감지 · 다시 시작하세요');const sizes=Array.from(chunk.frameLengths);if(sizes.some(n=>!Number.isInteger(n)||n<1||n>1275)||sizes.reduce((a,b)=>a+b,0)!==chunk.data.length)throw Error('안경 음성 프레임 경계 오류');let offset=0;for(const n of sizes){pending.push(chunk.data.slice(offset,offset+n));offset+=n;received++;if(pending.length===limit){const block=packOpus(pending);pending=[];emit(block);}}},
  flush(){if(pending.length>0)emit(packOpus(pending));pending=[];},
  clear(){pending=[];},
  get receivedFrames(){return received;}
 };
}

export function shouldRequestHelp({enabled,listening,busy,pending,context,lastContext,lastAt,now}){return Boolean(enabled&&listening&&!busy&&!pending&&context.trim().length>=2&&context!==lastContext&&now-lastAt>=10000);}
function canonical(value){return String(value).normalize('NFKC').toLowerCase().replace(/high[\s-]*dynamic[\s-]*range|하이\s*다이내믹\s*레인지/g,'hdr').replace(/optical[\s-]*image[\s-]*stabili[sz]ation|광학식?\s*손떨림\s*보정/g,'ois').replace(/electronic[\s-]*image[\s-]*stabili[sz]ation|전자식?\s*손떨림\s*보정/g,'eis').replace(/[^a-z0-9가-힣]/g,'');}
function similar(a,b){if(a===b)return true;if(Math.min(a.length,b.length)<16)return false;const grams=s=>new Set(Array.from({length:s.length-2},(_,i)=>s.slice(i,i+3))),x=grams(a),y=grams(b);let hit=0;for(const v of x)if(y.has(v))hit++;return hit/Math.max(x.size,y.size)>=.78;}
export function sessionEntries(entries,session){return session?entries.filter(e=>typeof e.id==='string'&&e.id.startsWith(session+':')):[];}
export function acceptHelp(help,seen,now=Date.now()){
 if(!help||!['term','reply'].includes(help.kind)||typeof help.topic!=='string'||!help.topic.trim()||typeof help.text!=='string'||!help.text.trim())return false;
 const topic=canonical(help.topic),text=canonical(help.text);if(!topic||!text)return false;
 for(const [key,value] of seen){if(key===topic||canonical(value?.topic||key.replace(/^(term|reply):/,''))===topic||typeof value==='object'&&similar(canonical(value.text||''),text))return false;}
 seen.set(topic,{topic:help.topic,text:help.text,at:now});return true;
}

export function mergeLiveTranscript(state,snapshot){
 let entries=state.entries,changed=false;
 for(const item of snapshot.finals||[]){if(typeof item?.id!=='string'||typeof item.text!=='string'||!item.text.trim())continue;const index=entries.findIndex(e=>e.id===item.id);if(index>=0){if(entries[index].text!==item.text){entries=entries.map((e,i)=>i===index?{...e,text:item.text.slice(0,500)}:e);changed=true;}}else{entries=[...entries,{id:item.id,text:item.text.trim().slice(0,500),time:Date.now(),kind:'speech'}].slice(-500);changed=true;}}
 const fresh=(snapshot.revision??0)>=(state.revision??-1);
 return {entries,partial:fresh?String(snapshot.partial||''):state.partial,revision:fresh?snapshot.revision:state.revision,changed};
}

export function helpPopupFrame(start,now){const age=now-start,enter=240,hold=5000,leave=240;if(age<0||age>=enter+hold+leave)return {visible:false,y:330,alpha:0};const progress=age<enter?1-Math.pow(1-age/enter,3):age<enter+hold?1:1-Math.pow((age-enter-hold)/leave,2);return {visible:true,y:330-(330-166)*progress,alpha:Math.max(0,Math.min(1,progress)),animating:age<enter||age>=enter+hold,next:age<enter?80:age<enter+hold?enter+hold-age:80};}

// Count new confirmed IDs, including finals received in the same timestamped batch.
export function helpIsStale(entries,baselineIds){return entries.filter(e=>typeof e.id==='string'&&!baselineIds.has(e.id)).length>=10;}
