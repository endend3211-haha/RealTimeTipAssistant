import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('notification button delivers plain UTF-8 to custom GMP without Scene calls', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', addEventListener(name, fn) { this[name] = fn; } });
    return elements.get(id);
  };
  const sent = [];
  const gm = {
    ready: async () => {}, device: { subscribeEvents: async () => {} },
    display: { createPage() { throw new Error('custom GMP must not receive Scene ping'); }, updateText() { throw new Error('Scene unsupported'); } },
    plugin: { onMessage() {}, sendMessage: async (channel, data) => { sent.push({ channel, text: new TextDecoder().decode(data) }); } },
  };
  const source = (await readFile(new URL('../../examples/notification-reply/plugin.js', import.meta.url), 'utf8')).replace(/^import .*\n/, '');
  vm.runInNewContext(source, { createGMPlugin: () => gm, TextEncoder, TextDecoder, document: { getElementById: element }, Date, window: {} });
  await new Promise(resolve => setImmediate(resolve));
  element('app').value = '카카오톡'; element('sender').value = '김철수'; element('message').value = '오늘 회의 몇 시야?';
  element('notify').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, [{ channel: 20050, text: '카카오톡\n김철수\n오늘 회의 몇 시야?' }]);
  assert.equal(element('choose').disabled, false);
});
