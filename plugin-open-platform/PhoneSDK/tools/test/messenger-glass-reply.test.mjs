import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_MESSENGERS,
  detectMessenger,
  normalizeNotification,
  formatGlassesNotification,
  buildReplyRequest,
  encodeGlassMessage,
  decodeGlassesCommand,
} from '../../examples/messenger-glass-reply/protocol.js';

test('카카오톡과 텔레그램은 알려진 Android 패키지로 식별한다', () => {
  assert.equal(detectMessenger('com.kakao.talk', '카카오톡').id, 'kakaotalk');
  assert.equal(detectMessenger('org.telegram.messenger', 'Telegram').id, 'telegram');
  assert.equal(detectMessenger('com.museai.asst.mobile', 'Other').id, 'muse-ai');
});

test('뮤즈AI는 패키지 미확정 상태라 앱 이름 또는 사용자 지정 패키지로 식별한다', () => {
  assert.equal(detectMessenger('unknown.package', '뮤즈AI').id, 'muse-ai');
  assert.equal(detectMessenger('com.company.muse', 'Other', ['com.company.muse']).id, 'muse-ai');
  assert.equal(detectMessenger('com.example.mail', '메일'), null);
});

test('알림은 허용 메신저·필수 문자열·답장 가능 여부를 정규화한다', () => {
  const notification = normalizeNotification({
    key: 'n-1',
    packageName: 'com.kakao.talk',
    app: '카카오톡',
    sender: '김철수',
    message: '회의가 몇 시야?',
    canReply: true,
    postedAt: 123,
  });
  assert.deepEqual(notification, {
    key: 'n-1', messengerId: 'kakaotalk', packageName: 'com.kakao.talk',
    app: '카카오톡', sender: '김철수', message: '회의가 몇 시야?',
    canReply: true, postedAt: 123,
  });
  assert.throws(() => normalizeNotification({ packageName: 'com.example.mail', app: '메일', sender: 'A', message: 'B' }), /지원하지 않는 메신저/);
});

test('글라스 표시 문자열은 메신저·발신자·본문·답장 가능 여부를 포함하고 UTF-8 900바이트 이하이다', () => {
  const text = formatGlassesNotification(normalizeNotification({
    key: 'n-2', packageName: 'org.telegram.messenger', app: 'Telegram',
    sender: 'Team', message: '가'.repeat(500), canReply: false,
  }));
  assert.match(text, /Telegram/);
  assert.match(text, /Team/);
  assert.match(text, /답장 불가/);
  assert.ok(new TextEncoder().encode(text).length <= 900);
  assert.doesNotMatch(text, /�/);
});

test('긴 앱명과 발신자도 상태 문구를 보존하며 전체 UTF-8 900바이트를 넘지 않는다', () => {
  const notification = {
    app: '앱'.repeat(600),
    sender: '😀'.repeat(600),
    message: '본문'.repeat(600),
    canReply: true,
  };
  const text = formatGlassesNotification(notification);
  assert.ok(new TextEncoder().encode(text).length <= 900);
  assert.match(text, /한번 눌러 답장$/);
  assert.doesNotMatch(text, /�/);
});

test('답장 요청은 알림 키와 텍스트만 전달하고 빈 답장은 거부한다', () => {
  const request = buildReplyRequest({ key: 'n-3', messengerId: 'telegram' }, ' 확인했습니다 ');
  assert.deepEqual(request, { type: 'notification.reply', key: 'n-3', messengerId: 'telegram', text: '확인했습니다' });
  assert.throws(() => buildReplyRequest({ key: 'n-3', messengerId: 'telegram' }, '  '), /답장 내용/);
});

test('글라스 표시 payload는 버전·작업 ID를 포함하고 전체 1024바이트 이하이다', () => {
  const notification = { key: 'notice-A', app: '카카오톡', sender: '김철수', message: '가'.repeat(500), canReply: true };
  const data = encodeGlassMessage(notification, '알림 내용');
  assert.equal(data[0], 2);
  assert.ok(data.length <= 1024);
  assert.equal(new TextDecoder().decode(data.slice(1, 65)).replace(/\0+$/u, ''), 'notice-A');
  assert.match(new TextDecoder().decode(data.slice(65)), /알림 내용/);
});

test('글라스 명령 프로토콜은 버전·작업 ID가 일치하는 알려진 명령만 허용한다', () => {
  const id = new TextEncoder().encode('notice-A');
  const command = new Uint8Array(66);
  command.set([2, 1], 0);
  command.set(id, 2);
  assert.deepEqual(decodeGlassesCommand(command, 'notice-A'), { command: 'select', notificationId: 'notice-A' });
  assert.equal(decodeGlassesCommand(command, 'notice-B'), null);
  command[1] = 9;
  assert.equal(decodeGlassesCommand(command, 'notice-A'), null);
  assert.equal(decodeGlassesCommand(new Uint8Array([2, 1]), 'notice-A'), null);
});

test('지원 목록은 카카오톡·텔레그램·LINE·뮤즈AI 네 종류다', () => {
  assert.deepEqual(SUPPORTED_MESSENGERS.map(({ id }) => id), ['kakaotalk', 'telegram', 'line', 'muse-ai']);
});
