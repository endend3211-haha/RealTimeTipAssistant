import { compressLz4 } from './lz4.mjs';
export const FAST_FRAME_CHANNEL=0x4d46, FAST_ACK_CHANNEL=0x4d47;
export function fastPacket(frameId,tile) {
 const compressed=compressLz4(tile.bytes),packet=new Uint8Array(19+compressed.length),view=new DataView(packet.buffer);
 if(tile.decodedSize>79800||packet.length>81901)throw Error('빠른 프레임 크기를 초과했습니다.');
 packet[0]=1;view.setUint32(1,frameId);view.setUint16(5,tile.x);view.setUint16(7,tile.y);view.setUint16(9,tile.width);view.setUint16(11,tile.height);view.setUint16(13,tile.stride);view.setUint32(15,tile.decodedSize);packet.set(compressed,19);return packet;
}
export class FastFrameLink {
 constructor(gm){this.gm=gm;this.jobs=new Map();this.off=gm.plugin.onMessage(({channel,data})=>{if(channel!==FAST_ACK_CHANNEL||data.length!==6||data[0]!==1)return;const frameId=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(1),job=this.jobs.get(frameId);if(!job)return;clearTimeout(job.timer);this.jobs.delete(frameId);data[5]===0?job.resolve():job.reject(Error('안경의 빠른 프레임 표시가 실패했습니다.'));});}
 async send(frameId,tile){const packet=fastPacket(frameId,tile);let job;const acknowledged=new Promise((resolve,reject)=>{job={resolve,reject,timer:setTimeout(()=>{this.jobs.delete(frameId);reject(Error('빠른 프레임 전송 확인 시간이 초과되었습니다.'));},5000)};this.jobs.set(frameId,job);});
  try{await Promise.all([acknowledged,this.gm.plugin.sendMessage(FAST_FRAME_CHANNEL,packet)]);return packet.length;}catch(error){clearTimeout(job.timer);this.jobs.delete(frameId);job.reject(error);throw error;}}
 cancel(){for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(Error('빠른 프레임 전송이 중단되었습니다.'));}this.jobs.clear();}
 close(){this.cancel();this.off?.();}
}
