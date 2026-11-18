import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFrame,sendFrame,createRelayClient} from '../../examples/naver-depth-relay/relay-core.mjs';
const frame=()=>({version:1,sequence:12,kind:'test',timestamp:Date.now(),expiresAt:Date.now()+60000,text:'테스트',distanceText:'100m',tiles:Array.from({length:4},(_,i)=>({x:20,y:30+i*68,width:560,height:68,stride:280,decodedSize:19040,dataBase64:'AAAA'}))});
test('validates geometry, order, expiry and frame identity',()=>{
 assert.equal(validateFrame(frame()).sequence,12);
 for(const mutate of [f=>f.tiles.pop(),f=>f.tiles[1].y=0,f=>f.sequence=-1,f=>f.expiresAt=0,f=>f.tiles[0].dataBase64='!']){
  const f=frame();mutate(f);assert.throws(()=>validateFrame(f));
 }
});
test('sends begin and every independent tile serially with bounded fields',async()=>{
 const calls=[];let active=0,maxActive=0;
 const gm={display:{beginFrame:async p=>calls.push(['begin',p]),updateFrameImageLz4:async p=>{
  active++;maxActive=Math.max(maxActive,active);await Promise.resolve();calls.push(['tile',p]);active--;
 }}};
 const f=frame();f.tiles[0].frameId=999;await sendFrame(gm,f);
 assert.equal(calls.length,5);assert.equal(calls[0][0],'begin');assert.equal(maxActive,1);
 assert.deepEqual(calls.slice(1).map(c=>c[1].tileIndex),[0,1,2,3]);assert.equal(calls[1][1].frameId,12);
});
test('authenticated poll forwards frame and reports final SDK acknowledgement',async()=>{
 let polled=false,ack;const calls=[];let delivered;
 const done=new Promise(r=>delivered=r);
 const client=createRelayClient({interval:1,gm:{display:{
  createPage:async()=>calls.push('page'),beginFrame:async()=>calls.push('begin'),
  updateFrameImageLz4:async p=>calls.push(p.tileIndex)
 }},fetchImpl:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(32));
  if(url.endsWith('/v1/ack')){ack=JSON.parse(options.body);return {ok:true,status:200};}
  if(polled)return {ok:true,status:204};polled=true;return {ok:true,status:200,json:async()=>frame()};
 },onFrame:()=>delivered()});
 await client.start('a'.repeat(32));await done;await client.stop();
 assert.deepEqual(calls,['page','begin',0,1,2,3]);assert.equal(ack.ok,true);assert.equal(ack.sequence,12);
});
test('device errors report failure rather than success and do not advance the image',async()=>{
 let ack,failed;const done=new Promise(r=>failed=r);
 const client=createRelayClient({interval:1,gm:{display:{createPage:async()=>{},beginFrame:async()=>{throw Error('not running');}}},
  fetchImpl:async(url,options)=>{
   if(url.endsWith('/v1/ack')){ack=JSON.parse(options.body);return {ok:true,status:200};}
   return {ok:true,status:200,json:async()=>frame()};
  },onState:s=>{if(s.includes('not running'))failed();}
 });
 await assert.rejects(()=>client.start('bad'));
 await client.start('b'.repeat(32));await done;await client.stop();assert.equal(ack.ok,false);assert.match(ack.error,/not running/);
});
