import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createMessengerBridge } from '../../examples/memo-messenger-companion/host-link.js';

test('the phone page permits Gecko audio relay only on loopback and keeps scripts package-local', async () => {
  const html = await readFile(new URL('../../examples/memo-messenger-companion/index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src http:\/\/127\.0\.0\.1:18769 ws:\/\/127\.0\.0\.1:\*;/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});

function fixture(openRecording) {
  const actions = [];
  const sends = [];
  const snapshot = { linkId: 'relay-1', packets: [], voiceSession: 1, capture: 'idle' };
  let lifecycle;
  let message;
  const gm = {
    on(_event, callback) { lifecycle = callback; return () => {}; },
    device: { onConnection() { return () => {}; } },
    plugin: {
      onMessage(callback) { message = callback; return () => {}; },
      async sendMessage(channel, data) {
        sends.push({ channel, data: [...data] });
        return { sent: true };
      },
    },
    audio: { openRecording },
  };
  const bridge = createMessengerBridge(gm, async (route, body) => {
    if (!body.type) return { ...snapshot };
    actions.push({ route, ...body });
  });
  return { bridge, actions, sends, snapshot, lifecycle, message };
}

test('official bridge delivers each queued card once and relays glasses events', async t => {
  const f = fixture();
  t.after(() => f.bridge.close());
  f.snapshot.packets = [{ id: 1, data: 'AQID' }];
  await f.bridge.poll();
  await f.bridge.poll();
  assert.deepEqual(f.sends, [{ channel: 20051, data: [1, 2, 3] }]);
  assert.ok(f.actions.some(action => action.type === 'hostAck' && action.sent));
  f.message({ channel: 20051, data: new Uint8Array(66) });
  assert.ok(f.actions.some(action => action.type === 'hostEvent' && action.linkId === 'relay-1'));
  f.snapshot.linkId = 'relay-2';
  await f.bridge.poll();
  assert.equal(f.sends.length, 2);
});

test('busy voice capture fails once and never retries on its own', async t => {
  let opens = 0;
  const f = fixture(async () => {
    opens++;
    throw Object.assign(new Error('Another capture owns the microphone'), { code: 'AUDIO_BUSY' });
  });
  t.after(() => f.bridge.close());
  f.snapshot.capture = 'record';
  await f.bridge.poll();
  await f.bridge.poll();
  assert.equal(opens, 1);
  assert.equal(f.actions.filter(action => action.type === 'voiceError').length, 1);
  assert.match(f.bridge.audioIssue(), /마이크 연결 실패 \[AUDIO_BUSY\]/);
});

test('unsupported optional pickup setting retries once with host defaults', async t => {
  const attempts = [];
  const f = fixture(async options => {
    attempts.push(options.pickupMode);
    if (options.pickupMode) throw Object.assign(new Error('Unsupported pickup'), { code: 'INVALID_REQUEST' });
    return { stop: async () => {} };
  });
  t.after(() => f.bridge.close());
  f.snapshot.capture = 'record';
  await f.bridge.poll();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(attempts, ['frontFocus', undefined]);
  assert.ok(f.actions.some(action => action.type === 'voiceReady'));
  assert.equal(f.bridge.audioIssue(), '');
});

test('suspension aborts capture and releases the relay lease', async t => {
  let signal;
  const f = fixture(async options => {
    signal = options.signal;
    return { stop: async () => { throw new Error('unexpected stop'); } };
  });
  t.after(() => f.bridge.close());
  f.snapshot.capture = 'record';
  await f.bridge.poll();
  f.lifecycle({ state: 'suspended' });
  assert.equal(signal.aborted, true);
  assert.equal(await f.bridge.poll(), null);
  assert.ok(f.actions.some(action => action.type === 'hostAway'));
});

test('a finished recording goes only to the authenticated local relay', async t => {
  const f = fixture(async () => ({
    async stop() { return { data: Uint8Array.of(248, 255, 254), frameLengths: [3] }; },
  }));
  t.after(() => f.bridge.close());
  f.snapshot.capture = 'record';
  await f.bridge.poll();
  f.snapshot.capture = 'finish';
  await f.bridge.poll();
  await new Promise(resolve => setImmediate(resolve));
  const upload = f.actions.find(action => action.type === 'voiceData');
  assert.equal(upload.route, '/voice');
  assert.equal(atob(upload.ogg).slice(0, 4), 'OggS');
  assert.equal(upload.session, 1);
});

test('first run requests one local approval and starts the bridge when approved', async () => {
  const source = await readFile(new URL('../../examples/memo-messenger-companion/plugin.js', import.meta.url), 'utf8');
  const requests = [];
  const elements = new Map();
  let polls = 0;
  const context = vm.createContext({
    AbortSignal, Date, encodeURIComponent,
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { replaceChildren() {} });
      return elements.get(id);
    } },
    window: { addEventListener() {} },
    setInterval() {},
    createGMPlugin: () => ({ async ready() {}, storage: { async get() {}, async set() {} } }),
    createMessengerBridge: () => ({ async poll() { polls++; return { messages: [] }; }, networkLost() {} }),
    async fetch(url) {
      requests.push(new URL(url).pathname);
      return { ok: true, async json() {
        return url.includes('/request') ? { requestId: '1234', check: '1234' } : { approved: true, token: 'test' };
      } };
    },
  });
  await vm.runInContext('(async () => {' + source.replace(/^import .*;$/gm, '') + '})()', context);
  assert.deepEqual(requests, ['/pair/request', '/pair/result']);
  assert.equal(polls, 1);
});
