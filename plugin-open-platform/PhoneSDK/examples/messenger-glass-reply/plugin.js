import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import {
  REPLY_CHANNEL,
  normalizeNotification,
  buildReplyRequest,
  encodeGlassMessage,
  decodeGlassesCommand,
} from './protocol.js';

import { MessengerInbox, textPages } from './inbox.js';
const inbox = new MessengerInbox();
const gm = createGMPlugin();
const $ = (id) => document.getElementById(id);
const state = {
  notification: null,
  nativeSpeechActive: false,
  voiceBusy: false,
  lifecycle: 'starting',
  selected: false,
  page: 0,
  draftPage: 0,
  reviewedDraft: null,
  sending: false,
};
const pendingHostRequests = new Map();
let hostRequestSequence = 0;
let commandChain = Promise.resolve();

const messengerFixture = {
  kakaotalk: { packageName: 'com.kakao.talk', app: '카카오톡' },
  line: { packageName: 'jp.naver.line.android', app: 'LINE' },
  telegram: { packageName: 'org.telegram.messenger', app: 'Telegram' },
  'muse-ai': { packageName: 'com.museai.asst.mobile', app: '뮤즈AI' },
};

function log(message) {
  $('log').textContent = `${new Date().toLocaleTimeString()} ${message}\n${$('log').textContent}`.slice(0, 10000);
}

function status(title, detail = '') {
  $('status').textContent = title;
  $('detail').textContent = detail;
  log(`${title}${detail ? ` — ${detail}` : ''}`);
}

function setMode(mode) {
  state.lifecycle = mode;
  $('mode').textContent = mode;
}

function setControls(hasNotification, selected = false) {
  state.selected = selected;
  inbox.pinned = selected;
  $('select').disabled = !hasNotification;
  $('voice').disabled = !selected;
  $('reply').disabled = !selected;
  $('send').disabled = !selected || !$('reply').value.trim();
  $('cancel').disabled = !selected;
}

async function sendGlassText(text) {
  if (!state.notification) return;
  await gm.plugin.sendMessage(REPLY_CHANNEL, encodeGlassMessage(state.notification, text));
}

async function showNotification(raw) {
  const notification = normalizeNotification(raw, raw.musePackageNames);
  if (!inbox.upsert(notification)) return;
  updateInboxSummary();
  if (state.notification && state.notification.key !== notification.key) return;
  await displayCurrent();
}

function updateInboxSummary() {
  $('inbox-count').textContent = String(inbox.items.size);
  const current = inbox.current;
  $('current-message').textContent = current ? current.app + ' · ' + current.sender + ' · ' + current.message : '메시지 대기 중';
}

async function moveMessage(delta) {
  if (state.selected) {
    if ($('reply').value.trim()) {
      const pages = textPages($('reply').value.trim());
      state.draftPage = Math.max(0, Math.min(pages.length - 1, state.draftPage + delta));
      await showDraft();
    }
    return;
  }
  const pages = textPages(state.notification?.message ?? '');
  const next = state.page + delta;
  if (next >= 0 && next < pages.length) { state.page = next; await showMessagePage(); }
  else { inbox.move(delta); await displayCurrent(); }
}

async function displayCurrent() {
  await cancelNativeSpeech();
  const notification = inbox.current;
  state.notification = notification;
  updateInboxSummary();
  if (!notification) { setControls(false, false); return; }
  $('reply').value = '';
  state.page = 0;
  setControls(notification.canReply, false);
  await showMessagePage();
  status(
    `안경 표시: ${notification.sender}`,
    notification.canReply ? '직접 답장 액션이 있습니다.' : '이 알림에는 RemoteInput 답장 액션이 없습니다.',
  );
}

async function showMessagePage() {
  const n = state.notification;
  const pages = textPages(n.message);
  const position = [...inbox.items.keys()].indexOf(n.key) + 1;
  await sendGlassText(n.app + ' · ' + n.sender + '\n메시지 ' + position + '/' + inbox.items.size + ' · 본문 ' + (state.page + 1) + '/' + pages.length + '\n' + pages[state.page] + '\n방향: 페이지/메시지 · 한번: 답장');
}

async function showDraft() {
  const text = $('reply').value.trim();
  const pages = textPages(text);
  await sendGlassText(state.notification.app + ' · ' + state.notification.sender + '\n답장 확인 ' + (state.draftPage + 1) + '/' + pages.length + '\n' + pages[state.draftPage] + '\n방향: 문장 확인 · 길게: 전송');
  // Sending is allowed only after the complete current draft reached the display.
  if (state.draftPage === pages.length - 1) state.reviewedDraft = text;
}

function hostAvailable() {
  return Boolean(window.MemoMessengerHost?.postMessage);
}

function hostRequest(type, payload = {}, timeoutMs = 5000) {
  if (!hostAvailable()) return Promise.reject(new Error('Android Host 브리지가 없습니다.'));
  const id = `m${Date.now().toString(36)}_${(++hostRequestSequence).toString(36)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingHostRequests.delete(id);
      reject(new Error('Android Host 응답 시간이 초과되었습니다.'));
    }, timeoutMs);
    pendingHostRequests.set(id, { resolve, reject, timer });
    window.MemoMessengerHost.postMessage(JSON.stringify({ id, type, ...payload }));
  });
}

async function cancelNativeSpeech() {
  if (!state.nativeSpeechActive || !hostAvailable()) return;
  state.nativeSpeechActive = false;
  await hostRequest('speech.cancel').catch(() => undefined);
}

async function startVoice() {
  if (!state.selected || !state.notification?.canReply) {
    status('음성 입력 불가', '답장 가능한 알림을 먼저 선택하세요.');
    return;
  }
  if (state.voiceBusy) return;
  state.voiceBusy = true;
  state.reviewedDraft = null;
  $('reply').value = '';
  try {
    if (!hostAvailable()) {
      status('Studio 음성 시뮬레이션', '인식된 답장 칸에 STT 결과를 입력하세요.');
      return;
    }
    const response = await hostRequest('speech.toggle', {
      key: state.notification.key,
      languageTag: 'ko-KR',
    });
    state.nativeSpeechActive = response.active === true;
    status(
      state.nativeSpeechActive ? '기기 내 음성 인식 중' : '음성 입력 종료 요청',
      state.nativeSpeechActive ? '다시 두 번 눌러 종료하세요.' : '인식 결과를 기다립니다.',
    );
  } catch (error) {
    state.nativeSpeechActive = false;
    await sendGlassText(`음성 입력 실패\n${error.message}`).catch(() => undefined);
    status('기기 내 음성 인식 실패', error.message);
  } finally {
    state.voiceBusy = false;
  }
}

async function sendReply() {
  try {
    if (state.sending) return;
    if (state.reviewedDraft !== $('reply').value.trim()) throw new Error('답장 문장을 끝까지 확인하세요. 방향 버튼으로 이동합니다.');
    if (!state.selected) throw new Error('먼저 답장을 선택하세요.');
    if (state.nativeSpeechActive) throw new Error('두 번 눌러 음성 인식을 완료한 뒤 전송하세요.');
    const request = buildReplyRequest(state.notification, $('reply').value);
    if (!state.notification.canReply) throw new Error('이 알림에는 RemoteInput 답장 액션이 없습니다.');
    state.sending = true;
    if (hostAvailable()) {
      await hostRequest('notification.reply', request);
      state.notification.canReply = false;
      setControls(false, false);
      await sendGlassText(`답장 요청 전달\n${request.text}`);
      status('답장 요청을 전달했습니다.', `${state.notification.app} · ${state.notification.sender}`);
    } else {
      state.notification.canReply = false;
      setControls(false, false);
      await sendGlassText(`Studio 전송 확인\n${request.text}`);
      status('Studio 전송 시뮬레이션 완료', '실제 발송은 Android Host의 RemoteInput 연결 시 동작합니다.');
    }
  } catch (error) {
    await sendGlassText(`전송 실패\n${error.message}`).catch(() => undefined);
    status('답장 전송 실패', error.message);
  } finally { state.sending = false; }
}

async function cancelReply() {
  await cancelNativeSpeech();
  if (hostAvailable()) await hostRequest('notification.deselect');
  state.reviewedDraft = null;
  $('reply').value = '';
  setControls(Boolean(state.notification?.canReply), false);
  await showMessagePage();
  status('답장을 취소했습니다.');
}

async function selectReply() {
  if (state.selected) return;
  if (!state.notification?.canReply) return status('답장할 수 없습니다.', '알림에 RemoteInput 액션이 없습니다.');
  if (hostAvailable()) await hostRequest('notification.select', { key: state.notification.key });
  state.reviewedDraft = null;
  setControls(true, true);
  await sendGlassText('답장 모드\n두 번: 음성 시작/완료\n길게: 보내기');
  status('답장 모드', '두 번 눌러 안경 마이크 음성 입력을 시작하세요.');
}

function handleHostMessage(event) {
  if (event.origin !== location.origin) return;
  let message;
  try {
    message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (!message || typeof message !== 'object') return;
  if (message.type === 'response') {
    const pending = pendingHostRequests.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingHostRequests.delete(message.id);
    if (message.ok) pending.resolve(message);
    else pending.reject(new Error(String(message.error ?? 'Android Host 요청 실패')));
    return;
  }
  if (message.type === 'notification.posted') {
    enqueue(() => showNotification(message.notification));
    return;
  }
  if (message.type === 'notification.removed') {
    enqueue(async () => {
      const isCurrent = message.key === state.notification?.key;
      inbox.remove(message.key);
      updateInboxSummary();
      if (!isCurrent) return;
      await cancelNativeSpeech();
      $('reply').value = '';
      setControls(false, false);
      status('알림이 만료되었습니다.', '새 메시지를 기다리세요.');
      await sendGlassText('알림 만료\n새 메시지 대기 중');
      state.notification = null;
      await displayCurrent();
    });
    return;
  }
  if (message.key !== state.notification?.key) return;
  if (message.type === 'speech.result') {
    state.nativeSpeechActive = false;
    if (!state.selected) return;
    const text = String(message.text ?? '').trim();
    if (text.length > 500) { state.reviewedDraft = null; status('답장 길이 초과', '짧게 다시 녹음하세요.'); return; }
    $('reply').value = text;
    $('send').disabled = !state.selected || !text;
    enqueue(async () => {
      state.draftPage = 0;
      state.reviewedDraft = null;
      await showDraft();
      status('기기 내 음성 인식 완료', text);
    });
  } else if (message.type === 'speech.error') {
    state.nativeSpeechActive = false;
    enqueue(async () => {
      await sendGlassText(`음성 인식 실패\n${message.message ?? ''}`);
      status('기기 내 음성 인식 실패', String(message.message ?? '알 수 없는 오류'));
    });
  }
}

function enqueue(operation) {
  commandChain = commandChain.then(operation, operation).catch((error) => {
    status('명령 처리 실패', error.message);
  });
  return commandChain;
}

async function handleCommand(command) {
  if (command === 'previous') return moveMessage(-1);
  if (command === 'next') return moveMessage(1);
  if (command === 'select') return selectReply();
  if (command === 'voice') return startVoice();
  if (command === 'send') return sendReply();
  if (command === 'cancel') return cancelReply();
}

async function init() {
  await gm.ready();
  window.addEventListener('message', handleHostMessage);
  setMode('준비됨');
  gm.plugin.onMessage(({ channel, data }) => {
    if (channel !== REPLY_CHANNEL) return;
    const decoded = decodeGlassesCommand(data, state.notification?.key);
    if (decoded) enqueue(() => handleCommand(decoded.command));
  });

  gm.on('runtime.lifecycleChanged', ({ state: lifecycle }) => {
    setMode(lifecycle);
    if (lifecycle !== 'running') enqueue(() => cancelNativeSpeech());
  });

  $('notify').addEventListener('click', () => {
    const fixture = messengerFixture[$('app').value];
    enqueue(() => showNotification({
      key: `studio-${Date.now()}`,
      ...fixture,
      sender: $('sender').value,
      message: $('message').value,
      canReply: $('canReply').checked,
      postedAt: Date.now(),
    }));
  });
  $('previous').addEventListener('click', () => enqueue(() => moveMessage(-1)));
  $('next').addEventListener('click', () => enqueue(() => moveMessage(1)));
  $('select').addEventListener('click', () => enqueue(selectReply));
  $('voice').addEventListener('click', () => enqueue(startVoice));
  $('send').addEventListener('click', () => enqueue(sendReply));
  $('cancel').addEventListener('click', () => enqueue(cancelReply));
  $('reply').addEventListener('input', () => enqueue(async () => { state.draftPage = 0; state.reviewedDraft = null; $('send').disabled = !state.selected || !$('reply').value.trim(); await showDraft(); }));
  setControls(false, false);
  status('준비되었습니다.', 'Studio 알림 시뮬레이터에서 메시지를 보내세요.');
}

init().catch((error) => {
  setMode('실패');
  status('초기화 실패', error.message);
});
