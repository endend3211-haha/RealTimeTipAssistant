import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { isSingleClick, isNod, createLaunchGate, requestBridge, answerPages } from './launcher.js';

const gm = createGMPlugin();
const $ = id => document.getElementById(id);
const gate = createLaunchGate();
let subscriptionId = null;
let stopped = false;
let ready = false;
let pending = null;
const listeners = [];
let answerPending = null;
let pollTimer = null;
let pageTimer = null;
let pages = [];
let page = 0;
let sequence = -1;
let answerToken = '';
let hudQueue = Promise.resolve();
function drawHud(params) {
  hudQueue = hudQueue.catch(() => {}).then(async () => {
    if (!stopped) await gm.display.updateText(params);
  }).catch(error => { if (!stopped) log('HUD 오류: ' + error.message); });
  return hudQueue;
}
function displayAnswer() {
  if (!pages.length || stopped) return;
  $('answer-preview').textContent = pages[page];
  $('answer-status').textContent = 'Gemini 답변 · ' + (page + 1) + '/' + pages.length;
  void drawHud({id:1,x:30,y:50,width:540,height:250,border:0,radius:0,
    text:'GEMINI ' + (page + 1) + '/' + pages.length + '\n' + pages[page]});
}
async function pollAnswer() {
  if (stopped) return;
  try {
    const token = $('token').value.trim();
    if (!ready || !$('mirror').checked || !/^[a-f0-9]{32}$/.test(token)) return;
    if (token !== answerToken) { sequence = -1; pages = []; answerToken = token; }
    answerPending = new AbortController();
    const result = await requestBridge({token,answer:true,signal:answerPending.signal});
    if (stopped || !$('mirror').checked || token !== $('token').value.trim()) return;
    if (!result.accessibility) {
      if (pages.length) { pages = []; $('answer-preview').textContent = ''; void hud('Answer reader off'); }
      $('answer-status').textContent = '수신기 앱에서 Gemini 답변 읽기 접근성 서비스를 켜세요.';
      return;
    }
    if (sequence !== result.sequence) {
      sequence = result.sequence;
      pages = result.text ? answerPages(result.text) : [];
      page = 0;
      if (pages.length) displayAnswer();
      else {
        $('answer-preview').textContent = '';
        $('answer-status').textContent = '새 Gemini 답변 대기 중';
        void hud('Waiting for answer');
      }
    }
  } catch {
    if (!stopped) $('answer-status').textContent = '답변 연결 대기 · 수신기 1.2.0과 연결 코드를 확인하세요.';
  } finally {
    answerPending = null;
    if (!stopped) pollTimer = setTimeout(pollAnswer, 1200);
  }
}
function log(message) {
  $('log').textContent = ('[' + new Date().toLocaleTimeString() + '] ' + message + '\n' + $('log').textContent).slice(0, 5000);
}
function status(message) { $('status').textContent = message; }
async function hud(text) {
  if (stopped) return;
  try {
    await drawHud({id:1,x:30,y:50,width:540,height:250,border:0,radius:0,text:'GEMINI\n' + text});
  } catch (error) { if (!stopped) log('HUD 오류: ' + error.message); }
}
async function launch(source, health = false) {
  if (!ready || stopped || pending || (!health && !gate())) return;
  const controller = new AbortController();
  pending = controller;
  status(health ? '수신기 연결 확인 중…' : '수신기에 호출 요청 중…');
  try {
    const result = await requestBridge({token:$('token').value.trim(), health, signal:controller.signal});
    if (stopped) return;
    if (health) {
      status('수신기 연결됨 · 글라스 입력 대기 중');
      void hud('Receiver connected\nSingle click or nod');
    } else if (result.delivery === 'notification') {
      status('수신 완료 · 휴대폰의 “Gemini 열기” 알림을 누르세요.');
      void hud('Request received\nTap phone notification');
    } else {
      status('앱 실행 요청됨 · 휴대폰에서 Gemini를 확인하세요.');
      void hud('Launch requested\nCheck your phone');
    }
    log(health ? '수신기 인증 및 연결 확인 완료' : source + ': ' + result.delivery);
  } catch (error) {
    if (!stopped) {
      status('수신기 연결 실패 · 앱의 수신 시작, 연결 코드, MemoMind 로컬 HTTP 허용 여부를 확인하세요.');
      log(error.message);
      void hud('Receiver unavailable\nCheck phone setup');
    }
  } finally { if (pending === controller) pending = null; }
}
async function init() {
  try {
    await gm.ready();
    if (stopped) return;
    listeners.push(gm.device.onButton(event => {
      if (isSingleClick(event)) void launch('단일 클릭');
    }));
    listeners.push(gm.device.onGesture(event => {
      if ($('nod').checked && isNod(event)) void launch('고개 끄덕임');
    }));
    const result = await gm.device.subscribeEvents(['button', 'imuGesture']);
    const id = result?.subscriptionId ?? null;
    if (stopped) {
      if (id !== null) { try { await gm.device.unsubscribeEvents(id); } catch {} }
      return;
    }
    subscriptionId = id;
    ready = true;
    for (const id of ['launch', 'check', 'reset']) $(id).disabled = false;
    status('수신기 연결 코드를 입력하고 연결을 확인하세요.');
    void hud('Set up phone receiver\nThen single click or nod');
    void pollAnswer();
    pageTimer = setInterval(() => {
      if ($('mirror').checked && $('auto-page').checked && pages.length > 1) {
        page = (page + 1) % pages.length;
        displayAnswer();
      }
    }, 8000);
  } catch (error) {
    if (!stopped) { status('초기화 실패 · 플러그인을 다시 실행하세요.'); log(error.message); }
    await cleanup();
  }
}
async function cleanup() {
  if (stopped) return;
  stopped = true;
  ready = false;
  pending?.abort();
  answerPending?.abort();
  clearTimeout(pollTimer);
  clearInterval(pageTimer);
  pages = [];
  $('answer-preview').textContent = '';
  $('token').value = '';
  for (const stop of listeners.splice(0)) stop();
  try {
    if (subscriptionId !== null) await gm.device.unsubscribeEvents(subscriptionId);
  } catch {} finally { subscriptionId = null; gm.close(); }
}
$('launch').addEventListener('click', () => { void launch('수동 호출'); });
$('check').addEventListener('click', () => { void launch('연결 확인', true); });
$('reset').addEventListener('click', () => {
  status('글라스 입력 대기 중');
  void hud('Ready\nSingle click or nod');
});
$('previous').addEventListener('click', () => { if (pages.length) { page = (page + pages.length - 1) % pages.length; displayAnswer(); } });
$('next').addEventListener('click', () => { if (pages.length) { page = (page + 1) % pages.length; displayAnswer(); } });
$('mirror').addEventListener('change', () => {
  if (!$('mirror').checked) {
    answerPending?.abort(); pages = []; sequence = -1;
    $('answer-preview').textContent = '';
    $('answer-status').textContent = '답변 표시 꺼짐';
    void hud('Answer display off');
  }
});
window.addEventListener('pagehide', () => { void cleanup(); });
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
void init();

