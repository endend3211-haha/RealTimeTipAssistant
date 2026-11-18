export const IMAGE=Object.freeze({x:8,y:8,width:560,height:272,stride:280});
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function createImageSender(gm,report=()=>{}){
 let enabled=false,pending=null,worker=null,last='';
 async function drain(){
  while(enabled&&pending){
   const item=pending;pending=null;
   if(item.key===last||item.expiresAt<=Date.now())continue;
   const start=performance.now();
   try{
    await gm.display.updateImage({...IMAGE,dataBase64:base64(item.bytes)});last=item.key;
    report({ok:true,bytes:item.bytes.length,sceneBytes:item.bytes.length+10,base64Chars:Math.ceil(item.bytes.length/3)*4,ackMs:performance.now()-start});
   }catch(error){last='';report({ok:false,error});}
  }
 }
 return {
  idle(){return worker || Promise.resolve();}, setEnabled(value){enabled=Boolean(value);if(!enabled){pending=null;last='';}},
  send(bytes,key,expiresAt=Infinity){
   if(!(bytes instanceof Uint8Array)||bytes.length!==76160)return Promise.reject(Error('560×272 GRAY4 이미지가 필요합니다.'));
   if(!enabled)return Promise.resolve();
   pending={bytes:bytes.slice(),key,expiresAt};
   if(!worker)worker=drain().finally(()=>{worker=null;});
   return worker;
  }
 };
}

