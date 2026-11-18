import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {parseNotification,packGray4,MAX_AGE_MS,NAVER_PACKAGE} from './notification-core.mjs';
import {drawFrame} from './render.mjs';
import {createImageSender} from './image-sender.mjs';
const $=id=>document.getElementById(id),gm=createGMPlugin();
const readyPromise=gm.ready();
readyPromise.catch(error=>{
 $('status').textContent='플러그인 초기화 실패: '+error.message;
});
let current=null,activeKey='',expiry=0,deadline=0,connected=false,connecting=false;
const sender=createImageSender(gm,r=>{
 $('metrics').textContent=r.ok?'이미지 '+r.bytes.toLocaleString()+' B · Scene '+r.sceneBytes.toLocaleString()+' B · Base64 '+r.base64Chars.toLocaleString()+' 문자 · 브리지 응답 '+r.ackMs.toFixed(0)+' ms (화면 표시 시간 아님)':'전송 실패: '+r.error.message+' · 다시 보내기로 재시도';
});
function show(frame,expiresAt=Infinity){
 const canvas=drawFrame(frame),ctx=$('preview').getContext('2d');
 ctx.clearRect(0,0,560,272);ctx.drawImage(canvas,0,0);
 current=packGray4(ctx.getImageData(0,0,560,272).data,560,272);deadline=expiresAt;
 void sender.send(current,JSON.stringify(frame),expiresAt).catch(e=>{$('status').textContent=e.message;});
}
function clear(reason){clearTimeout(expiry);activeKey='';show({message:reason});$('status').textContent=reason;}
function receive(raw,test=false){
 const frame=parseNotification(raw);if(!frame)return;
 clearTimeout(expiry);activeKey=frame.key;
 const until=frame.postedAt+MAX_AGE_MS;
 // Timestamps and notification IDs are excluded from the image dedup key.
 const {postedAt,key,...visual}=frame;
 show(visual,until);$('status').textContent=(test?'테스트: ':'실제 알림: ')+frame.text;
 expiry=setTimeout(()=>clear('안내 만료 · 새 알림 대기'),Math.max(0,until-Date.now()));
}
window.addEventListener('memo-naver-notification',e=>{
 const event=e.detail;
 if(event?.type==='removed'&&event.key===activeKey)clear('안내 알림 종료');
 if(event?.type==='posted')receive(event.notification);
});
$('test').onclick=()=>receive({packageName:NAVER_PACKAGE,key:'test',postedAt:Date.now(),text:$('input').value},true);
$('connect').onclick=async()=>{
 if(connecting||connected)return;connecting=true;$('connect').disabled=true;
 try{
  await readyPromise;await gm.display.createPage();connected=true;sender.setEnabled(true);
  $('status').textContent='전송 켜짐 · 현재 폰 이미지를 보냅니다';
  if(current)await sender.send(current,'connect-'+Date.now(),deadline);
 }catch(e){$('status').textContent='브리지 연결 실패: '+e.message;}
 finally{connecting=false;$('connect').disabled=connected;}
};
$('stop').onclick=async()=>{
 sender.setEnabled(false);await sender.idle();
 if(connected)try{await gm.display.closePage();}catch(e){$('metrics').textContent='페이지 닫기 실패: '+e.message;}
 connected=false;$('connect').disabled=false;$('status').textContent='글라스 전송 꺼짐';
};
$('retry').onclick=()=>{if(!connected){$('status').textContent='전송을 먼저 켜세요';return;}if(current)void sender.send(current,'retry-'+Date.now(),deadline);};
$('save').onclick=()=>{$('preview').toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='naver-alert.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});};
window.addEventListener('pagehide',()=>{sender.setEnabled(false);clearTimeout(expiry);});
show({message:'네이버 지도 알림 대기'});
if(window.MemoNaverHost?.postMessage){$('host').textContent='Android 호스트 연결됨 · 시스템 알림 접근 허용 필요';window.MemoNaverHost.postMessage('ready');}


