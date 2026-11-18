import { createScopedPlugin } from '../hub.mjs';
import { installHome, navigate } from '../navigation.mjs';

export async function mount(root){
const gm=createScopedPlugin('megadrive');
installHome(root);
gm.device.onButton(({button,action})=>{
 if(action==='long'||action==='very_long'||(action==='trigger'&&['10','11','back','home'].includes(String(button))))navigate('home');
});
const status=root.querySelector('#status');
let ready=false, running=false, sending=false, currentRom='', saveTimer;
const DISPLAY_W=320, DISPLAY_H=224, DISPLAY_STRIDE=DISPLAY_W/2;
const DISPLAY_X=140, DISPLAY_Y=63, BRIGHTNESS=.63;
const FRAME_BYTES=DISPLAY_STRIDE*DISPLAY_H;
let capturedFrame=new Uint8Array(FRAME_BYTES);
let displayedFrame=new Uint8Array(FRAME_BYTES);
let hasDisplayedFrame=false;
const regionPixels=new Uint8Array(FRAME_BYTES);
const compressionTable=new Int32Array(65536);
const compressionBuffer=new Uint8Array(FRAME_BYTES+Math.ceil(FRAME_BYTES/255)+16);
const VIDEO_CHANNEL=0x4d46, VIDEO_ACK_CHANNEL=0x4d47;
let frameId=0, connectionRevision=0, displayFailure='', videoLoop=0;
let displayFrameId=0x4d440000;
const saveKey=name=>`megadrive-state-${name.toLowerCase().replace(/[^a-z0-9가-힣]+/g,'_')}`;
const encodeBytes=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)};
const decodeBytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function saveState(){if(!currentRom||!window.GENESIS_PICO_STATE_SAVE||!window.GENESIS_GAME_BOOTED)return;try{window.GENESIS_PICO_STATE_SAVE();const size=window.GENESIS_PICO_GET_STATE_SIZE();const ptr=window.GENESIS_PICO_GET_STATE_BUFFER();if(!size||!ptr)return;const data=new Uint8Array(window.GENESIS.HEAPU8.buffer,ptr,size);await gm.storage.set(saveKey(currentRom),{version:1,value:encodeBytes(data),savedAt:Date.now()})}catch(e){console.warn('자동 저장 실패',e)}}
async function restoreState(){if(!currentRom||!window.GENESIS_PICO_STATE_LOAD||!window.GENESIS_GAME_BOOTED)return;try{const item=await gm.storage.get(saveKey(currentRom));const value=item?.value??item;if(typeof value!=='string'||!value)return;const data=decodeBytes(value),size=window.GENESIS_PICO_GET_STATE_SIZE(),ptr=window.GENESIS_PICO_GET_STATE_LOAD_BUFFER(data.length);if(ptr){window.GENESIS.HEAPU8.set(data.subarray(0,size),ptr);window.GENESIS_PICO_STATE_LOAD();status.textContent=`자동 저장 복원: ${currentRom}`}}catch(e){console.warn('자동 복원 실패',e)}}
const grayLevels=Uint8Array.from({length:65536},(_,rgb)=>{
 const red=(rgb>>>11)<<3, green=((rgb>>>5)&63)<<2, blue=(rgb&31)<<3;
 return Math.round((red*.299+green*.587+blue*.114)*12*BRIGHTNESS/255);
});
const sourceColumns=new Uint16Array(DISPLAY_W);
const sourceRows=new Uint32Array(DISPLAY_H);
let sourceWidth=0, sourceHeight=0;
function captureFrame(){
 const core=window.GENESIS;
 const offset=window.GENESIS_PICO_GET_VIDEO_BUFFER()/2;
 const width=window.GENESIS_PICO_GET_VIDEO_WIDTH();
 const height=window.GENESIS_PICO_GET_VIDEO_HEIGHT();
 if(!offset||!width||!height||offset+width*height>core.HEAPU16.length)return false;
 if(width!==sourceWidth||height!==sourceHeight){
  sourceWidth=width;
  sourceHeight=height;
  for(let x=0;x<DISPLAY_W;x++)sourceColumns[x]=Math.floor((x+.5)*width/DISPLAY_W);
  for(let y=0;y<DISPLAY_H;y++)sourceRows[y]=Math.floor((y+.5)*height/DISPLAY_H)*width;
 }
 const pixels=core.HEAPU16;
 for(let y=0,i=0;y<DISPLAY_H;y++){
  const row=offset+sourceRows[y];
  for(let x=0;x<DISPLAY_W;x+=2){
   const left=grayLevels[pixels[row+sourceColumns[x]]];
   const right=grayLevels[pixels[row+sourceColumns[x+1]]];
   capturedFrame[i++]=(left<<4)|right;
  }
 }
 return true;
}
function frameRegion(){
 if(!hasDisplayedFrame)return {x:0,y:0,stride:DISPLAY_STRIDE,height:DISPLAY_H,pixels:capturedFrame};
 let left=DISPLAY_STRIDE,right=-1,top=DISPLAY_H,bottom=-1;
 for(let y=0,i=0;y<DISPLAY_H;y++){
  for(let x=0;x<DISPLAY_STRIDE;x++,i++){
   if(capturedFrame[i]===displayedFrame[i])continue;
   left=Math.min(left,x);
   right=Math.max(right,x);
   top=Math.min(top,y);
   bottom=y;
  }
 }
 if(right<0)return null;
 const stride=right-left+1,height=bottom-top+1;
 if(stride===DISPLAY_STRIDE){
  return {x:0,y:top,stride,height,pixels:capturedFrame.subarray(top*stride,(bottom+1)*stride)};
 }
 for(let y=0;y<height;y++){
  const start=(top+y)*DISPLAY_STRIDE+left;
  regionPixels.set(capturedFrame.subarray(start,start+stride),y*stride);
 }
 return {x:left*2,y:top,stride,height,pixels:regionPixels.subarray(0,stride*height)};
}
function compressLz4(input){
 compressionTable.fill(-1);
 let anchor=0,pos=0,written=0;
 const wordAt=i=>input[i]|input[i+1]<<8|input[i+2]<<16|input[i+3]<<24;
 const writeLength=length=>{
  while(length>=255){compressionBuffer[written++]=255;length-=255;}
  compressionBuffer[written++]=length;
 };
 while(pos+12<=input.length){
  const word=wordAt(pos);
  const slot=Math.imul(word,2654435761)>>>16;
  const match=compressionTable[slot];
  compressionTable[slot]=pos;
  if(match<0||wordAt(match)!==word){pos++;continue;}
  let matchLength=4;
  while(pos+matchLength<input.length-5&&input[match+matchLength]===input[pos+matchLength])matchLength++;
  const literals=pos-anchor,encodedMatch=matchLength-4;
  compressionBuffer[written++]=Math.min(literals,15)<<4|Math.min(encodedMatch,15);
  if(literals>=15)writeLength(literals-15);
  compressionBuffer.set(input.subarray(anchor,pos),written);
  written+=literals;
  const distance=pos-match;
  compressionBuffer[written++]=distance&255;
  compressionBuffer[written++]=distance>>>8;
  if(encodedMatch>=15)writeLength(encodedMatch-15);
  pos+=matchLength;
  anchor=pos;
 }
 const remaining=input.length-anchor;
 compressionBuffer[written++]=Math.min(remaining,15)<<4;
 if(remaining>=15)writeLength(remaining-15);
 compressionBuffer.set(input.subarray(anchor),written);
 return compressionBuffer.subarray(0,written+remaining);
}
async function sendGlass({x,y,stride,height,pixels}){
 frameId=(frameId+1)>>>0;
 const id=frameId;
 const compressed=compressLz4(pixels),packet=new Uint8Array(19+compressed.length),header=new DataView(packet.buffer);
 packet[0]=1;header.setUint32(1,id);header.setUint16(5,DISPLAY_X+x);header.setUint16(7,DISPLAY_Y+y);
 header.setUint16(9,stride*2);header.setUint16(11,height);header.setUint16(13,stride);
 header.setUint32(15,pixels.length);packet.set(compressed,19);
 const code=await exchange(VIDEO_CHANNEL,packet,VIDEO_ACK_CHANNEL,data=>
  data.length===6&&data[0]===1&&new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(1)===id?data[5]:undefined);
 if(code!==0)throw Error('안경 영상 표시 오류 '+code);
}
async function displayFrame(region){
 const revision=connectionRevision;
 sending=true;
 try{
  await sendGlass(region);
  if(revision!==connectionRevision)return;
  [displayedFrame,capturedFrame]=[capturedFrame,displayedFrame];
  if(!hasDisplayedFrame)status.textContent='안경 화면 표시 중 · START로 시작';
  hasDisplayedFrame=true;
  displayFailure='';
 }
 catch(error){
  if(revision!==connectionRevision)return;
  hasDisplayedFrame=false;
  const message=error.message||error.code;
  if(message!==displayFailure){displayFailure=message;status.textContent='안경 화면 전송 실패 · '+message;console.warn('MEGADRIVE_DISPLAY',message);}
 }finally{sending=false;}
}
function frame(){
 if(!running)return;
 videoLoop=requestAnimationFrame(frame);
 if(!ready||sending||!captureFrame())return;
 const region=frameRegion();
 if(region)void displayFrame(region);
}
const romName='Street Fighter II Plus.md';
const keys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',start:'Enter',mode:'KeyZ',a:'KeyA',b:'KeyS',c:'KeyD',x:'KeyQ',y:'KeyW',z:'KeyE'};

async function startGame(){
 await loadCore();
 const response=await fetch(new URL('./assets/street-fighter-ii-plus.md',import.meta.url));
 if(!response.ok)throw Error('내장 ROM을 읽지 못했습니다.');
 const rom=await response.arrayBuffer();
 const started=new Promise(resolve=>{
  window.embedGenesis({container:'glowMegaDriveCore',name:romName,rom,soundEnabled:true,showMobileControls:false,player1:keys,cbStarted:resolve});
 });
 let timeout;
 try{
  await Promise.race([started,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('게임 시작 응답이 없습니다.')),10000);})]);
 }finally{clearTimeout(timeout);}
 if(!window.GENESIS_PICO_GET_VIDEO_BUFFER)throw Error('게임 영상이 준비되지 않았습니다.');
 currentRom=romName;
 await restoreState();
 if(gm.isActive())activateGame();
 else pauseGame();
}

function sendKey(code,pressed){
 document.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,key:code,bubbles:true}));
}
const pressedButtons=new Map();
const dpad=root.querySelector('.dpad');
let directionPointer;
let directionKeys=[];
function setDirection(next){
 for(const key of directionKeys)if(!next.includes(key))sendKey(key,false);
 for(const key of next)if(!directionKeys.includes(key))sendKey(key,true);
 directionKeys=next;
 for(const button of dpad.querySelectorAll('[data-key]'))button.classList.toggle('pressed',next.includes(button.dataset.key));
}
function moveDirection(event){
 if(event.pointerId!==directionPointer)return;
 const rect=dpad.getBoundingClientRect();
 const x=(event.clientX-rect.left)/rect.width-.5;
 const y=(event.clientY-rect.top)/rect.height-.5;
 const next=[];
 if(Math.abs(x)>.16)next.push(x<0?keys.left:keys.right);
 if(Math.abs(y)>.16)next.push(y<0?keys.up:keys.down);
 setDirection(next);
}
function resumeSound(){
 const audio=window.GENESIS_AUDIO_CONTEXT;
 if(audio&&audio.state!=='running')void audio.resume().catch(()=>{});
}
dpad.addEventListener('pointerdown',event=>{
 if(!running||event.button!==0||directionPointer!==undefined)return;
 event.preventDefault();
 dpad.setPointerCapture(event.pointerId);
 directionPointer=event.pointerId;
 resumeSound();
 moveDirection(event);
});
dpad.addEventListener('pointermove',moveDirection);
dpad.addEventListener('contextmenu',event=>event.preventDefault());
for(const type of ['pointerup','pointercancel','lostpointercapture'])dpad.addEventListener(type,event=>{
 if(event.pointerId!==directionPointer)return;
 directionPointer=undefined;
 setDirection([]);
});
function release(pointerId){
 const button=pressedButtons.get(pointerId);
 if(!button)return;
 pressedButtons.delete(pointerId);
 if([...pressedButtons.values()].includes(button))return;
 button.classList.remove('pressed');
 sendKey(button.dataset.key,false);
}
function releaseAll(){
 for(const id of pressedButtons.keys())release(id);
 directionPointer=undefined;
 setDirection([]);
}

root.querySelectorAll('.actions [data-key], .system [data-key]').forEach(button=>{
 button.addEventListener('pointerdown',event=>{
  if(!running||event.button!==0)return;
  event.preventDefault();
  button.setPointerCapture(event.pointerId);
  pressedButtons.set(event.pointerId,button);
  button.classList.add('pressed');
  resumeSound();
  sendKey(button.dataset.key,true);
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>release(event.pointerId));
 button.addEventListener('contextmenu',event=>event.preventDefault());
});
window.addEventListener('blur',releaseAll);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});

async function exchange(channel,packet,replyChannel,parse){
 let off,timer;
 const response=new Promise((resolve,reject)=>{
  off=gm.plugin.onMessage(({channel,data})=>{
   if(channel!==replyChannel)return;
   const code=parse(data);
   if(code!==undefined)resolve(code);
  });
  timer=setTimeout(()=>reject(Error('안경 응답 없음 (채널 '+replyChannel+')')),3500);
 });
 try{
  const [code]=await Promise.all([response,gm.sendDisplayMessage(channel,packet)]);
  return code;
 }finally{clearTimeout(timer);off?.();}
}
async function loadCore(){
 const container=document.createElement('div');
 container.id='glowMegaDriveCore';
 container.setAttribute('aria-hidden','true');
 document.body.append(container);
 const script=document.createElement('script');
 script.src=new URL('./core/Genesis.min.js',import.meta.url);
 await new Promise((resolve,reject)=>{
  script.onload=resolve;
  script.onerror=()=>reject(Error('Genesis 코어를 불러오지 못했습니다.'));
  document.head.append(script);
 });
 // The core resumes on window focus. Keep it paused when another GLOW view is active.
 window.addEventListener('focus',()=>{if(!gm.isActive())pauseGame();});
}

const blankRows=new Uint8Array(15000);
const blankLz4=encodeBytes(compressLz4(blankRows));
async function connectGlass(){
 const revision=++connectionRevision;
 ready=false;
 hasDisplayedFrame=false;
 displayFailure='';
 status.textContent='안경 게임 화면 준비 중…';
 try{
  await gm.ready();
  if(revision!==connectionRevision)return;
  // A complete black frame clears the GLOW menu and finishes any interrupted
  // frame before switching to the existing fast-frame channel.
  const id=++displayFrameId;
  await gm.display.beginFrame({frameId:id,tileCount:7});
  for(let tileIndex=0;tileIndex<7;tileIndex++){
   if(revision!==connectionRevision)return;
   await gm.display.updateFrameImageLz4({
    frameId:id,tileIndex,x:0,y:tileIndex*50,width:600,height:50,
    stride:300,decodedSize:blankRows.length,dataBase64:blankLz4
   });
  }
  if(revision===connectionRevision)ready=true;
 }catch(error){
  if(revision!==connectionRevision)return;
  displayFailure=error.message||error.code;
  status.textContent='안경 연결 실패 · '+displayFailure;
 }
}

function activateGame(){
 if(running||!currentRom)return;
 running=true;
 if(window.GENESIS_GAME_PAUSED){
  window.GENESIS_GAME_PAUSED=false;
  window.GENESIS_NEXT_AUDIO_TIME=0;
  window.GENESIS_AUDIO_START_TIME=null;
  window.GENESIS_LAST_FRAME_TIME=performance.now();
  window.GENESIS_FRAME_ACCUMULATOR=0;
  window.runFrameGenesis(performance.now());
 }
 saveTimer=setInterval(()=>void saveState(),5000);
 videoLoop=requestAnimationFrame(frame);
 void connectGlass();
}
function pauseGame(){
 ++connectionRevision;
 ready=false;
 hasDisplayedFrame=false;
 running=false;
 cancelAnimationFrame(videoLoop);
 clearInterval(saveTimer);
 releaseAll();
 if(!window.GENESIS_GAME_BOOTED)return;
 window.GENESIS_GAME_PAUSED=true;
 cancelAnimationFrame(window.GENESIS_ANIM_FRAME_ID);
 window.GENESIS_ANIM_FRAME_ID=null;
 void window.GENESIS_AUDIO_CONTEXT?.suspend().catch(()=>{});
 void saveState();
}
gm.on('runtime.lifecycleChanged',({state})=>{
 if(state==='running')activateGame();
 else pauseGame();
});
gm.device.onConnection(({connected})=>{if(connected&&running)void connectGlass();});
window.addEventListener('pagehide',pauseGame);
await startGame().catch(error=>{status.textContent='실행 실패 · '+error.message;});
}
