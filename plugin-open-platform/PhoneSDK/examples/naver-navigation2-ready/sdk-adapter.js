import {createGMPlugin} from './vendor/gm-plugin-web-sdk.esm.js';
import {compressLz4,toBase64} from './image.mjs';
export function connectHUD({current,render,next,previous,stop}){
 const gm=createGMPlugin();let ready=false,active=true,created=false,pending=null,worker=null,frame=0;
 const status=s=>{document.getElementById('hud-connection-status').textContent=s;};
 function queue(args){pending=args;if(ready&&active)void send();}
 async function send(){if(worker)return;worker=(async()=>{while(pending&&active&&ready){const args=pending;pending=null;try{
  const image=render(...args);if(image.width>600||image.height>350)throw Error('HUD 화면 크기 초과');
  const bytes=new Uint8Array(105000),ox=Math.floor((600-image.width)/2),oy=Math.floor((350-image.height)/2);
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const value=image.pixels[y*image.stride+Math.floor(x/2)],nibble=x%2?value&15:value>>4,index=(oy+y)*600+ox+x,k=Math.floor(index/2);bytes[k]|=index%2?nibble:nibble<<4;}
  if(!created){await gm.display.createPage();created=true;}
  const id=++frame;await gm.display.beginFrame({frameId:id,tileCount:7});
  for(let i=0;i<7;i++){const raw=bytes.subarray(i*15000,(i+1)*15000);await gm.display.updateFrameImageLz4({frameId:id,tileIndex:i,x:0,y:i*50,width:600,height:50,stride:300,decodedSize:raw.length,dataBase64:toBase64(compressLz4(raw))});}
  status('안경 HUD 표시 완료 · 예제 경로');
 }catch(e){created=false;status('HUD 표시 실패: '+e.message);}}})().finally(()=>{worker=null;});return worker;}
 gm.device.onButton(e=>{if(!active)return;if(e.action==='single')next();else if(e.action==='double')previous();else if(['long','very_long'].includes(e.action)){stop();status('모의 이동 정지');}});
 gm.device.onConnection(e=>{created=false;if(e.connected)queue(current());else status('안경 연결을 확인하세요');});
 gm.on('runtime.lifecycleChanged',e=>{active=e.state==='running';created=false;if(!active){pending=null;stop();}else queue(current());});
 document.getElementById('btn-real-gps').addEventListener('click',async e=>{e.stopImmediatePropagation();try{const p=await gm.location.getCurrentPosition({timeoutMs:15000});status(`현재 위치 ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)} · 실제 경로 안내 미연결`);}catch(error){status('위치 확인 실패: '+(error.code||error.message));}},true);
 window.addEventListener('pagehide',()=>{active=false;pending=null;stop();gm.close();});
 (async()=>{try{await gm.ready();await gm.device.subscribeEvents(['button','imuGesture','connection']);ready=true;queue(current());}catch(e){status('MemoMind/Studio 실행 필요: '+e.message);}})();
 return {queue};
}
