import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {createImageSender} from './image-sender.mjs';
import {render,gray4,fraction} from './render.js';
const gm=createGMPlugin(),ready=gm.ready(),$=id=>document.getElementById(id);
const canvas=$('preview');let animation=0,demo=0,shown=fraction(300),lastSent=0,online=false;
const sender=createImageSender(gm,r=>{$('metrics').textContent=r.ok?'GRAY4 '+r.bytes+' B · 브리지 응답 '+r.ackMs.toFixed(0)+' ms':'전송 실패: '+r.error.message;});
function draw(amount,force=false){
 const meters=Number($('meters').value),direction=$('direction').value;
 $('distance').textContent=meters+'m';render(canvas,meters,direction,amount);
 const now=performance.now();
 if(online&&(force||now-lastSent>160)){lastSent=now;void sender.send(gray4(canvas),meters+'|'+direction+'|'+amount);}
}
function update(){
 cancelAnimationFrame(animation);const start=performance.now(),from=shown,to=fraction(Number($('meters').value));
 function step(now){const t=Math.min(1,(now-start)/650);shown=from+(to-from)*t;draw(shown,t===1);if(t<1)animation=requestAnimationFrame(step);}
 animation=requestAnimationFrame(step);
}
async function connect(){
 try{await ready;await sender.idle();await gm.display.createPage();sender.setEnabled(true);online=true;draw(shown,true);$('status').textContent='화살표 표시 중 · 실제 알림 아님';}
 catch(e){$('status').textContent='연결 대기: '+e.message+' · 다시 표시를 누르세요';}
}
$('meters').oninput=()=>{clearInterval(demo);update();};
$('direction').onchange=()=>{clearInterval(demo);draw(shown,true);};
$('retry').onclick=()=>void connect();
$('demo').onclick=()=>{
 clearInterval(demo);let meters=500;$('meters').value=500;update();
 demo=setInterval(()=>{meters=Math.max(0,meters-25);$('meters').value=meters;update();if(meters===0)clearInterval(demo);},700);
};
window.addEventListener('pagehide',()=>{clearInterval(demo);cancelAnimationFrame(animation);sender.setEnabled(false);gm.close();});
draw(shown);void connect();
