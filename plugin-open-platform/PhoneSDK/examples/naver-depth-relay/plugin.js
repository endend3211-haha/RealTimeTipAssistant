import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {createRelayClient} from './relay-core.mjs';
const gm=createGMPlugin(),ready=gm.ready(),$=id=>document.getElementById(id);
let wanted=false;
const client=createRelayClient({
 gm,onState:message=>{$('status').textContent=message;},
 onFrame:(frame,ms)=>{$('detail').textContent=(frame.kind==='test'?'테스트 · ':'')+(frame.distanceText||'')+' '+(frame.text||'');$('metrics').textContent='프레임 #'+frame.sequence+' · 수신 ACK '+ms.toFixed(0)+' ms';}
});
async function start(){
 try{
  await ready;const token=$('token').value.trim().toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(token))throw Error('APK에서 복사한 연결 코드를 붙여넣으세요');
  await gm.storage.set('relayToken',token);
  wanted=true;await client.start(token);
 }catch(error){$('status').textContent=error.message;}
}
$('connect').onclick=()=>void start();
$('stop').onclick=async()=>{wanted=false;await client.stop();try{await gm.display.closePage();}catch{}$('status').textContent='전송 중지';};
gm.on('runtime.lifecycleChanged',event=>{
 if(event.state==='suspended')void client.stop();
 if(event.state==='running'&&wanted)void start();
 if(event.state==='stopped'||event.state==='failed'){wanted=false;void client.stop();}
});
window.addEventListener('pagehide',()=>{wanted=false;void client.stop().finally(()=>gm.close());});
(async()=>{
 try{
  await ready;$('status').textContent='APK 중계를 시작하고 연결 코드를 입력하세요';
  const stored=await gm.storage.get('relayToken');
  const token=typeof stored==='string'?stored:stored?.value;
  if(typeof token==='string'&&/^[a-f0-9]{32}$/.test(token)){$('token').value=token;await start();}
 }catch(error){$('status').textContent='초기화 실패: '+error.message;}
})();
