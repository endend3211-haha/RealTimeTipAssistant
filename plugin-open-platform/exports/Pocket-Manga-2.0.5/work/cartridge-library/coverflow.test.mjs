import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckMotion, coverflowPose, offsetFrom, projectDeck } from '../../PhoneSDK/examples/cartridge-library/coverflow.mjs';
import { compressLz4 } from '../../PhoneSDK/examples/cartridge-library/lz4.mjs';

test('focused deck fills 280 vertical pixels without clipping; neighbors recede and rotate', () => {
  const center = projectDeck(0), neighbor = projectDeck(1);
  assert.deepEqual(center.corners, [{ x: 184, y: 4 }, { x: 416, y: 4 }, { x: 416, y: 284 }, { x: 184, y: 284 }]);
  assert.ok(neighbor.depth < center.depth);
  assert.ok(neighbor.brightness < center.brightness);
  assert.notEqual(neighbor.corners[0].y, neighbor.corners[1].y);
  assert.ok(neighbor.corners[3].y - neighbor.corners[0].y < 280);
  for (let offset = -3.5; offset <= 3.5; offset += .05) {
    const p = projectDeck(offset).corners;
    for (const corner of p) assert.ok(Number.isFinite(corner.x) && Number.isFinite(corner.y));
    assert.ok(p[1].x > p[0].x);
  }
});
test('loop wraps over one deck instead of sliding across the entire collection', () => {
  const motion = new DeckMotion(); motion.reset(6); motion.retarget(0, 7);
  assert.equal(motion.target, 7);
  assert.equal(offsetFrom(0, 7, 7), 0);
  const positions = [];
  while (motion.active) positions.push(motion.advance(64));
  assert.ok(positions.length >= 7);
  assert.ok(positions.every((p, i) => i === 0 || p >= positions[i - 1]));
  assert.equal(motion.position, 7);
  motion.retarget(6, 7); assert.equal(motion.target, 6);
});
test('retargeting starts at the displayed pose; slow ACKs cannot skip the transition', () => {
  const motion = new DeckMotion(); motion.reset(2); motion.retarget(3, 7);
  motion.advance(64); const shown = motion.position;
  motion.retarget(4, 7); assert.equal(motion.position, shown); assert.equal(motion.from, shown);
  motion.advance(5000); assert.equal(motion.elapsed, 80); assert.ok(motion.position < motion.target);
  motion.retarget(5, 7, true); assert.equal(motion.position, 5); assert.equal(motion.active, false);
});
test('spring preserves velocity across rapid retargets and settles after a reversal', () => {
  const motion = new DeckMotion(); motion.reset(2); motion.retarget(3, 7);
  motion.advance(64); motion.advance(64);
  const velocity = motion.velocity, position = motion.position;
  assert.ok(velocity > 0);
  motion.retarget(4, 7);
  assert.equal(motion.velocity, velocity); assert.equal(motion.position, position);
  motion.retarget(2, 7);
  assert.equal(motion.velocity, velocity);
  let frames = 0;
  while (motion.active && frames++ < 100) motion.advance(frames % 2 ? 32 : 64);
  assert.ok(frames < 100); assert.equal(motion.position, 2); assert.equal(motion.velocity, 0);
});
test('perspective and lighting flatten gently as a deck reaches the center', () => {
  const center = projectDeck(0), near = projectDeck(.001);
  assert.ok(Math.abs(near.depth - center.depth) < .001);
  assert.ok(Math.abs(near.brightness - center.brightness) < .00001);
});
test('reference coverflow poses straighten, enlarge and move forward continuously at center', () => {
  const center = coverflowPose(0), side = coverflowPose(1), left = coverflowPose(-1);
  assert.equal(center.angle, 0); assert.equal(center.scale, 1);
  assert.equal(side.angle, Math.PI / 4); assert.equal(left.angle, -Math.PI / 4);
  assert.ok(center.depth > side.depth); assert.ok(center.scale > side.scale);
  assert.equal(coverflowPose(3.5).opacity, 0); assert.equal(coverflowPose(-3.5).opacity, 0);
  for (let offset = -.99; offset < .99; offset += .01) {
    const a = coverflowPose(offset), b = coverflowPose(offset + .001);
    assert.ok(Math.abs(a.angle - b.angle) < .003);
    assert.ok(Math.abs(a.scale - b.scale) < .001);
    assert.ok(Math.abs(a.depth - b.depth) < .3);
    assert.ok(Math.abs(a.centerX - b.centerX) < .3);
  }
});
function decompress(block, length) {
  const output = new Uint8Array(length); let at = 0, out = 0;
  function extra() { let sum = 0, next; do { next = block[at++]; sum += next; } while (next === 255); return sum; }
  while (at < block.length) {
    const token = block[at++]; let literals = token >> 4;
    if (literals === 15) literals += extra();
    output.set(block.subarray(at, at + literals), out); at += literals; out += literals;
    if (at === block.length) break;
    const offset = block[at++] | (block[at++] << 8); assert.ok(offset > 0 && offset <= out);
    let match = (token & 15) + 4; if ((token & 15) === 15) match += extra();
    for (let i = 0; i < match; i++) { output[out] = output[out - offset]; out++; }
  }
  assert.equal(out, length); return output;
}
test('SDK LZ4 adaptation round-trips full device tiles, including incompressible data', () => {
  let seed = 1;
  for (const bytes of [new Uint8Array(52500), Uint8Array.from({ length: 52500 }, (_, i) => (i % 31) * 7), Uint8Array.from({ length: 52500 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; })]) {
    const compressed = compressLz4(bytes);
    assert.ok(compressed.length + 24 < 81901);
    assert.deepEqual(decompress(compressed, bytes.length), bytes);
  }
});
