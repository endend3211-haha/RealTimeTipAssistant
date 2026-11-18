import test from 'node:test';
import assert from 'node:assert/strict';
import { packGray4, changedTiles, FrameStats } from '../../PhoneSDK/examples/cartridge-library/frame-pipeline.mjs';
test('GRAY_4 packs bright/dark pixels in host nibble order', () => {
  assert.deepEqual(packGray4({ data: Uint8ClampedArray.from([255,255,255,255,0,0,0,255,34,34,34,255,170,170,170,255]) }), Uint8Array.of(0xf0,0x2a));
});
test('diff rectangles reconstruct exact snapshots and remain within decode limits', () => {
  const before = new Uint8Array(105000), after = before.slice();
  for(let y=4;y<284;y++) for(let x=35;x<265;x++) after[y*300+x]=(x+y)%256;
  const tiles = changedTiles(after,before);
  assert.equal(tiles.length,1); assert.equal(tiles[0].bytes.length,64400);
  const reconstructed = before.slice();
  for(const tile of tiles) {
    assert.ok(tile.decodedSize<=80000); assert.equal(tile.x%2,0);
    for(let row=0;row<tile.height;row++) reconstructed.set(tile.bytes.subarray(row*tile.stride,(row+1)*tile.stride),(tile.y+row)*300+tile.x/2);
  }
  assert.deepEqual(reconstructed,after);
  assert.equal(changedTiles(after,after).length,0);
  const full=changedTiles(after,undefined);
  assert.equal(full.length,2); assert.equal(full.reduce((n,t)=>n+t.decodedSize,0),105000);
});
test('single-pixel changes preserve the neighboring packed nibble', () => {
  const previous = new Uint8Array(105000).fill(0xa5), current=previous.slice(); current[174*300+299]=0xa8;
  const [tile]=changedTiles(current,previous);
  assert.deepEqual([tile.x,tile.y,tile.width,tile.height,tile.bytes[0]],[598,174,2,1,0xa8]);
});
test('statistics count acknowledged frames rather than the simulator refresh loop', () => {
  const stats=new FrameStats();
  for(let i=0;i<5;i++) stats.record({at:100+i*100,renderMs:8,encodeMs:12,transferMs:80,totalMs:100,bytes:10240});
  assert.match(stats.summary(),/5 ACK frames · 10.0 frames\/s/);
  assert.match(stats.summary(),/transfer 80 ms · p95 100 ms · 10.0 KiB/);
});
