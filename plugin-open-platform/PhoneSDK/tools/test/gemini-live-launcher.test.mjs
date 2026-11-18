import test from 'node:test';
import assert from 'node:assert/strict';
import { isSingleClick, isNod, createLaunchGate } from '../../examples/gemini-live-launcher/launcher.js';

test('only explicit single clicks launch; reserved actions and malformed events do not', () => {
  for (const action of [1, 'single', 'single_click', 'SINGLE']) assert.equal(isSingleClick({action}), true);
  for (const action of [undefined, 0, 2, 3, 4, 5, 6, 'long', 'long_press_exit', 'release']) {
    assert.equal(isSingleClick({action}), false);
  }
  assert.equal(isSingleClick(null), false);
});
test('nod activation launches but head raise, reset and unknown gestures do not', () => {
  assert.equal(isNod({gesture:1, active:1}), true);
  assert.equal(isNod({gesture:'nod', active:true}), true);
  for (const event of [null, {}, {gesture:1,active:0}, {gesture:'nod',active:false}, {gesture:'headRaise'}, {gesture:2}]) {
    assert.equal(isNod(event), false);
  }
});
test('button and nod share a cooldown and rearm at the boundary', () => {
  let now = 0;
  const accept = createLaunchGate(() => now);
  assert.equal(accept(), true);
  assert.equal(accept(), false);
  now = 2999;
  assert.equal(accept(), false);
  now = 3000;
  assert.equal(accept(), true);
});

import { requestBridge } from '../../examples/gemini-live-launcher/launcher.js';
import { readFile } from 'node:fs/promises';
const token = '0123456789abcdef0123456789abcdef';
test('loopback launch uses authenticated POST and validates acknowledgement', async () => {
  const result = await requestBridge({token, fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/launch-gemini');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Gemini-Token'], token);
    assert.equal(options.credentials, 'omit');
    return Response.json({ok:true, bridge:'memomind-gemini-v1', delivery:'notification'});
  }});
  assert.equal(result.delivery, 'notification');
});
test('health check never uses launch endpoint', async () => {
  await requestBridge({token, health:true, fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/health');
    assert.equal(options.method, 'GET');
    return Response.json({ok:true, bridge:'memomind-gemini-v1'});
  }});
});
test('invalid token sends no network traffic', async () => {
  await assert.rejects(requestBridge({token:'bad',fetchImpl:()=>assert.fail('must not fetch')}), /32/);
});
test('HTTP failure and invalid acknowledgements are not reported as success', async () => {
  for (const response of [
    new Response('', {status:403}),
    new Response('', {status:409}),
    Response.json({ok:true}),
    Response.json({ok:true,bridge:'memomind-gemini-v1',delivery:'listening'}),
  ]) await assert.rejects(requestBridge({token,fetchImpl:async()=>response}));
});
test('page cleanup can abort an in-flight request', async () => {
  const controller = new AbortController();
  const pending = requestBridge({token,signal:controller.signal,fetchImpl:async (url, options) =>
    new Promise((resolve,reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))});
  controller.abort();
  await assert.rejects(pending,/aborted/);
});
test('request timeout aborts a receiver that never responds', async () => {
  await assert.rejects(requestBridge({token,fetchImpl:async (url, options) =>
    new Promise((resolve,reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))))}),/timeout/);
});
test('web entry sources contain no external Intent navigation', async () => {
  for (const name of ['main.js','launcher.js','index.html']) {
    const source = await readFile(new URL('../../examples/gemini-live-launcher/' + name, import.meta.url),'utf8');
    assert.doesNotMatch(source, /intent:|googleapp:|window\.open|location\.(href|assign|replace)/i);
  }
});

import { answerPages } from '../../examples/gemini-live-launcher/launcher.js';
test('Korean and emoji answer pages fit HUD and preserve all characters', () => {
  const text = '가나다라마바사아자차카타파하😀'.repeat(50);
  const pages = answerPages(text);
  assert.ok(pages.length > 1);
  for (const page of pages) {
    assert.ok(page.split('\n').length <= 7);
    for (const line of page.split('\n')) assert.ok([...line].length <= 22);
  }
  assert.equal(pages.join('').replaceAll('\n',''), text);
});
test('answer endpoint is authenticated read-only GET with strict validation', async () => {
  const result = await requestBridge({token,answer:true,fetchImpl:async (url,options) => {
    assert.equal(url,'http://127.0.0.1:8765/answer');
    assert.equal(options.method,'GET');
    assert.equal(options.headers['X-Gemini-Token'],token);
    return Response.json({ok:true,bridge:'memomind-gemini-v1',sequence:1,text:'테스트 답변',accessibility:true});
  }});
  assert.equal(result.text,'테스트 답변');
  for (const invalid of [{sequence:-1,text:'a',accessibility:true},{sequence:1,text:5,accessibility:true},
    {sequence:1,text:'a'.repeat(4001),accessibility:true}]) {
    await assert.rejects(requestBridge({token,answer:true,fetchImpl:async() =>
      Response.json({ok:true,bridge:'memomind-gemini-v1',...invalid})}));
  }
});
