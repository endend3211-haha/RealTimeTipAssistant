import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
const gm=createGMPlugin(), canvas=document.getElementById('canvas'), status=document.getElementById('status');
const b64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)};
function gray4(){const src=canvas.getContext('2d').getImageData(0,0,320,200).data,out=new Uint8Array(280*350);for(let y=0;y<350;y++){const sy=Math.min(199,Math.floor(y*200/350));for(let x=0;x<560;x+=2){const sx=Math.min(319,Math.floor(x*320/560));const a=(sy*320+sx)*4,b=(sy*320+Math.min(319,sx+1))*4;const lum=o=>Math.max(0,Math.min(15,Math.round((src[o]*.299+src[o+1]*.587+src[o+2]*.114)/17)));out[y*280+x/2]=(lum(a)<<4)|lum(b);}}return out}
async function send(){try{const frame=gray4();const half=175;await gm.display.updateImage({x:20,y:0,width:560,height:half,stride:280,dataBase64:b64(frame.subarray(0,280*half))});await gm.display.updateImage({x:20,y:half,width:560,height:half,stride:280,dataBase64:b64(frame.subarray(280*half))})}catch(e){status.textContent='글라스 전송 오류: '+e.message}}
async function loadWad(){const z=new Uint8Array(await (await fetch('doom.zip')).arrayBuffer());const p=z.findIndex((v,i)=>v===80&&z[i+1]===75&&z[i+2]===3&&z[i+3]===4);if(p<0)throw new Error('Doom WAD 압축 파일을 찾을 수 없습니다');const cs=z[p+18]|z[p+19]<<8|(z[p+20]|z[p+21]<<8)<<16,ns=z[p+26]|z[p+27]<<8,es=z[p+28]|z[p+29]<<8,raw=z.subarray(p+30+ns+es,p+30+ns+es+cs);const out=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();Module.FS_createDataFile('/','doom1.wad',new Uint8Array(out),true,true);Module.callMain(["-iwad","doom1.wad","-warp","1","1","-skill","3"])}
await gm.ready();status.textContent='Doom WAD 불러오는 중...';await loadWad();status.textContent='Doom 실행 중 · 글라스 화면으로 전송';let sending=false;setInterval(async()=>{if(sending)return;sending=true;try{await send()}finally{sending=false}},150);
const keys={ArrowLeft:172,ArrowRight:174,ArrowUp:173,ArrowDown:175,Control:163,' ':162,Enter:13,Escape:27};
const held=new Set();
function key(k,down){const n=keys[k];if(n===undefined||typeof Module._doom_push_key!=='function')return;if(down){if(held.has(n))return;held.add(n)}else held.delete(n);Module._doom_push_key(down?1:0,n)}
for(const b of document.querySelectorAll('[data-key]')){const k=b.dataset.key;b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);key(k,true)};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>key(k,false)}
window.addEventListener('blur',()=>{for(const n of held)Module._doom_push_key(0,n);held.clear()});
const pulse=(k)=>{key(k,true);setTimeout(()=>key(k,false),180)};
gm.device.onGesture(e=>{if(!e.active)return;const k={headRaise:'ArrowUp',headLower:'ArrowDown',headTurnLeft:'ArrowLeft',headTurnRight:'ArrowRight',left:'ArrowLeft',right:'ArrowRight'}[e.gesture];if(k)pulse(k)});
gm.device.onButton(e=>{if(e.action==='single')pulse('Control');if(e.action==='double')pulse(' ')});
