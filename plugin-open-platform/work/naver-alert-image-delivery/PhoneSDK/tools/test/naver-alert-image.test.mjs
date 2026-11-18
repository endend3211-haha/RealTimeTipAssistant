import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNotification,packGray4,NAVER_PACKAGE} from '../../examples/naver-alert-image/notification-core.mjs';
import {createImageSender} from '../../examples/naver-alert-image/image-sender.mjs';
const raw=(text,extra={})=>({packageName:NAVER_PACKAGE,postedAt:Date.now(),text,...extra});
test('only recent Naver notifications are accepted',()=>{
 assert.equal(parseNotification(raw('300m 앞 우회전',{packageName:'other'})),null);
 assert.equal(parseNotification(raw('우회전',{postedAt:Date.now()-61000})),null);
 assert.equal(parseNotification(raw('우회전',{postedAt:Date.now()+10000})),null);
});
test('maneuvers, metric distances, ambiguous guidance and unknown text',()=>{
 assert.equal(parseNotification(raw('300m 앞 우회전')).distText,'300 m');
 assert.equal(parseNotification(raw('1.2km 앞 좌회전')).maneuver.angle,-90);
 assert.equal(parseNotification(raw('200미터 앞 유턴')).maneuver.kind,'uturn');
 assert.equal(parseNotification(raw('직진')).distText,'거리 미제공');
 assert.ok(parseNotification(raw('300m 앞 우회전 후 좌회전')).message);
 assert.ok(parseNotification(raw('경로 재탐색 중')).message);
 assert.ok(parseNotification(raw('목적지 도착')).message);
 assert.ok(parseNotification(raw('안내 중')).message);
});
test('GRAY4 packs high/low nibbles and pads odd rows',()=>{
 assert.deepEqual([...packGray4(new Uint8Array([255,255,255,255,0,0,0,255]),2,1)],[240]);
 assert.deepEqual([...packGray4(new Uint8Array([255,255,255,255,255,255,255,255]),1,2)],[240,240]);
 assert.throws(()=>packGray4(new Uint8Array(4),2,1));
});
const pixels=new Uint8Array(76160);
test('raw image contract, metrics, successful duplicate suppression and retry',async()=>{
 let calls=0,fail=false;const reports=[];
 const sender=createImageSender({display:{updateImage:async p=>{
  calls++;assert.equal(Buffer.from(p.dataBase64,'base64').length,76160);
  assert.equal(p.stride,280);if(fail)throw Error('offline');
 }}},r=>reports.push(r));
 await sender.send(pixels,'off');assert.equal(calls,0);
 sender.setEnabled(true);await sender.send(pixels,'a');await sender.send(pixels,'a');
 assert.equal(calls,1);assert.equal(reports[0].sceneBytes,76170);
 fail=true;await sender.send(pixels,'b');fail=false;await sender.send(pixels,'b');
 assert.equal(calls,3);assert.equal(reports.at(-1).ok,true);
 await sender.send(pixels,'stale',Date.now()-1);assert.equal(calls,3);
});
test('keeps latest pending frame with one in flight',async()=>{
 let release;const calls=[];
 const sender=createImageSender({display:{updateImage:async p=>{
  calls.push(Buffer.from(p.dataBase64,'base64')[0]);
  if(calls.length===1)await new Promise(r=>{release=r;});
 }}});
 sender.setEnabled(true);
 const a=sender.send(pixels,'a');
 const b=sender.send(new Uint8Array(76160).fill(1),'b');
 const c=sender.send(new Uint8Array(76160).fill(2),'c');
 release();await Promise.all([a,b,c]);assert.deepEqual(calls,[0,2]);
});

