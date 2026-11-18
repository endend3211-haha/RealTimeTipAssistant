import {buildDeckLod} from './deck-lod.mjs';
import {TransitionClock} from './transition-clock.mjs';
import {forwardPosition} from './reader-navigation.mjs';
import {createScopedPlugin} from '../hub.mjs';
import {navigate} from '../navigation.mjs';
import {PUBLIC_GATEWAY,MangaDexClient,catalogPath,normalizeCatalog,feedPath,normalizeFeed,chapterPages} from './mangadex.mjs';
import {DeckMotion,drawComicScene} from './coverflow.mjs';
import {HudSender} from './transport.mjs';
import {packLumaGray4} from './frame-pipeline.mjs';
export async function mount(root){
const $=id=>root.getElementById(id),view=root.querySelector('main'),scene=document.createElement('canvas');scene.width=600;scene.height=350;
const motion=new DeckMotion({positionTolerance:.004,velocityTolerance:.05,angularFrequency:20}),motionClock=new TransitionClock(),progress=new Map();let client,gm,sender,books=[],textures=[],focused=0,captionFocused=0,offset=0,total=0,mode='catalog',demo=false,revision=0,dirty=true,lastSend=0,chapterIndex=0,pageIndex=0,chapters=[],pages=[],image,scroll=0,subscription,running=true,closed=false,readerBook,readerKey='',acks=[],feedOffset=0,loadingPage=false;
const HUD_BRIGHTNESS=0.64;
const status=t=>{$('status').textContent=t;};
client=new MangaDexClient({gateway:PUBLIC_GATEWAY});
function pixels(){return packLumaGray4(scene.getContext('2d').getImageData(0,0,600,350),HUD_BRIGHTNESS);}
function show(bytes){const c=$('screen').getContext('2d'),p=c.createImageData(600,350);for(let i=0;i<210000;i++){const g=(i%2?bytes[i>>1]&15:bytes[i>>1]>>4)*17;p.data[i*4]=p.data[i*4+1]=p.data[i*4+2]=g;p.data[i*4+3]=255;}c.putImageData(p,0,0);}
function acknowledged(bytes,r){show(bytes);const now=performance.now();if(r.tiles){motionClock.observeTransfer(r.milliseconds);acks.push(now);acks=acks.filter(t=>now-t<2000);$('metrics').textContent=`표시 ACK ${(acks.length/2).toFixed(1)} fps · ${r.milliseconds} ms · ${(r.bytes/1024).toFixed(1)} KB`;}}
async function present(bytes,bookmark){if(!sender?.ready){show(bytes);$('metrics').textContent='로컬 미리보기 · 안경 표시 미확인';return;}try{await sender.offer(bytes);if(bookmark&&mode==='reading'&&bookmark.key===readerKey){const p=progress.get(readerKey)||{page:-1,y:0};if(bookmark.page>p.page||bookmark.page===p.page&&bookmark.y>p.y){progress.set(readerKey,bookmark);try{localStorage.setItem(readerKey,JSON.stringify(bookmark));}catch{}}}}catch(e){status(e.message);dirty=true;}}
function loop(time){if(closed)return;requestAnimationFrame(loop);if(!running)return;if(mode==='catalog'&&motion.active)dirty=true;if(!dirty||sender?.busy||time-lastSend<33)return;if(mode==='catalog'&&motion.active)motion.advance(motionClock.step(time));lastSend=time;dirty=false;let bookmark;const c=scene.getContext('2d');if(mode==='catalog'){if(!motion.active)captionFocused=focused;drawComicScene(c,textures,books,motion.position,captionFocused,motion.active);}else{c.fillStyle='#000';c.fillRect(0,0,600,350);if(image){const h=image.height*600/image.width;scroll=Math.max(0,Math.min(scroll,Math.max(0,h-350)));c.drawImage(image,0,-scroll,600,h);bookmark={key:readerKey,page:pageIndex,y:scroll};}}void present(pixels(),bookmark);}requestAnimationFrame(loop);
function texture(book,i,cover){const t=document.createElement('canvas');t.width=232;t.height=280;const c=t.getContext('2d');c.fillStyle=['#304b54','#5a3e47','#3b5143'][i%3];c.fillRect(0,0,232,280);if(cover){const s=Math.max(232/cover.width,280/cover.height);c.drawImage(cover,(232-cover.width*s)/2,(280-cover.height*s)/2,cover.width*s,cover.height*s);}else{c.fillStyle='#fff5df';c.font='bold 80px sans-serif';c.textAlign='center';c.fillText(String(i+1),116,150);}c.fillStyle='rgba(0,0,0,.85)';c.fillRect(0,230,232,50);c.fillStyle='#fff5df';c.textAlign='center';c.font='bold 18px sans-serif';c.fillText(book.title,116,260,218);return t;}
function focus(i){if(!books.length)return;if(!motion.active)motionClock.reset();focused=(i+books.length)%books.length;motion.retarget(focused,books.length);$('focused').textContent=books[focused].title;dirty=true;}
function catalog(){++revision;mode='catalog';view.classList.remove('reading');image?.close?.();image=undefined;$('reader-tools').hidden=true;$('catalog-tools').hidden=false;$('deck-tools').hidden=false;dirty=true;status('작품을 선택하세요.');}
function setBooks(items){books=items;focused=captionFocused=0;motion.reset(0);motionClock.reset();textures=books.map((b,i)=>buildDeckLod(document,texture(b,i)));$('focused').textContent=books[0]?.title||'선택한 언어의 작품이 없습니다.';$('page').textContent=`${offset+1}–${offset+books.length} / ${total}`;$('read').disabled=!books.length;$('previous-list').disabled=offset===0;$('next-list').disabled=offset+7>=total;dirty=true;}
async function load(){catalog();const token=revision;demo=false;setBooks([]);$('focused').textContent='작품 목록 연결 중…';status('만화 목록을 불러오는 중…');try{const result=normalizeCatalog(await client.json(catalogPath({title:$('query').value,lang:$('language').value,offset})));if(token!==revision)return;total=result.total;setBooks(result.items);status(books.length?'위·아래: 타이틀 이동 · 한 번: 읽기':'해당 언어의 작품이 없습니다. 언어를 변경해 주세요.');await Promise.all(books.map(async(b,i)=>{if(!b.cover)return;try{const cover=await client.image(b.cover);if(token===revision){textures[i]=buildDeckLod(document,texture(b,i,cover));dirty=true;}cover.close?.();}catch(e){if(token===revision)status(`표지 연결 실패: ${e.message}`);}}));}catch(e){if(token===revision){$('focused').textContent='작품 목록 연결 실패';status(e.message);dirty=true;}}}
function examples(){catalog();demo=true;total=7;offset=0;setBooks(['달빛 우체국','구름의 도서관','별을 걷는 고양이','내일의 정원','바다의 시계','숲속의 약속','마지막 여름'].map((title,i)=>({id:`demo-${i}`,title})));status('오프라인 자체 제작 예제 · 실제 MangaDex 작품이 아닙니다.');}
async function open(){if(!books[focused])return;const token=++revision;readerBook=books[focused];status('공개 회차를 확인하는 중…');try{if(demo)chapters=[{id:readerBook.id,number:'1',groups:[]}];else{const feed=normalizeFeed(await client.json(feedPath(readerBook.id,$('language').value)));if(token!==revision)return;chapters=feed.chapters;feedOffset=feed.nextOffset;}if(!chapters.length)throw Error('이 언어로 공개된 본문 회차가 없습니다.');chapterIndex=0;await openChapter(token);}catch(e){status(e.message);}}
async function openChapter(token=++revision){try{const next=demo?Array.from({length:5},(_,i)=>`demo-${i}`):chapterPages(await client.json(`/at-home/server/${chapters[chapterIndex].id}`,{fresh:true}));if(token!==revision)return;pages=next;image?.close?.();image=undefined;readerKey=`pocket-manga:${chapters[chapterIndex].id}`;try{const saved=JSON.parse(localStorage.getItem(readerKey));if(saved)progress.set(readerKey,saved);}catch{}mode='reading';view.classList.add('reading');$('reader-tools').hidden=false;$('catalog-tools').hidden=true;$('deck-tools').hidden=true;$('reader-title').textContent=`${readerBook.title} · ${chapters[chapterIndex].number||''}화`;$('credit').textContent=demo?'자체 제작 예제':`MangaDex · ${(chapters[chapterIndex].groups||[]).map(g=>g.name).join(', ')}`;const saved=progress.get(readerKey);await showPage(Math.min(pages.length-1,Math.max(0,saved?.page||0)),saved?.y||0,token);}catch(e){status(e.message);}}
async function showPage(index,y=0,token=++revision){if(index<0||index>=pages.length)return;status('본문을 불러오는 중…');let next;try{if(demo){next=document.createElement('canvas');next.width=600;next.height=1050;const c=next.getContext('2d');c.fillStyle='#eee7d6';c.fillRect(0,0,600,1050);c.fillStyle='#111';for(let i=0;i<3;i++){c.strokeRect(18,i*350+18,564,310);c.font='bold 30px sans-serif';c.fillText(readerBook.title,40,i*350+80);c.font='24px sans-serif';c.fillText(`예제 ${index+1}쪽 · ${i+1}번째 장면`,40,i*350+150);}}else next=await client.image(pages[index]);if(token!==revision){next.close?.();return;}image?.close?.();image=next;pageIndex=index;if(!demo&&pages[index+1])void client.image(pages[index+1]).then(b=>b.close?.()).catch(()=>{});scroll=y===Infinity?Math.max(0,image.height*600/image.width-350):y;dirty=true;status(`${pageIndex+1} / ${pages.length}쪽 · 상하 스크롤 · 두 번 타이틀 · 길게 홈`);}catch(e){status(`본문 표시 실패: ${e.message} · 작품을 다시 선택하면 이미지 주소를 갱신합니다.`);}}
async function nextUnread(){
 if(!image||loadingPage)return;
 const target=forwardPosition({page:pageIndex,y:scroll},null,image.height*600/image.width,pages.length);
 if(target?.page===pageIndex){scroll=target.y;dirty=true;return;}
 loadingPage=true;
 try{
  if(target)await showPage(target.page,target.y);
  else if(chapterIndex+1<chapters.length){chapterIndex++;await openChapter();}
  else status('마지막 페이지입니다. 회차 더 불러오기로 다음 회차를 확인하세요.');
 }finally{loadingPage=false;}
}
async function previous(){
 if(!image||loadingPage)return;
 if(scroll>0){scroll=Math.max(0,scroll-300);dirty=true;}
 else if(pageIndex>0){loadingPage=true;try{await showPage(pageIndex-1,Infinity);}finally{loadingPage=false;}}
 else status('회차의 첫 페이지입니다.');
}

function home(){catalog();navigate('home');}
function command({button,action}){
 if(!running)return;
 if(action==='long'||action==='very_long'){home();return;}
 if(action==='double'){if(mode==='reading')catalog();else home();return;}
 if(action==='single'){if(mode==='catalog')void open();return;}
 if(action!=='trigger')return;
 const key=String(button).toLowerCase();
 if(key==='11'||key==='home'){home();return;}
 if(key==='10'||key==='back'){if(mode==='reading')catalog();else home();return;}
 const direction=['2','6','8','up','page_up','scroll_up'].includes(key)?-1:
  ['3','7','9','down','page_down','scroll_down'].includes(key)?1:0;
 if(!direction)return;
 if(mode==='catalog')focus(focused+direction);
 else if(direction>0)void nextUnread();
 else void previous();
}
$('search').onsubmit=e=>{e.preventDefault();offset=0;void load();};$('demo').onclick=examples;$('read').onclick=open;$('right').onclick=()=>focus(focused+1);$('left').onclick=()=>focus(focused-1);$('previous-list').onclick=()=>{offset=Math.max(0,offset-7);void load();};$('next-list').onclick=()=>{offset+=7;void load();};$('back').onclick=catalog;$('next-page').onclick=nextUnread;$('previous-page').onclick=previous;
$('more-chapters').onclick=async()=>{if(demo)return;try{const result=normalizeFeed(await client.json(feedPath(readerBook.id,$('language').value,feedOffset)));feedOffset=result.nextOffset;const ids=new Set(chapters.map(c=>c.id));chapters.push(...result.chapters.filter(c=>!ids.has(c.id)));status(`회차 ${chapters.length}개 준비됨`);}catch(e){status(e.message);}};
$('search').closest('main').querySelector('.glow-navigation a').onclick=e=>{e.preventDefault();home();};
root.addEventListener('keydown',e=>{if(e.target.closest('input,select,button'))return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();command({button:e.key==='ArrowDown'?'down':'up',action:'trigger'});}else if(e.key==='Enter')command({action:'single'});else if(e.key==='Escape')command({action:'double'});});
async function connect(){try{gm=createScopedPlugin('manga');sender=new HudSender(gm,acknowledged,{fast:true});gm.device.onButton(command);gm.device.onConnection(e=>{sender.suspend();sender.ready=e.connected;sender.active=e.connected&&running;dirty=true;});gm.on('runtime.lifecycleChanged',e=>{running=e.state==='running';if(!running)sender.suspend();else{sender.active=true;dirty=true;}});await gm.ready();sender.ready=true;subscription=(await gm.device.subscribeEvents(['button','connection'])).subscriptionId;dirty=true;}catch(e){status(`로컬 미리보기 · ${e.message}`);}}void connect();void load();
window.addEventListener('pagehide',()=>{closed=true;client.close();sender?.close();image?.close?.();if(subscription)void gm.device.unsubscribeEvents(subscription).catch(()=>{});gm?.close();});
}
