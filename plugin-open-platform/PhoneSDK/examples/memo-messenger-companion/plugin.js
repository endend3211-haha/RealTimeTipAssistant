import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { createMessengerBridge } from './host-link.js';
const gm=createGMPlugin(),$=id=>document.getElementById(id);let token='',state=null,polling=false,busy=false,pairId='',pairStarted=0;
const icon=app=>app.includes('카카오')?['K','k']:app.includes('Telegram')?['T','t']:app.includes('LINE')?['L','l']:['M',''];
async function request(route,body){const response=await fetch('http://127.0.0.1:18769'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(route==="/voice"?7000:3500)});if(!response.ok)throw new Error(response.status===401?'연결 코드를 확인하세요.':'보조 앱 요청에 실패했습니다.');return response.json();}
async function action(type,extra={}){if(busy)return;busy=true;try{await request('/action',{type,...extra});await sync();}catch(error){$('status').textContent=error.message;}finally{busy=false;}}
const host = createMessengerBridge(gm, request);
function render(next){const list=$('inbox');list.replaceChildren();$('count').textContent=next.messages.length;$('empty').hidden=next.messages.length>0;for(const message of next.messages.slice().reverse()){const button=document.createElement('button');button.className='message'+(message.id===next.activeId?' active':'');const badge=document.createElement('span'),label=document.createElement('span'),name=document.createElement('strong'),preview=document.createElement('span');const [symbol,kind]=icon(message.app);badge.className='icon '+kind;badge.textContent=symbol;name.textContent=message.sender;preview.className='preview';preview.textContent=message.app+' · '+message.body;label.append(name,preview);button.append(badge,label);button.onclick=()=>{if(state?.draft&&!confirm('작성 중인 답장을 취소하고 다른 메시지를 볼까요?'))return;action('choose',{id:message.id});};list.append(button);}const current=next.messages.find(m=>m.id===next.activeId);$('reader').hidden=!current;if(current){const [symbol,kind]=icon(current.app);$('badge').textContent=symbol;$('badge').className='icon '+kind;$('sender').textContent=current.sender;$('appName').textContent=current.app;$('body').textContent=current.body;}$('connection').textContent=next.connected?'MemoMind One 연결됨':'MemoMind One 연결 대기';$('voice').disabled=!next.connected;$('voice').textContent=next.recording?'녹음 마치기':'음성으로 답장';$('replyBox').hidden=!next.draft;if(!state||next.draft!==state.draft)$('draft').value=next.draft;$('status').textContent=next.status;state=next;}
async function sync(){
  const next=await host.poll();
  if(next){
    render(next);
    const issue=host.audioIssue?.();
    if(issue)$('status').textContent=issue;
  }
}
async function automaticPair(){
 if(!pairId||Date.now()-pairStarted>115000){const response=await fetch('http://127.0.0.1:18769/pair/request',{signal:AbortSignal.timeout(3500)});if(!response.ok)throw new Error('연결 요청을 기다리고 있습니다. 잠시 후 다시 시도합니다.');const pair=await response.json();pairId=pair.requestId;pairStarted=Date.now();$('connection').textContent='처음 연결 허용 대기';$('status').textContent='휴대폰 알림에서 연결 허용을 눌러주세요. 확인 '+pair.check;}
 const response=await fetch('http://127.0.0.1:18769/pair/result?id='+encodeURIComponent(pairId),{signal:AbortSignal.timeout(3500)});if(!response.ok)return;const pair=await response.json();if(pair.approved&&pair.token){token=pair.token;await gm.storage.set('relay-token',token);$('token').value=token;$('setup').open=false;await sync();}
}
async function tick(){if(polling)return;polling=true;try{if(token)await sync();else await automaticPair();}catch(error){host.networkLost();$('connection').textContent='보조 앱 연결 확인';$('status').textContent='휴대폰 보조 앱을 실행하면 자동 연결합니다. '+(error.message==='Failed to fetch'?'':error.message);}finally{polling=false;}}
$('connect').onclick=async()=>{token=$('token').value.trim();try{await sync();await gm.storage.set('relay-token',token);$('setup').open=false;}catch(error){$('status').textContent=error.message;}};
$('voice').onclick=()=>action('voice');$('cancel').onclick=()=>action('cancel');$('other').onclick=()=>{$('inbox').scrollIntoView({behavior:'smooth'});};
$('send').onclick=()=>{const text=$('draft').value.trim();const current=state?.messages.find(m=>m.id===state.activeId);if(!text||!current)return;if(confirm(current.app+' · '+current.sender+'\n\n'+text+'\n\n이 문장으로 전송할까요?'))action('send',{text,displayId:state.displayId,confirmed:true});};
await gm.ready();try{const saved=await gm.storage.get('relay-token');token=typeof saved==='string'?saved:typeof saved?.value==='string'?saved.value:'';$('token').value=token;}catch{}await tick();const timer=setInterval(tick,400);window.addEventListener('pagehide',()=>{clearInterval(timer);host.close();gm.close();});
