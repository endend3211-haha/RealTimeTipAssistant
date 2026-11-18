import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {compressLz4,toBase64} from './image.mjs';
import {recentContext,appendEntry,packOpus,cleanHistory,createCaptionSegmenter,shouldRequestHelp,acceptHelp,mergeLiveTranscript,helpPopupFrame,sessionEntries,helpIsStale} from './core.mjs';
const $=id=>document.getElementById(id),gm=createGMPlugin(),ctx=$('preview').getContext('2d',{alpha:false}),base='http://127.0.0.1:18772';
let entries=[],answer='',status='준비 중',ready=false,suspended=false,capture=null,consumer=null,starting=false,explaining=false,connected=false,packets=[],queue=[],processing=null,closing=false,screen='caption',pageIndex=0,frame=0,displayPage=false,version=0,sender=null,saveChain=Promise.resolve(),lastExplainAt=0,lastExplainText='',explainGeneration=0,answerAt=0,candidates=[],candidateIndex=0,answerTerm='',discardAudio=false,segmenter=null,receiveHudAt=0,lastAudioAt=0,audioWatch=null;
let popup=null,popupTimer=null,displaySession='',helpMeeting='';
function visibleEntries(){return sessionEntries(entries,displaySession);}
async function helpScope(id){if(id===helpMeeting)return;helpMeeting=id;explainedTerms.clear();await persistHelp();}
function persistHelp(){const value={meeting:helpMeeting,items:[...explainedTerms]};saveChain=saveChain.catch(()=>{}).then(()=>gm.storage.set('conversation.helpSeen.v2',value));return saveChain;}
const explainedTerms=new Map();let liveState={entries:[],partial:"",revision:-1},captureSession="",transcriptTimer=null,polling=false,stopTask=null;
function setStatus(text){status=text;$('status').textContent=text;draw();}
async function safe(fn){try{await fn();}catch(e){const message=e?.message||String(e);setStatus(/NS_ERROR_CONTENT_BLOCKED|content was blocked/i.test(message)?'녹음 채널 차단 · 폰 플러그인 0.1.1 업데이트 확인':message);}}
async function request(path,body,timeout=180000){const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),timeout);try{
 const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+$('key').value.trim(),...(body===undefined?{}:{'Content-Type':body instanceof Uint8Array?'application/octet-stream':'application/json'})},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body),signal:ctrl.signal,credentials:'omit'});
 const data=await r.json();if(!r.ok){const error=Error(data.error||'HTTP '+r.status);error.httpStatus=r.status;throw error;}return data;
}catch(e){if(e.name==='AbortError')throw Error('휴대폰 로컬 처리 시간 초과');if(e instanceof TypeError)throw Error('보조 앱 연결 실패: 서비스 실행 또는 MemoMind localhost 허용 여부를 확인하세요');throw e;}finally{clearTimeout(t);}}
function save(){const snapshot=entries.map(e=>({...e}));saveChain=saveChain.catch(()=>{}).then(()=>gm.storage.set('conversation.history.v1',snapshot));return saveChain;}
async function add(text,kind='speech'){entries=appendEntry(entries,text,Date.now(),kind);if(screen==='caption')pageIndex=0;history();draw();await save();void automaticHelp();}
function history(){$('history').replaceChildren();for(const e of entries.slice(-30).reverse()){const row=document.createElement('div');row.className='entry';const time=document.createElement('small');time.textContent=new Date(e.time).toLocaleTimeString('ko-KR')+(e.kind==='manual'?' · 직접 입력':'');const text=document.createElement('p');text.textContent=e.text;row.append(time,text);$('history').append(row);}}
let pairingTask=null,checkingTask=null;
async function autoPair(){if(pairingTask)return pairingTask;pairingTask=(async()=>{$('connection').textContent='보조 앱과 자동 연결 중';const r=await fetch(base+'/pair',{headers:{'X-Memo-Plugin':'com.mcnex.conversation.phone'},signal:AbortSignal.timeout(5000),credentials:'omit'});const data=await r.json();if(!r.ok)throw Error('보조 APK를 열고 자동 연결을 시작하세요. 키 입력은 필요 없습니다.');if(data.service!=='Memo Conversation Assist'||typeof data.token!=='string'||!/^[A-Za-z0-9_=-]{24,128}$/.test(data.token))throw Error('자동 연결 응답 오류');$('key').value=data.token;await gm.storage.set('conversation.connection.v1',{token:data.token});})().finally(()=>{pairingTask=null;});return pairingTask;}
async function check(){if(checkingTask)return checkingTask;checkingTask=(async()=>{connected=false;if(!$('key').value.trim())await autoPair();let health;try{health=await request('/health',undefined,7000);}catch(e){if(e.httpStatus!==401)throw e;await autoPair();health=await request('/health',undefined,7000);}if(health.service!=='Memo Conversation Assist')throw Error('다른 보조 앱입니다');if(health.version!=='0.6.0'||health.helpPolicy!=='questions-v2')throw Error('보조 APK를 0.8.2 이상으로 업데이트하세요');connected=true;await gm.storage.set('conversation.connection.v1',{token:$('key').value.trim()});$('connection').textContent=health.model?'자동 연결됨 · AI 도움 준비됨':'자동 연결됨 · 자막 사용 가능';setStatus('대화 준비 완료');})().finally(()=>{checkingTask=null;});return checkingTask;}
function enqueue(block){if(queue.length>=8)throw Error('자막 인식이 음성 속도를 따라가지 못했습니다. 잠시 멈춘 뒤 다시 시작하세요.');queue.push(block);pump();}
function applyLive(data){
 if(data.meeting){$('meeting-status').textContent=data.meeting.error||data.meeting.progress||(data.meeting.activeId?'회의 전체 자막 저장 중':'새 회의 시작 대기');if(data.meeting.error&&capture){setStatus(data.meeting.error);void stop(false);}}
 if(data.session!==captureSession)return;
 const previous=liveState.partial;liveState=mergeLiveTranscript({...liveState,entries},data);entries=liveState.entries;
 if(liveState.changed){history();void save().catch(e=>setStatus('기록 저장 실패: '+e.message));}
 if(liveState.changed||previous!==liveState.partial){if(screen==='caption')pageIndex=Number.MAX_SAFE_INTEGER;draw();}
 if(data.error&&capture){setStatus(data.error);void stop(false);}
}
async function pollTranscript(){if(polling||!captureSession||suspended||closing)return;polling=true;try{applyLive(await request('/transcript',undefined,4000));}catch(e){$('device').textContent='자막 상태 조회 지연: '+e.message;}finally{polling=false;}}
function pump(){if(processing)return;processing=(async()=>{while(queue.length&&!closing&&!suspended){const body=queue.shift();try{applyLive(await request('/audio',body,12000));}catch(e){queue=[];void stop(false);setStatus('음성 전달 실패: '+e.message);break;}}})().finally(()=>{processing=null;});}
async function start(){if(!ready||starting||capture||consumer||suspended||stopTask)return;starting=true;displaySession='';captureSession='';liveState={entries,partial:'',revision:-1};answer='';answerTerm='';popup=null;clearTimeout(popupTimer);explainGeneration++;lastExplainAt=0;lastExplainText='';screen='caption';pageIndex=0;$('answer').textContent='';draw();try{if(!connected)await check();
 setStatus('기기 내 한국어 지속 인식 준비 중');const prepared=await request('/prepare',{});captureSession=prepared.session;displaySession=prepared.session;await helpScope(prepared.meeting?.activeId||prepared.session);liveState={entries,partial:'',revision:-1};const caps=await gm.runtime.getCapabilities();if(!caps.audio)throw Error('현재 MemoMind 앱이 안경 음성 수신을 지원하지 않습니다');
 discardAudio=false;setStatus('안경 녹음 채널을 여는 중');capture=await gm.audio.openCapture({profile:'reliable',pickupMode:'frontBalanced',noiseReduction:true});packets=[];queue=[];segmenter=createCaptionSegmenter(enqueue,10);lastAudioAt=Date.now();setStatus('한국어 지속 인식 중');transcriptTimer=setInterval(()=>void pollTranscript(),250);audioWatch=setInterval(()=>{if(capture&&Date.now()-lastAudioAt>8000)setStatus('안경 음성 수신 대기 · 연결과 마이크를 확인하세요');},2000);
 const current=capture;consumer=(async()=>{try{for await(const chunk of current.stream){if(discardAudio)continue;lastAudioAt=Date.now();segmenter.push(chunk);if(Date.now()-receiveHudAt>1000){receiveHudAt=Date.now();setStatus('음성 수신 '+(segmenter.receivedFrames/50).toFixed(1)+'초 · '+(processing?'자막 인식 중':'듣는 중'));}}if(!closing&&!discardAudio)segmenter.flush();}catch(e){setStatus(e.message);queue=[];segmenter?.clear();try{await current.stop();}catch{}}finally{clearInterval(audioWatch);if(capture===current)capture=null;consumer=null;}})();
}finally{starting=false;}}
function stop(flush=true){if(stopTask)return stopTask;stopTask=(async()=>{const current=capture;if(!flush){discardAudio=true;queue=[];packets=[];segmenter?.clear();}if(current){try{await current.stop();}catch(e){setStatus(e.message);}await consumer;}if(processing)await processing;clearInterval(transcriptTimer);transcriptTimer=null;if(captureSession){try{applyLive(await request('/finish',{},5000));}catch(e){$('device').textContent=e.message;}}if(!explaining)setStatus('일시정지');})().finally(()=>{stopTask=null;});return stopTask;}
async function automaticHelp(){
 const context=(recentContext(visibleEntries())+'\n'+liveState.partial).trim().slice(-500),now=Date.now();
 if(!shouldRequestHelp({enabled:$('auto').checked,listening:Boolean(capture),busy:explaining,pending:queue.length,context,lastContext:lastExplainText,lastAt:lastExplainAt,now}))return;
 explaining=true;lastExplainAt=now;lastExplainText=context;const generation=++explainGeneration,sourceTime=entries.at(-1)?.time||now,sourceIds=new Set(visibleEntries().map(e=>e.id));
 $('help-state').textContent='AI가 도움 필요 여부를 확인하는 중';draw();
 try{
  const data=await request('/explain',{context,term:'자동 대화 도움',mode:'assist',avoidTopics:[...explainedTerms.values()].slice(-12).map(v=>v.topic).filter(Boolean)});
  if(generation!==explainGeneration||suspended||closing)return;
  if(helpIsStale(visibleEntries(),sourceIds)){$('help-state').textContent='새 발언이 10개 이상 진행되어 이전 도움을 생략했습니다';return;}
  if(!acceptHelp(data,explainedTerms)){$('help-state').textContent='듣는 중 · 필요한 순간에만 도움을 표시합니다';return;}
  await persistHelp();if(generation!==explainGeneration||suspended||closing)return;if(helpIsStale(visibleEntries(),sourceIds)){$('help-state').textContent='새 발언이 10개 이상 진행되어 이전 도움을 생략했습니다';return;}answer=data.text;answerTerm=(data.kind==='reply'?'답변 힌트 · ':'용어 · ')+data.topic;answerAt=sourceTime;
  $('answer').textContent=answerTerm+'\n'+answer;showHelpPopup(answerTerm,answer);$('help-state').textContent=data.source;draw();
 }catch(e){$('help-state').textContent='자동 도움 대기: '+e.message;}
 finally{explaining=false;draw();}
}
function lines(text,width,font){ctx.font=font;const out=[];let line='';for(const ch of text){if(ch==='\n'){out.push(line);line='';continue;}if(ctx.measureText(line+ch).width>width){out.push(line);line=ch;}else line+=ch;}if(line)out.push(line);return out;}
function showHelpPopup(title,text){clearTimeout(popupTimer);popup={title,text,at:performance.now()};const animate=()=>{if(!popup)return;const frame=helpPopupFrame(popup.at,performance.now());if(!frame.visible){popup=null;draw();return;}draw();popupTimer=setTimeout(animate,Math.max(20,frame.next));};animate();}
function drawHelpPopup(){if(!popup)return;const f=helpPopupFrame(popup.at,performance.now());if(!f.visible)return;const x=16,y=f.y,w=528,h=112;ctx.save();ctx.globalAlpha=f.alpha;ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();if(ctx.roundRect){ctx.roundRect(x,y,w,h,12);ctx.fill();ctx.stroke();}else{ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}ctx.fillStyle='#fff';ctx.font='bold 17px sans-serif';let title=popup.title;while(ctx.measureText(title).width>490&&title.length>1)title=title.slice(0,-1);ctx.fillText(title,x+16,y+23);const body=lines(popup.text,490,'16px sans-serif');ctx.font='16px sans-serif';body.slice(0,3).forEach((line,i)=>ctx.fillText(i===2&&body.length>3?line.slice(0,-1)+'…':line,x+16,y+46+i*18));ctx.font='10px sans-serif';ctx.fillStyle='#aaa';ctx.fillText('잠시 후 자동 닫힘 · 두 번 눌러 전체 도움 보기',x+16,y+102);ctx.restore();}
function draw(){
 ctx.fillStyle='#000';ctx.fillRect(0,0,560,320);ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillText('MEMO / '+(screen==='explanation'?'대화 도움':'대화 자막'),18,26,220);
 const connection=suspended?'일시정지':capture?'연결됨 · 청취 중':connected?'연결됨 · 대기':'연결 확인';
 ctx.textAlign='right';ctx.font='11px sans-serif';ctx.fillStyle='#bbb';ctx.fillText(connection+(explaining?' · AI 분석 중':''),542,25,270);ctx.textAlign='left';ctx.fillStyle='#555';ctx.fillRect(18,38,524,1);ctx.fillStyle='#fff';
 const perPage=8,content=screen==='explanation'?answer:[...visibleEntries().slice(-2).map(e=>e.text),liveState.partial].filter(Boolean).join('\n')||'듣기 시작을 누르면\n대화 자막이 여기에 나타납니다.';
 const wrapped=lines(content,524,'22px sans-serif'),count=Math.max(1,Math.ceil(wrapped.length/perPage));pageIndex=Math.min(pageIndex,count-1);ctx.font='22px sans-serif';wrapped.slice(pageIndex*perPage,pageIndex*perPage+perPage).forEach((line,i)=>ctx.fillText(line,18,67+i*29));
 ctx.textAlign='right';ctx.fillStyle='#999';ctx.font='9px sans-serif';ctx.fillText(`${pageIndex+1}/${count} · ${screen==='explanation'?'도움말 · 두 번 눌러 자막 복귀':'최근 발언 · 두 번 눌러 도움 보기'}`,314,313,222);ctx.fillText('한 번: 페이지 · 두 번: 자막/도움 · 길게: 듣기/정지',542,313,220);ctx.textAlign='left';
 if(screen==='caption')drawHelpPopup();version++;if(ready&&!suspended)send();return count;
}
function send(){if(sender)return;sender=(async()=>{while(!suspended){const v=version;try{if(!displayPage){await gm.display.createPage();displayPage=true;}const pixels=ctx.getImageData(0,0,560,320).data,id=++frame;await gm.display.beginFrame({frameId:id,tileCount:5});for(let t=0;t<5;t++){const raw=new Uint8Array(17920);for(let i=0;i<raw.length;i++){const o=(t*560*64+i*2)*4;raw[i]=(Math.round(pixels[o]/17)<<4)|Math.round(pixels[o+4]/17);}await gm.display.updateFrameImageLz4({frameId:id,tileIndex:t,x:20,y:15+t*64,width:560,height:64,stride:280,decodedSize:raw.length,dataBase64:toBase64(compressLz4(raw))});}$('device').textContent='안경 화면 전송 완료';}catch(e){displayPage=false;$('device').textContent='안경 표시 실패: '+e.message;break;}if(v===version)break;}})().finally(()=>{sender=null;});}
$('auto').onchange=()=>void safe(()=>gm.storage.set('conversation.auto.v1',$('auto').checked));
$('meeting-complete').onclick=()=>void safe(async()=>{if(!confirm('회의를 완료하고 저장된 전체 자막으로 회의록을 만들까요?'))return;await stop();const result=await request('/meeting/complete',{},15000);$('meeting-status').textContent='회의 원문 저장 완료 · APK에서 회의록 생성 진행 확인';setStatus('회의 완료');});
$('connect').onclick=()=>void safe(check);$('start').onclick=()=>void safe(start);$('stop').onclick=()=>void safe(()=>stop());$('show').onclick=()=>{displayPage=false;draw();};
$('manual').onsubmit=e=>{e.preventDefault();void safe(async()=>{await add($('text').value,'manual');$('text').value='';});};
$('clear').onclick=()=>void safe(async()=>{if(capture||processing||explaining)throw Error('듣기와 처리를 정지한 후 삭제하세요');if(!confirm('폰 플러그인의 최근 화면 기록만 지울까요? APK의 회의 원문은 유지됩니다.'))return;entries=[];liveState={entries:[],partial:"",revision:-1};answer='';answerTerm='';popup=null;clearTimeout(popupTimer);$('answer').textContent='';await save();history();draw();});
gm.device.onButton(e=>void safe(async()=>{
 if(e.action==='single'){const n=draw();pageIndex=(pageIndex+1)%n;draw();}
 else if(e.action==='double'){if(screen==='explanation'){screen='caption';pageIndex=0;draw();}else if(answer){screen='explanation';pageIndex=0;draw();}}
 else if(['long','very_long'].includes(e.action)){if(capture)await stop();else await start();}
}));

gm.device.onConnection(e=>{displayPage=false;if(!e.connected)void safe(()=>stop(false));else draw();});
gm.on('runtime.lifecycleChanged',e=>{suspended=e.state!=='running';if(suspended){displayPage=false;explainGeneration++;void request('/cancel',{},3000).catch(()=>{});void stop(false);}else draw();});
window.addEventListener('pagehide',()=>{closing=true;suspended=true;clearInterval(audioWatch);clearInterval(helpTimer);clearInterval(transcriptTimer);clearTimeout(popupTimer);queue=[];packets=[];void capture?.stop();void request('/cancel',{},3000).catch(()=>{});gm.close();});
const helpTimer=setInterval(()=>void automaticHelp(),2000);
draw();(async()=>{try{await gm.ready();const h=await gm.storage.get('conversation.history.v1');entries=cleanHistory(h?.value??h);const c=await gm.storage.get('conversation.connection.v1');$('key').value=(c?.value??c)?.token||'';await gm.device.subscribeEvents(['button','connection']);const pref=await gm.storage.get('conversation.auto.v1');if(typeof(pref?.value??pref)==='boolean')$('auto').checked=pref?.value??pref;const seen=await gm.storage.get('conversation.helpSeen.v2');const saved=seen?.value??seen;if(saved&&typeof saved.meeting==='string'&&Array.isArray(saved.items)){helpMeeting=saved.meeting;for(const item of saved.items)if(Array.isArray(item)&&typeof item[0]==='string'&&item[1]&&typeof item[1].topic==='string'&&typeof item[1].text==='string')explainedTerms.set(item[0],item[1]);}ready=true;history();setStatus('서비스 연결 후 듣기 시작');void safe(check);}catch(e){setStatus('초기화 실패: '+e.message);}})();
