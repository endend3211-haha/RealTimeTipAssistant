import {fullFrameTiles} from '../full-frame.mjs';
import {navigate,installHome} from '../navigation.mjs';
import {parseHolding,portfolioTotals,sanitizeHoldings,holdingLabels} from './portfolio.mjs';
import {createQuoteFeed,visibleQuotes,quoteLabels,QUOTE_REFRESH_MS} from './quotes.mjs';
import {RELAY_ORIGIN} from './cloud.mjs';
import {createScopedPlugin} from '../hub.mjs';
import {periods,symbol,parseSearch,parseBasic,parseIntraday,parseHistory,linePoints,money,signed} from './core.mjs';
import {compressLz4,toBase64} from './image.mjs';
export async function mount(root){
installHome(root);








const $=id=>root.querySelector(`#${id}`),gm=createScopedPlugin('stocks'),canvas=$('preview'),ctx=canvas.getContext('2d',{alpha:false});
let watch=[],selected=0,period=0,mode='list',focus=0,data=null,notice='',busy=false,ready=false,page=false,frame=0,renderVersion=0,sendWorker=null,suspended=false,controller=null,initialized=false;
let holdings={};let eventSubscription;
const cache=new Map();
const quoteFeed=createQuoteFeed({fetchQuote:(code,signal)=>request(code,'basic','1d',signal),onUpdate:(code,entry)=>{if(mode==='detail'&&watch[selected]?.symbol===code&&data&&entry.quote&&!entry.error)data={...entry.quote,points:data.points};list();draw();}});
let quoteTimer,quoteLastRefresh=0,quoteTargetKey='';
function hasHoldings(){return watch.some(w=>holdings[w.symbol]);}
function pageSize(){return hasHoldings()?3:5;}
function quoteTargets(){const visible=visibleQuotes(watch,selected,mode,pageSize());return [...visible,...watch.filter(w=>holdings[w.symbol]&&!visible.some(v=>v.symbol===w.symbol))];}
function quoteInterval(){return quoteTargets().length>10?30000:QUOTE_REFRESH_MS;}
function startQuotes(){if(!quoteTimer)quoteTimer=setInterval(()=>{if(!suspended&&!busy&&Date.now()-quoteLastRefresh>=quoteInterval()){quoteLastRefresh=Date.now();quoteFeed.set(quoteTargets());void quoteFeed.refresh();}},QUOTE_REFRESH_MS);}
function stopQuotes(){clearInterval(quoteTimer);quoteTimer=null;quoteTargetKey='';quoteFeed.stop();}
function syncQuotes(){if(initialized&&!suspended&&!busy){startQuotes();const targets=quoteTargets(),key=targets.map(w=>w.symbol).join(',');if(key!==quoteTargetKey){quoteTargetKey=key;quoteLastRefresh=Date.now();}quoteFeed.set(targets);}}
let holdingOptionsKey='';
function loadHoldingEditor(){const h=holdings[$('holding-stock').value];$('holding-quantity').value=h?.quantity||'';$('holding-average').value=h?.averagePrice||'';}
function renderHoldingOptions(){const key=watch.map(w=>w.symbol+':'+w.name).join('|');if(key===holdingOptionsKey)return;holdingOptionsKey=key;const old=$('holding-stock').value;$('holding-stock').replaceChildren();for(const w of watch){const option=document.createElement('option');option.value=w.symbol;option.textContent=w.name+' · '+w.symbol;$('holding-stock').append(option);}if(watch.some(w=>w.symbol===old))$('holding-stock').value=old;loadHoldingEditor();}
function showPortfolio(){const total=portfolioTotals(watch,holdings,quoteFeed.entries);$('portfolio-value').textContent=!total.count?'보유 정보를 등록하세요':total.complete?money(total.value)+'원':`시세 확인 중 (${total.covered}/${total.count}종목)`;$('portfolio-profit').textContent=total.count?`매입금액 ${money(total.cost)}원 · 평가손익 ${total.complete?signed(total.profit)+'원 ('+signed(total.percent,'%')+')':'계산 대기'}`:'';$('portfolio-note').textContent=(total.stale?'이전 시세 포함 · ':'')+'등록한 보유 주식만 합산합니다. 예수금·현금·세금·수수료 제외.';return total;}

function status(s){$('status').textContent=s;}
function button(text,run,cls=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.onclick=()=>void safe(run);return b;}
async function safe(fn){try{await fn();}catch(e){status(e.message);}}
async function save(){await gm.storage.set('stockWatch.naver.v1',watch);}
function list(){
 renderHoldingOptions();showPortfolio();$('count').textContent=`${watch.length}/20`;$('watchlist').replaceChildren();
 watch.forEach((s,i)=>{const row=document.createElement('div');row.className='row';row.append(button(`${s.name} · ${s.symbol}\n${quoteLabels(quoteFeed.entries.get(s.symbol)).price}  ${quoteLabels(quoteFeed.entries.get(s.symbol)).change}`,()=>open(i),'secondary select'),button('↑',async()=>{if(i>0){[watch[i-1],watch[i]]=[watch[i],watch[i-1]];selected=0;mode='list';await save();list();draw();}},'secondary'),button('삭제',async()=>{if(holdings[s.symbol])throw Error('보유 수량을 0으로 저장한 뒤 관심 종목을 삭제하세요');watch.splice(i,1);selected=Math.min(selected,Math.max(0,watch.length-1));data=null;mode='list';await save();list();draw();},'secondary'));$('watchlist').append(row);});
}
let searchTimer,searchController,searchSequence=0,searchResults=[];
function renderSearch(){
 $('suggestions').replaceChildren();searchResults.forEach(w=>{const exists=watch.some(s=>s.symbol===w.symbol);const b=button(`${w.name} · ${w.symbol} · ${w.market} — ${exists?'등록됨':'관심 등록'}`,async()=>{await addWatch(w.name,w.symbol);renderSearch();});b.disabled=exists||busy||!initialized;$('suggestions').append(b);});
}
async function addWatch(name,code){
 if(!initialized)throw Error('저장소 초기화 중입니다');const s=symbol(code);name=name.trim();if(!name||name.length>32)throw Error('종목 이름을 확인하세요');if(watch.some(w=>w.symbol===s))throw Error('이미 등록한 종목입니다');if(watch.length>=20)throw Error('관심 종목은 최대 20개입니다');watch.push({name,symbol:s});try{await save();}catch(e){watch.pop();throw e;}list();mode='list';draw();renderSearch();status(name+' 관심 등록 완료');
}
async function search(){
 clearTimeout(searchTimer);searchController?.abort();const seq=++searchSequence,q=$('search').value.trim();searchResults=[];renderSearch();
 if(!q){$('search-status').textContent='종목명이나 코드를 입력하세요';return;}
 if(q.length>40){$('search-status').textContent='검색어는 40자 이내로 입력하세요';return;}
 const control=new AbortController();searchController=control;const timeout=setTimeout(()=>control.abort(),10000);$('search-status').textContent='네이버에서 검색 중…';
 try{const base=($('relay').value.trim()||RELAY_ORIGIN).replace(/\/$/,'');const url=`${base}/search?q=${encodeURIComponent(q)}`;const response=await fetch(url,{signal:control.signal,credentials:'omit',headers:$('relay-token').value.trim()?{Authorization:'Bearer '+$('relay-token').value.trim()}:{}});if(!response.ok)throw Error('검색 실패 HTTP '+response.status);const result=parseSearch(await response.json());if(seq!==searchSequence)return;searchResults=result;renderSearch();$('search-status').textContent=result.length?`검색 결과 ${result.length}개 · 원하는 종목의 관심 등록을 누르세요`:'검색된 국내 주식이 없습니다';}
 catch(e){if(seq!==searchSequence)return;$('search-status').textContent=e.name==='AbortError'?'검색 시간이 초과되었습니다':e instanceof TypeError?'HTTPS 중계 검색 연결 실패: 인터넷 연결 또는 서버 상태를 확인하세요':e.message;}
 finally{clearTimeout(timeout);if(searchController===control)searchController=null;}
}
async function request(s,resource,range='1d',parentSignal=controller?.signal){
 const key=[s,resource,range].join(':'),hit=cache.get(key);if(hit&&Date.now()-hit.at<(resource==='basic'?10000:60000))return hit.value;
 const base=($('relay').value.trim()||RELAY_ORIGIN).replace(/\/$/,'');const url=`${base}/data?symbol=${encodeURIComponent(s)}&resource=${resource}&range=${range}`;
 const local=new AbortController();const abort=()=>local.abort();if(parentSignal?.aborted)local.abort();else parentSignal?.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,12000);
 try{const headers=$('relay-token').value.trim()?{Authorization:'Bearer '+$('relay-token').value.trim()}:{};const response=await fetch(url,{signal:local.signal,credentials:'omit',headers});if(!response.ok)throw Error(response.status===429?'네이버 요청 제한(429): 잠시 후 다시 조회하세요':`네이버 조회 실패 HTTP ${response.status}`);const body=await response.text();const value=resource==='basic'?parseBasic(JSON.parse(body)):resource==='intraday'?parseIntraday(JSON.parse(body)):parseHistory(body);cache.set(key,{at:Date.now(),value});return value;}
 catch(e){if(e.name==='AbortError')throw Error('시세 조회 시간이 초과되었거나 중지되었습니다');if(e instanceof TypeError)throw Error('HTTPS 중계 서버 연결 실패: 인터넷 연결 또는 서버 상태를 확인하세요');throw e;}
 finally{clearTimeout(timeout);parentSignal?.removeEventListener('abort',abort);}
}
async function open(i){if(busy||!watch[i])return;selected=i;mode='detail';focus=0;await load();}
async function load(){
 if(busy||!watch[selected])return;quoteFeed.stop();busy=true;notice='시세 불러오는 중';data=null;draw();controller=new AbortController();const {signal}=controller;
 try{
  const s=watch[selected];const quote=await request(s.symbol,'basic');if(signal.aborted)return;data=quote;quoteFeed.entries.set(s.symbol,{quote:data,fetchedAt:Date.now(),error:null});
  try{const points=await request(s.symbol,period===0?'intraday':'history',periods[period][0]);if(signal.aborted)return;data.points=points;notice=points.length?'':'해당 기간 차트 데이터 없음';status('네이버 시세 수신 완료 · 시세 15초 자동 갱신'+(notice?' · '+notice:''));}
  catch(e){if(!signal.aborted){notice=e.message;status('현재가 수신 완료 · 차트 실패: '+e.message);}}

 }catch(e){if(!signal.aborted){notice=e.message;status(e.message);}}finally{busy=false;controller=null;draw();}
}
function text(s,x,y,size=18,color='#fff',max=520){ctx.fillStyle=color;ctx.font=`${size}px sans-serif`;ctx.fillText(s,x,y,max);}

function drawPortfolioFooter(total){if(total.count){
   ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(18,232);ctx.lineTo(542,232);ctx.stroke();
   text('총 자산 (보유 주식)',18,251,14,'#aaa',220);ctx.textAlign='right';text(total.complete?money(total.value)+'원':`시세 ${total.covered}/${total.count} 확인 중`,535,252,21,'#fff',295);ctx.textAlign='left';
   text(`매입 ${money(total.cost)}원`,18,274,12,'#aaa',220);ctx.textAlign='right';text(total.complete?`${signed(total.profit)}원 (${signed(total.percent,'%')})${total.stale?' · 이전값':''}`:'일부 시세 누락 · 합계 대기',535,274,13,'#fff',292);ctx.textAlign='left';
  }
}
function draw(){
 root.querySelectorAll('button,input,select').forEach(el=>{el.disabled=busy;});renderSearch();
 ctx.fillStyle='#000';ctx.fillRect(0,0,560,320);const s=watch[selected];
 if(mode==='list'){
  text('관심 주식',18,31,23);text(`${watch.length}개 · ${quoteInterval()/1000}초 갱신`,365,30,13,'#aaa',175);
  if(!watch.length){text('휴대폰에서 관심 종목을 등록하세요',18,110,22);}
  text('종목',24,51,12,'#aaa',118);ctx.textAlign='right';text('시세 · 등락률',294,51,12,'#aaa',136);text('보유주식',382,51,12,'#aaa',72);text('현재 자산',535,51,12,'#aaa',136);ctx.textAlign='left';
  const size=pageSize(),start=Math.floor(selected/size)*size,portfolio=showPortfolio();
  watch.slice(start,start+size).forEach((w,j)=>{
   const heldLayout=hasHoldings(),i=start+j,y=62+j*(heldLayout?54:43),chosen=i===selected,fg=chosen?'#000':'#fff',muted=chosen?'#222':'#aaa',entry=quoteFeed.entries.get(w.symbol),labels=quoteLabels(entry),held=holdingLabels(holdings[w.symbol]),position=portfolio.positions.find(p=>p.symbol===w.symbol);
   if(chosen){ctx.fillStyle='#fff';ctx.fillRect(12,y,536,heldLayout?50:40);}
   text(w.name,24,y+19,16,fg,118);text(w.symbol,24,y+36,11,muted,118);
   ctx.textAlign='right';text(labels.price,294,y+19,17,fg,136);
   const q=entry?.quote,arrow=q?.change>0?'▲':q?.change<0?'▼':'=';
   text(q?`${arrow} ${signed(q.percent,'%')}`:entry?.error?'조회 실패':'조회 중',294,y+37,13,labels.stale?muted:fg,136);
   text(holdings[w.symbol]?held.quantity.replace('보유 ', ''):'—',382,y+25,15,fg,72);
   text(position?(position.value===null?'조회 중':money(position.value)+'원'):'—',535,y+25,16,fg,136);
   if(position&&labels.stale)text('이전 시세',535,y+41,10,muted,136);
   ctx.textAlign='left';
  });
  const total=showPortfolio();
  drawPortfolioFooter(total);
  const entry=watch[selected]&&quoteFeed.entries.get(watch[selected].symbol);
  if(entry?.quote){text(`시세 ${new Date(entry.quote.time*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}${entry.error?' · 갱신 실패':entry.quote.delay>0?' · '+entry.quote.delay+'분 지연':''}`,18,291,12,'#aaa',520);}
  else if(watch.length)text(entry?.error?'시세 조회 실패 · 15초 후 재시도':'현재가·전일 대비 조회 중',18,291,12,'#aaa');

 }else{
  text(s?.name||'관심 주식',18,29,23,'#fff',330);text(periods[period][2],410,28,18);
  if(data){
   text(`${money(data.price)} ${data.currency}`,18,65,29);
   text(`${data.change===null?'—':data.change>0?'▲':data.change<0?'▼':'='} ${signed(data.change)} (${signed(data.percent,'%')})`,18,92,19);
   if(hasHoldings()){const held=holdingLabels(holdings[s?.symbol]);text(held.quantity,18,114,14,'#aaa',220);ctx.textAlign='right';const position=portfolioTotals(watch,holdings,quoteFeed.entries).positions.find(p=>p.symbol===s?.symbol);text(position&&position.value!==null?'현재 자산 '+money(position.value)+'원':'현재 자산 —',535,114,14,'#aaa',280);ctx.textAlign='left';}
   text(`시세 ${new Date(data.time*1000).toLocaleString('ko-KR',{timeZone:data.timezone})}`,18,hasHoldings()?134:115,12,'#aaa',330);
   text(data.delay===null?'지연 여부 미확인':data.delay>0?`${data.delay}분 지연`:'공급자 지연값 0분',365,hasHoldings()?134:113,12,'#aaa',175);
   const compact=hasHoldings(),points=linePoints(data.points,20,compact?157:145,435,compact?48:102);
   ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.strokeRect(18,compact?147:136,440,compact?66:117);
   if(points.length){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();if(points.length===1){ctx.fillStyle='#fff';ctx.fillRect(points[0][0]-2,points[0][1]-2,4,4);}const prices=data.points.map(p=>p.p);text(money(Math.max(...prices)),466,compact?160:150,12,'#aaa',90);text(money(Math.min(...prices)),466,compact?207:249,12,'#aaa',90);text(new Date(data.points[0].t*1000).toLocaleDateString('ko-KR',{timeZone:data.timezone}),20,compact?225:270,11,'#aaa',220);text(new Date(data.points.at(-1).t*1000).toLocaleDateString('ko-KR',{timeZone:data.timezone}),300,compact?225:270,11,'#aaa',220);}
   if(!points.length){text('차트 데이터 없음',100,compact?170:190,20);text(notice.slice(0,36),28,compact?195:220,12,'#aaa',480);}
  }else{text(busy?'시세 불러오는 중':'시세를 가져오지 못했습니다',18,100,23);text(notice.slice(0,32),18,145,16,'#aaa');text(notice.slice(32,64),18,170,16,'#aaa');}
  drawPortfolioFooter(showPortfolio());
  const actions=['기간 변경','새로고침','목록'];actions.forEach((a,i)=>{const x=16+i*180;ctx.fillStyle=i===focus?'#fff':'#222';ctx.fillRect(x,278,170,25);text(a,x+12,297,16,i===focus?'#000':'#fff',150);});
 }
 showPortfolio();text(mode==='list'?'상하: 종목 이동 · 한 번: 열기 · 길게: 홈':'상하: 기능 이동 · 한 번: 실행 · 두 번: 이전 · 길게: 홈',18,317,12,'#aaa');
 $('title').textContent=mode==='detail'?(s?.name||'시세'):'안경 관심 목록';$('quote').textContent=mode==='detail'&&data?`${money(data.price)} ${data.currency} · ${signed(data.percent,'%')}`:notice||'종목을 선택하세요';
 renderVersion++;if(ready&&!suspended)queueSend();syncQuotes();
}
function queueSend(){if(sendWorker)return;sendWorker=(async()=>{while(!suspended){const version=renderVersion;try{if(!page){await gm.display.createPage();page=true;}const tiles=fullFrameTiles(ctx);const id=++frame;await gm.display.beginFrame({frameId:id,tileCount:7});for(let i=0;i<tiles.length;i++)await gm.display.updateFrameImageLz4({frameId:id,tileIndex:i,x:0,y:i*50,width:600,height:50,stride:300,decodedSize:tiles[i].length,dataBase64:toBase64(compressLz4(tiles[i]))});$('device').textContent='안경 프레임 전송 완료';}catch(e){page=false;$('device').textContent='안경 전송 실패: '+e.message;break;}if(version===renderVersion)break;}})().finally(()=>{sendWorker=null;});}
async function input(action){
 if(action==='long'||action==='very_long'){navigate('../index.html');return;}
 if(!initialized||suspended)return;
 if(mode==='detail'&&action==='double'){
  mode='list';
  notice='';
  controller?.abort();
  draw();
  return;
 }
 if(busy)return;
 if(mode==='list'){if(action==='single'||action==='double')await open(selected);return;}
 if(action!=='single')return;
 if(focus===0){period=(period+1)%periods.length;await load();}
 else if(focus===1)await load();
 else{mode='list';draw();}
}
$('search').oninput=()=>{clearTimeout(searchTimer);searchController?.abort();searchSequence++;searchTimer=setTimeout(()=>void search(),400);};$('search-form').onsubmit=e=>{e.preventDefault();void search();};
$('save-relay').onclick=()=>void safe(async()=>{const value=($('relay').value.trim()||RELAY_ORIGIN).replace(/\/$/,'');if(value){const u=new URL(value);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('HTTPS 주소 또는 휴대폰 로컬 주소만 허용합니다');if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('서버 기본 주소만 입력하세요');}await gm.storage.set('stockRelay.cloud.v1',{url:value,token:$('relay-token').value.trim()});cache.clear();quoteFeed.clear();searchController?.abort();searchSequence++;await checkConnection();status('연결 설정 저장 완료');if($('search').value.trim())await search();});
$('add-form').onsubmit=e=>{e.preventDefault();void safe(()=>addWatch($('name').value,$('symbol').value));};
$('glasses').onclick=()=>{mode='list';page=false;draw();};$('refresh').onclick=()=>void safe(async()=>{mode='detail';await load();});
periods.forEach((p,i)=>$('periods').append(button(p[2],async()=>{period=i;mode='detail';await load();},'secondary')));
gm.device.onButton(event=>void safe(()=>{
 if(event.action!=='trigger')return input(event.action);
 if(!initialized||busy||suspended)return;
 const button=String(event.button).toLowerCase();
 if(['10','11','back','home'].includes(button))return input('long');
 const delta=['2','4','6','8','up','left','page_up','scroll_up'].includes(button)?-1:
  ['3','5','7','9','down','right','page_down','scroll_down'].includes(button)?1:0;
 if(!delta)return;
 if(mode==='list')selected=(selected+delta+watch.length)%Math.max(1,watch.length);
 else focus=(focus+delta+3)%3;
 draw();
}));
gm.device.onConnection(e=>{if(e.connected){page=false;draw();}else{page=false;$('device').textContent='안경 연결 끊김';}});
gm.on('runtime.lifecycleChanged',e=>{suspended=e.state!=='running';if(suspended){controller?.abort();stopQuotes();page=false;}else draw();});
window.addEventListener('pagehide',()=>{suspended=true;stopQuotes();controller?.abort();searchController?.abort();clearTimeout(searchTimer);if(eventSubscription)void gm.device.unsubscribeEvents(eventSubscription).catch(()=>{});gm.close();});
$('relay').value=RELAY_ORIGIN;draw();
(async()=>{try{await gm.ready();let saved=await gm.storage.get('stockWatch.naver.v1');let items=saved?.value??saved;if(!Array.isArray(items)){saved=await gm.storage.get('stockWatch.v1');items=saved?.value??saved;}if(Array.isArray(items))watch=items.filter(w=>{try{return typeof w.name==='string'&&w.name.length<=32&&Boolean(symbol(w.symbol));}catch{return false;}}).map(w=>({...w,symbol:symbol(w.symbol)})).slice(0,20);const setting=await gm.storage.get('stockRelay.cloud.v1');const config=setting?.value??setting;if(config&&typeof config.url==='string'){$('relay').value=config.url;$('relay-token').value=config.token||'';}const held=await gm.storage.get('stockHoldings.naver.v1');holdings=sanitizeHoldings(held?.value??held,watch);initialized=true;list();status('관심 종목을 등록하세요');void checkConnection();eventSubscription=(await gm.device.subscribeEvents(['button','connection'])).subscriptionId;ready=true;draw();}catch(e){status('초기화 실패: '+e.message);}})();

async function checkConnection(){const base=($('relay').value.trim()||RELAY_ORIGIN).replace(/\/$/,'');$('connection-status').textContent='HTTPS 중계 연결 확인 중';try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(10000),credentials:'omit'});if(!r.ok)throw Error('HTTP '+r.status);const health=await r.json();if(health.service!=='Memo Naver Stock Relay')throw Error('중계 응답 형식 오류');$('connection-status').textContent='HTTPS 중계 연결됨 · '+health.version;}catch(e){$('connection-status').textContent='중계 연결 실패: '+e.message;}}
$('check-connection').onclick=()=>void checkConnection();

$('holding-stock').onchange=loadHoldingEditor;
$('holding-form').onsubmit=e=>{e.preventDefault();void safe(async()=>{if(!initialized)throw Error('저장소 초기화 중입니다');const code=$('holding-stock').value;if(!watch.some(w=>w.symbol===code))throw Error('관심 종목을 먼저 등록하세요');const holding=parseHolding($('holding-quantity').value,$('holding-average').value),next={...holdings};if(holding)next[code]=holding;else delete next[code];await gm.storage.set('stockHoldings.naver.v1',next);holdings=next;loadHoldingEditor();list();draw();status('보유 정보 저장 완료 · 휴대폰에만 저장');});};


}
