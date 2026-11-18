import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as protocol from '../../examples/messenger-glass-reply/protocol.js';
import { MessengerInbox, textPages } from '../../examples/messenger-glass-reply/inbox.js';

async function harness() {
  const elements = new Map(); const packets = []; const requests = [];
  const element = id => { if (!elements.has(id)) elements.set(id, {value:'', textContent:'', disabled:false, addEventListener(){}}); return elements.get(id); };
  let receive; const origin = 'https://memo-messenger.local';
  const context = vm.createContext({ ...protocol, MessengerInbox, textPages, console, setTimeout, clearTimeout,
    document:{getElementById:element}, location:{origin},
    window:{ addEventListener(type, handler) { receive=handler; }, MemoMessengerHost:{postMessage(raw) {
      const request=JSON.parse(raw); requests.push(request);
      queueMicrotask(() => receive({origin,data:{type:'response',id:request.id,ok:true,active:false}}));
    }}},
    createGMPlugin:() => ({ ready:async()=>{}, on(){}, plugin:{onMessage(){},sendMessage:async(channel,data)=>packets.push(data)}}),
  });
  let source=await readFile(new URL('../../examples/messenger-glass-reply/plugin.js',import.meta.url),'utf8');
  source=source.replace(/import[\s\S]*?from ['"][^'"]+['"];\s*/g,'');
  source=source.replace('init().catch', 'globalThis.initializing = init().catch');
  vm.runInContext(source,context); await context.initializing;
  return { context, element, requests, packets, run:expression=>vm.runInContext(expression,context), receive:message=>receive({origin,data:message}) };
}
const notice=(key,pkg='com.kakao.talk')=>({key,packageName:pkg,sender:'민수',message:'새 메시지',canReply:true});

test('actual controller pins recipient, requires complete review and sends exact text once', async()=>{
  const h=await harness(); h.context.first=notice('kakao'); h.context.second=notice('line','jp.naver.line.android');
  await h.run('showNotification(first)'); await h.run('selectReply()');
  await h.run('showNotification(second)');
  assert.equal(h.run('state.notification.key'),'kakao'); assert.equal(h.run('inbox.items.size'),2);
  h.element('reply').value='가'.repeat(220); await h.run('showDraft()');
  await h.run('sendReply()'); assert.equal(h.requests.filter(x=>x.type==='notification.reply').length,0);
  await h.run('moveMessage(1)'); await h.run('moveMessage(1)'); await h.run('sendReply()');
  const replies=h.requests.filter(x=>x.type==='notification.reply'); assert.equal(replies.length,1);
  assert.equal(replies[0].key,'kakao'); assert.equal(replies[0].text,'가'.repeat(220));
  await h.run('sendReply()'); assert.equal(h.requests.filter(x=>x.type==='notification.reply').length,1);
  await h.run('moveMessage(1)'); assert.equal(h.run('state.notification.key'),'line');
});
test('removal cancels the selected draft and advances to the next app', async()=>{
  const h=await harness(); h.context.first=notice('kakao'); h.context.second=notice('line','jp.naver.line.android');
  await h.run('showNotification(first)'); await h.run('showNotification(second)'); await h.run('selectReply()');
  h.receive({type:'notification.removed',key:'kakao'}); await h.run('commandChain');
  assert.equal(h.run('state.notification.key'),'line'); assert.equal(h.run('state.selected'),false);
  await h.run('sendReply()'); assert.equal(h.requests.filter(x=>x.type==='notification.reply').length,0);
});
