// MangaDex official spec: https://api.mangadex.org/docs/swagger.html
export const API = 'https://api.mangadex.org';
export const PUBLIC_GATEWAY='https://proxy.cors.dev';
export function isPublicGateway(gateway){return gateway.replace(/\/$/,'')===PUBLIC_GATEWAY;}
export function gatewayRequestUrl(gateway,operation,value,token){
 const base=gateway.replace(/\/$/,'');
 if(isPublicGateway(base)){
  if(operation==='json'&&!/^\/(?:manga(?:\/[a-f0-9-]{36}\/feed)?|at-home\/server\/[a-f0-9-]{36})(?:\?[^#\r\n]*)?$/i.test(value))throw Error('허용되지 않은 MangaDex 요청입니다.');
  if(operation==='image'&&new URL(value).protocol!=='https:')throw Error('이미지 서버는 HTTPS여야 합니다.');
  return base+'/'+(operation==='image'?value:API+value);
 }
 const query=new URLSearchParams({[operation==='image'?'url':'path']:value});if(operation==='image'&&token)query.set('token',token);
 return base+`/${operation==='image'?'image':'api'}?`+query;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function id(value) { if(!UUID.test(value)) throw Error('작품 또는 회차 번호가 올바르지 않습니다.');return value; }
function language(value) { if(!/^[a-z]{2}(?:-[a-z]{2})?$/.test(value))throw Error('번역 언어를 확인해 주세요.');return value; }
export function catalogPath({title='',lang='ko',offset=0}={}) {
 if(!Number.isInteger(offset)||offset<0||offset>9993)throw Error('목록 범위를 확인해 주세요.');
 const q=new URLSearchParams({limit:'7',offset:String(offset),'includes[]':'cover_art','availableTranslatedLanguage[]':language(lang),'order[followedCount]':'desc'});
 q.append('contentRating[]','safe');q.append('contentRating[]','suggestive');if(title.trim())q.set('title',title.trim());return '/manga?'+q;
}
export function feedPath(manga,lang='ko',offset=0) {return `/manga/${id(manga)}/feed?`+new URLSearchParams({limit:'100',offset:String(offset),'translatedLanguage[]':language(lang),'includes[]':'scanlation_group','order[volume]':'asc','order[chapter]':'asc',includeExternalUrl:'0'});}
export function localized(map={}) {return map.ko||map.en||map['ja-ro']||map.ja||Object.values(map).find(x=>typeof x==='string')||'제목 없음';}
export function normalizeCatalog(json) {
 if(json?.result!=='ok'||!Array.isArray(json.data))throw Error('MangaDex 작품 목록 응답을 확인해 주세요.');
 return {total:Number(json.total)||0,items:json.data.map(row=>{const a=row.attributes||{},relations=row.relationships||[],cover=relations.find(x=>x.type==='cover_art')?.attributes?.fileName;
  return {id:id(row.id),title:localized(a.title),description:localized(a.description),cover:cover?`https://uploads.mangadex.org/covers/${row.id}/${encodeURIComponent(cover)}.256.jpg`:'',source:'MangaDex',readingDirection:a.readingDirection||'rtl',languages:a.availableTranslatedLanguages||[]};})};
}
export function normalizeFeed(json) {
 if(json?.result!=='ok'||!Array.isArray(json.data))throw Error('회차 목록 응답을 확인해 주세요.');
 return {total:Number(json.total)||0,nextOffset:(Number(json.offset)||0)+json.data.length,chapters:json.data.filter(row=>row.attributes?.pages>0&&!row.attributes.externalUrl&&(!row.attributes.readableAt||Date.parse(row.attributes.readableAt)<=Date.now())).map(row=>({
  id:id(row.id),number:row.attributes.chapter,volume:row.attributes.volume,title:row.attributes.title||'',lang:row.attributes.translatedLanguage,
  groups:(row.relationships||[]).filter(x=>x.type==='scanlation_group').map(x=>({id:x.id,name:x.attributes?.name||'번역 그룹'}))
 }))};
}
export function chapterPages(json) {
 if(json?.result!=='ok'||!json.chapter||typeof json.baseUrl!=='string')throw Error('회차 이미지 응답을 확인해 주세요.');
 const base=new URL(json.baseUrl);if(base.protocol!=='https:'||base.username||base.password)throw Error('이미지 서버 주소를 확인해 주세요.');
 const chapter=json.chapter;if(!/^[a-z0-9]+$/i.test(chapter.hash))throw Error('회차 해시를 확인해 주세요.');
 const saver=Array.isArray(chapter.dataSaver)&&chapter.dataSaver.length>0,files=saver?chapter.dataSaver:chapter.data;
 if(!Array.isArray(files)||!files.length)throw Error('공개된 본문 이미지가 없습니다.');
 return files.map(file=>{if(typeof file!=='string'||file.includes('/')||file.includes('..'))throw Error('본문 파일명을 확인해 주세요.');return json.baseUrl.replace(/\/$/,'')+`/${saver?'data-saver':'data'}/${chapter.hash}/${encodeURIComponent(file)}`;});
}

// Browser fetches use a gateway, including the explicitly supported public
// GET proxy. Android prefers native HTTP. No auth tokens go to a public proxy.
export class MangaDexClient {
 constructor({gateway='',host=()=>window.MemoWebtoonHost}={}) {this.gateway=gateway.replace(/\/$/,'');this.host=host;this.pending=new Map();this.cache=new Map();this.images=new Map();this.imageJobs=new Map();this.mediaTokens=new Map();this.sequence=0;this.lastAt=0;
  this.listener=event=>{const value=event.detail,job=this.pending.get(value?.requestId);if(!job)return;this.pending.delete(value.requestId);clearTimeout(job.timer);value.ok?job.resolve(value.image||value.data):job.reject(Error(value.error||'MangaDex 요청에 실패했습니다.'));};window.addEventListener('memo-mangadex-response',this.listener);
 }
 async request(operation,value) {
  const key=operation+value,cached=this.cache.get(key);if(cached&&Date.now()-cached.at<60000)return cached.value;
  const native=this.host();let result;
  if(native?.mangaRequest){result=await new Promise((resolve,reject)=>{const requestId=`md-${++this.sequence}`;const timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('MangaDex 요청 시간이 초과되었습니다.'));},25000);this.pending.set(requestId,{resolve,reject,timer});native.mangaRequest(JSON.stringify({requestId,operation,value}));});}
  else {
   if(!this.gateway)throw Error('Android MangaDex 연결 또는 개발용 게이트웨이 주소를 설정해 주세요.');
   const base=new URL(this.gateway);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('게이트웨이는 HTTPS 또는 로컬 주소만 허용합니다.');
   const started=performance.now(),publicProxy=isPublicGateway(this.gateway),requestUrl=gatewayRequestUrl(this.gateway,operation,value,this.mediaTokens.get(value));
   let response;try{response=await fetch(requestUrl,{signal:AbortSignal.timeout(25000),credentials:'omit'});}catch(error){if(publicProxy&&operation==='image')void this.report(value,false,0,performance.now()-started);if(['127.0.0.1','localhost'].includes(base.hostname))throw Error('로컬 게이트웨이에 연결할 수 없습니다. 휴대폰의 127.0.0.1은 PC가 아닌 휴대폰 자신입니다. 통신사망에서는 외부 HTTPS 중계 서버 또는 앱 네이티브 연결이 필요합니다.');throw Error('중계 서버에 연결할 수 없습니다. 서버 주소, HTTPS 인증서와 네트워크를 확인하세요.');}
   if(!response.ok){let text='MangaDex 연결에 실패했습니다.';try{text=(await response.json()).error||text;}catch{}throw Error(text);}
   result=operation==='image'?await response.blob():await response.json();
   if(publicProxy&&operation==='image'){if(!result.type.startsWith('image/'))throw Error('중계 서버가 이미지 대신 오류를 반환했습니다.');void this.report(value,true,result.size,performance.now()-started);}
  }
  if(operation!=='image'){if(result.pocketMediaTokens){if(this.mediaTokens.size>1000)this.mediaTokens.clear();for(const [url,token] of Object.entries(result.pocketMediaTokens))this.mediaTokens.set(url,token);}if(this.cache.size>24)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{at:Date.now(),value:result});}return result;
 }
 async json(path,{fresh=false}={}) {if(fresh)this.cache.delete('json'+path);return this.request('json',path);}
 async report(url,success,bytes,duration){if(!url.includes('/data-saver/')&&!url.includes('/data/'))return;try{await fetch('https://api.mangadex.network/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,success,cached:false,bytes,duration:Math.round(duration)}),credentials:'omit',signal:AbortSignal.timeout(3000)});}catch{this.reportUnavailable=true;}}
 async image(url) {
  let blob=this.images.get(url);
  if(!blob){let job=this.imageJobs.get(url);if(!job){job=(async()=>{const value=await this.request('image',url);const b=value instanceof Blob?value:await(await fetch(value)).blob();if(b.size>20*1024*1024)throw Error('이미지 크기 제한 초과');if(this.images.size>=3)this.images.delete(this.images.keys().next().value);this.images.set(url,b);return b;})();this.imageJobs.set(url,job);}try{blob=await job;}finally{this.imageJobs.delete(url);}}
  return createImageBitmap(blob);
 }
 close(){window.removeEventListener('memo-mangadex-response',this.listener);for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error('화면이 종료되었습니다.'));}this.pending.clear();this.images.clear();}
}
