import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { decks, wrap, relativePosition } from '../../PhoneSDK/examples/cartridge-library/decks.mjs';
import { DeckMotion, coverflowPose, offsetFrom, createDeckTextures, drawCoverflow } from '../../PhoneSDK/examples/cartridge-library/coverflow.mjs';
import { compressLz4 } from '../../PhoneSDK/examples/cartridge-library/lz4.mjs';
import { packGray4, changedTiles, FrameStats } from '../../PhoneSDK/examples/cartridge-library/frame-pipeline.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function element() {
  const result = { style: {}, dataset: {}, classList: { toggle() {} }, handlers: {}, attributes: {}, children: [], open: false,
    append(child) { this.children.push(child); }, setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener(k, v) { this.handlers[k] = v; }, showModal() { this.open = true; }, close() { this.open = false; } };
  let data = new Uint8ClampedArray(600 * 350 * 4), puts = 0, shade = 0;
  const context = { createLinearGradient: () => ({ addColorStop() {} }), fillRect(x,y,w,h) { if(w===600&&h===350) { shade=(shade+17)%255; for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=shade;data[i+3]=255;} } }, fillText() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, save() {}, restore() {}, stroke() {}, fill() {},
    getImageData(x, y, width, height) { return { data: data.slice(y * 600 * 4, (y + height) * 600 * 4), width, height }; },
    putImageData(image) { data = new Uint8ClampedArray(image.data); puts++; } };
  result.getContext = () => context; result.putCount = () => puts;
  result.querySelector = selector => (result.nodes ??= {})[selector] ??= element();
  return result;
}
test('phone mirror commits only after final tile ACK; input retargets without parallel sends', async () => {
  const nodes = new Map(), callbacks = {}, events = {}, timers = new Map(); let nextTimer = 0;
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const tabs = [element(), element()]; tabs[0].dataset.view = 'all'; tabs[1].dataset.view = 'favorites';
  const calls = []; let release, inFlight = 0, maximumInFlight = 0;
  const gm = { on(name, fn) { callbacks[name] = fn; }, ready: async () => {}, close() {},
    storage: { get: async () => ({}), set: async () => {} },
    device: { onGesture(fn) { callbacks.gesture = fn; }, onButton(fn) { callbacks.button = fn; }, onConnection(fn) { callbacks.connection = fn; }, subscribeEvents: async () => ({ subscriptionId: 'test' }), unsubscribeEvents: async () => {} },
    display: { createPage: async () => {}, beginFrame: async value => { calls.push(['begin', value]); },
      updateFrameImageLz4: async value => {
        calls.push(['tile', value]); inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight);
        try { if (value.tileIndex === 1) await new Promise(resolve => { release = resolve; }); }
        finally { inFlight--; }
      } } };
  const document = { documentElement: element(), getElementById: get, createElement: element, querySelectorAll: () => tabs, querySelector: get, addEventListener(k, v) { events[k] = v; } };
  const sandbox = { document, window: { innerWidth: 1200, matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener(k, v) { events[k] = v; } },
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 1000 }, console,
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
    btoa: binary => Buffer.from(binary, 'binary').toString('base64'), createGMPlugin: () => gm,
    decks, wrap, relativePosition, DeckMotion, coverflowPose, offsetFrom, createDeckTextures, drawCoverflow, compressLz4, packGray4, changedTiles, FrameStats };
  const context = vm.createContext(sandbox);
  const source = (await readFile(new URL('../../PhoneSDK/examples/cartridge-library/plugin.js', import.meta.url), 'utf8')).replace(/^import .+;\r?\n/gm, '');
  vm.runInContext(source, context);
  for (let i = 0; i < 8; i++) await tick();
  assert.deepEqual(calls.map(([kind]) => kind), ['begin', 'tile', 'tile']);
  const before = get('glass-framebuffer').putCount();
  callbacks.gesture({ gesture: 'right', active: true });
  assert.equal(vm.runInContext('state.focused', context), 3);
  assert.equal(vm.runInContext('motion.active', context), true, 'explicit smooth motion works even with system reduced-motion enabled');
  callbacks.button({ action: 'single' });
  assert.equal(vm.runInContext('state.selected', context), true);
  assert.equal(get('game-dialog').open, true);
  assert.equal(calls.length, 3); assert.equal(get('glass-framebuffer').putCount(), before);
  release(); await tick();
  assert.equal(get('glass-framebuffer').putCount(), before + 1);
  assert.match(get('mirror-status').textContent, /FRAME 1/);
  assert.equal(maximumInFlight, 1);
  assert.equal(calls[1][1].frameId, calls[2][1].frameId);
  assert.ok(calls[1][1].decodedSize <= 80000);
  assert.ok(timers.size > 0);
  // Start a second frame, disconnect while its final tile is pending, and
  // confirm a delayed ACK cannot overwrite the disconnected viewfinder.
  const runNext = [...timers.values()][0]; timers.clear(); runNext();
  for (let i = 0; i < 4; i++) await tick();
  const committed = get('glass-framebuffer').putCount();
  callbacks.connection({ connected: false });
  release(); await tick();
  assert.equal(get('glass-framebuffer').putCount(), committed);
  assert.match(get('mirror-status').textContent, /DISCONNECTED/);
  callbacks['runtime.lifecycleChanged']({ state: 'suspended' });
  assert.equal(timers.size, 0);
  callbacks.connection({ connected: false });
  assert.match(get('mirror-status').textContent, /DISCONNECTED/);
  events.pagehide();
});
