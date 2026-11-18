import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessengerInbox, textPages } from '../../examples/messenger-glass-reply/inbox.js';
import { normalizeNotification, buildReplyRequest, decodeGlassesCommand } from '../../examples/messenger-glass-reply/protocol.js';

test('LINE is identified by its package, not a spoofed label', () => {
  assert.equal(normalizeNotification({key:'line1', packageName:'jp.naver.line.android', sender:'민수', message:'안녕'}).messengerId, 'line');
  assert.throws(() => normalizeNotification({key:'x', packageName:'fake.app', app:'LINE', message:'안녕'}));
});
test('new apps and same-key updates cannot redirect a pinned draft', () => {
  const inbox = new MessengerInbox(3);
  inbox.upsert({key:'kakao', message:'A'}); inbox.pinned=true;
  inbox.upsert({key:'line', message:'B'});
  assert.equal(inbox.upsert({key:'kakao', message:'replaced'}), false);
  assert.equal(inbox.move(1).key, 'kakao');
  assert.equal(inbox.current.message, 'A');
  inbox.pinned=false; assert.equal(inbox.move(1).key, 'line');
});
test('bounded inbox retains selected message and expires removed drafts', () => {
  const inbox = new MessengerInbox(2); inbox.upsert({key:'a'}); inbox.pinned=true;
  inbox.upsert({key:'b'}); inbox.upsert({key:'c'});
  assert.deepEqual([...inbox.items.keys()], ['a','c']);
  inbox.remove('a'); assert.equal(inbox.current.key,'c'); assert.equal(inbox.pinned,false);
});
test('long Korean and emoji drafts survive paging and submission without truncation', () => {
  const text = '가😀'.repeat(160);
  assert.equal(textPages(text).join(''), text);
  assert.ok(textPages(text).every(page => Array.from(page).length <= 90));
  assert.equal(buildReplyRequest({key:'a'}, text).text, text);
  assert.throws(() => buildReplyRequest({key:'a'}, '가'.repeat(501)), /500/);
});
test('navigation commands require the displayed notification identity', () => {
  const packet = new Uint8Array(66); packet.set([2,6]); packet.set(new TextEncoder().encode('line'),2);
  assert.equal(decodeGlassesCommand(packet,'line').command,'next');
  assert.equal(decodeGlassesCommand(packet,'kakao'),null);
});
