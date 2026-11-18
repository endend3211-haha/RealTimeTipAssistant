export const BASE='http://127.0.0.1:18767';
export function validateFrame(frame,now=Date.now()){
 if(!frame||frame.version!==1||!Number.isSafeInteger(frame.sequence)||frame.sequence<1||frame.sequence>4294967295)throw Error('이미지 프레임 번호 오류');
 if(!['real','test','status'].includes(frame.kind))throw Error('알림 종류 오류');
 if(!Number.isFinite(frame.expiresAt)||!Number.isFinite(frame.timestamp))throw Error('이미지 시각 오류');
 if(frame.kind!=='status'&&frame.expiresAt<=now)throw Error('안내 이미지 만료');
 if(!Array.isArray(frame.tiles)||frame.tiles.length!==4)throw Error('이미지 타일 수 오류');
 frame.tiles.forEach((t,i)=>{
  if(t.x!==20||t.y!==30+i*68||t.width!==560||t.height!==68||t.stride!==280||t.decodedSize!==19040||
    typeof t.dataBase64!=='string'||t.dataBase64.length<4||t.dataBase64.length>109176||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(t.dataBase64))throw Error('이미지 타일 형식 오류');
 });
 return frame;
}
export async function sendFrame(gm,frame){
 await gm.display.beginFrame({frameId:frame.sequence,tileCount:4});
 for(let index=0;index<4;index++){const t=frame.tiles[index];await gm.display.updateFrameImageLz4({frameId:frame.sequence,tileIndex:index,x:t.x,y:t.y,width:t.width,height:t.height,stride:t.stride,decodedSize:t.decodedSize,dataBase64:t.dataBase64});}
}
export function createRelayClient({gm,fetchImpl=fetch,onState=()=>{},onFrame=()=>{},interval=350}){
 let running=false,token='',last=0,controller=null,worker=null,page=false,epoch=0;
 async function request(path,options={}){
  const local=new AbortController();controller=local;const timeout=setTimeout(()=>local.abort(),3500);
  try{return await fetchImpl(BASE+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},cache:'no-store',signal:local.signal});}
  finally{clearTimeout(timeout);if(controller===local)controller=null;}
 }
 async function loop(generation){
  while(running&&generation===epoch){
   try{
    const response=await request('/v1/frame?after='+last);
    if(!running||generation!==epoch)break;
    if(response.status===401)throw Error('연결 코드가 맞지 않습니다');
    if(response.status===204){onState('네이버 알림 이미지 대기');}
    else{
     if(!response.ok)throw Error('로컬 중계 HTTP '+response.status);
     const frame=validateFrame(await response.json());
     if(!page){await gm.display.createPage();page=true;}
     const start=performance.now();let ok=false,error='';
     try{await sendFrame(gm,frame);ok=true;}
     catch(e){error=e.message;page=false;throw e;}
     finally{
      if(running&&generation===epoch)await request('/v1/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence:frame.sequence,ok,error,ackMs:Math.round(performance.now()-start)})}).catch(()=>{});
     }
     last=frame.sequence;onFrame(frame,performance.now()-start);onState('공식 앱 연결로 글라스 전송 완료');
    }
   }catch(e){if(running&&generation===epoch)onState('중계 대기: '+e.message);}
   if(running&&generation===epoch)await new Promise(r=>setTimeout(r,interval));
  }
 }
 return {
  async start(code){
   if(!/^[a-f0-9]{32}$/.test(code))throw Error('APK에서 연결 코드를 다시 복사하세요');
   await this.stop();token=code;last=0;page=false;running=true;const generation=++epoch;
   worker=loop(generation);
  },
  async stop(){
   running=false;epoch++;controller?.abort();
   if(worker)await worker;worker=null;page=false;
  }
 };
}

