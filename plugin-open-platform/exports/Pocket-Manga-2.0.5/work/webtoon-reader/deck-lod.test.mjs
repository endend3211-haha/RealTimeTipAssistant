import test from 'node:test';import assert from 'node:assert/strict';
import {buildDeckLod,coverTier,projectedTexture} from '../../PhoneSDK/examples/webtoon-reader/deck-lod.mjs';
import {DeckMotion} from '../../PhoneSDK/examples/webtoon-reader/coverflow.mjs';
test('front cover remains the original canvas; cached background covers shrink by depth',()=>{
 let reads=0;const document={createElement(){const c={getContext(){return {drawImage(){},getImageData(){reads++;return {data:new Uint8ClampedArray(c.width*c.height*4).fill(127)};},putImageData(){}};}};return c;}},full={width:232,height:280};
 const textures=buildDeckLod(document,full);assert.equal(textures.full,full);assert.equal(reads,3);
 assert.deepEqual(['full','approach','near','far'].map(k=>[textures[k].width,textures[k].height]),[[232,280],[116,140],[58,70],[29,35]]);
 for(let n=0;n<100;n++){assert.equal(projectedTexture(textures,0).texture,full);assert.equal(projectedTexture(textures,1).texture,textures.near);}
 assert.equal(reads,3);assert.equal(coverTier(.3),'full');assert.equal(coverTier(-.7),'approach');assert.equal(coverTier(-2),'far');
 assert.equal(projectedTexture(textures,0).columns,1);assert.equal(projectedTexture(textures,1).columns,3);assert.equal(projectedTexture(textures,2).columns,4);
});
test('subpixel settling stops ACK-bound tail frames without moving the last pose by a visible pixel',()=>{
 const motion=new DeckMotion({positionTolerance:.004,velocityTolerance:.05});motion.retarget(1,7);let frames=0,lastPosition=0;while(motion.active&&frames<50){lastPosition=motion.position;motion.advance(frames===0?16:64);frames++;}
 assert.equal(motion.position,1);assert.ok((1-lastPosition)*191<1);assert.ok(frames<=11);
});
