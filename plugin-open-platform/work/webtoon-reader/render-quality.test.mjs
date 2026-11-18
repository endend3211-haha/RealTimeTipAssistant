import test from 'node:test';import assert from 'node:assert/strict';
import {packLumaGray4} from '../../PhoneSDK/examples/webtoon-reader/frame-pipeline.mjs';
import {TransitionClock} from '../../PhoneSDK/examples/webtoon-reader/transition-clock.mjs';
import {DeckMotion,drawComicScene} from '../../PhoneSDK/examples/webtoon-reader/coverflow.mjs';
test('steady 16-step encoder retains brightness cap, black, adjacent nibbles and input pixels',()=>{
 const data=new Uint8ClampedArray([255,255,255,255,0,0,0,255,128,128,128,255,255,255,255,255]),before=data.slice();
 assert.deepEqual(packLumaGray4({data}),new Uint8Array([0xc0,0x6c]));assert.deepEqual(data,before);
 const ramp=new Uint8ClampedArray(256*4);for(let i=0;i<256;i++){ramp.fill(i,i*4,i*4+3);ramp[i*4+3]=255;}
 const p=packLumaGray4({data:ramp}),levels=new Set([...p].flatMap(x=>[x>>4,x&15]));assert.equal(levels.size,13);
});
test('idle pause cannot advance first transition frame; late ACKs keep intermediate poses',()=>{
 const clock=new TransitionClock(),motion=new DeckMotion();motion.retarget(1,7);assert.equal(clock.step(60000),16);motion.advance(16);assert.ok(motion.position<.05);
 for(let i=1;i<10;i++){const before=motion.position;motion.advance(clock.step(60000+i*500));assert.ok(motion.position-before<.35);}
 clock.reset();assert.equal(clock.step(120000),16);
});
function recordingContext(){const draws=[];const c={draws,globalAlpha:1,canvas:{ownerDocument:{createElement(){const child=recordingContext();return {width:600,height:350,getContext:()=>child};}}},drawImage(...args){draws.push({args,alpha:this.globalAlpha});},clearRect(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},fillRect(){},stroke(){},fillText(){}};return c;}
test('motion and rest use identical projection quality and composite deck opacity once',()=>{
 const capture=moving=>{const root=recordingContext(),children=[];root.canvas.ownerDocument.createElement=()=>{const child=recordingContext();children.push(child);return {width:600,height:350,getContext:()=>child};};drawComicScene(root,Array.from({length:7},()=>({})),Array.from({length:7},()=>({title:'작품'})),.37,0,moving);return {root,children};};
 const moving=capture(true),still=capture(false);assert.ok(moving.children.length>0);const columns=moving.children.flatMap(c=>c.draws);assert.ok(columns.length>300);
 for(const {args,alpha} of columns){assert.equal(args.length,9);assert.equal(args[5],Math.floor(args[5]));assert.equal(args[7],1);assert.equal(alpha,1);}
 assert.deepEqual(moving.children.map(c=>c.draws.map(d=>d.args.slice(1))),still.children.map(c=>c.draws.map(d=>d.args.slice(1))));
 assert.ok(moving.root.draws.every(d=>d.args.length===3));
});
