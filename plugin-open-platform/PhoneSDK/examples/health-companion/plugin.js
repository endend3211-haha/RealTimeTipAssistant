import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';

const gm = createGMPlugin();
const REQUEST_CHANNEL = 0x4647;
const REPLY_CHANNEL = 0x4648;
const HEALTH_UPDATE_ACTION = 'com.memomind.health.companion.HEALTH_UPDATE';
const $ = (id) => document.getElementById(id);
let connected = false;
let pluginReady = false;
let pendingAutomaticSend = false;

function setStatus(message, kind = '') {
  $('status').textContent = message;
  $('badge').className = `badge ${kind}`;
  $('badge').textContent = kind === 'ok' ? '전송됨' : kind === 'error' ? '오류' : connected ? '연결됨' : '대기';
}

function value(id, fallback) {
  const text = $(id).value.trim();
  return text || fallback;
}

function healthText() {
  return [
    'MEMOMIND HEALTH/1',
    '오늘의 건강 정보',
    `수면: ${value('sleep', '측정값 없음')}`,
    `심박수: ${value('heart', '측정값 없음')}`,
    `걸음 수: ${value('steps', '0')}`,
    `거리: ${value('distance', '0 m')}`,
    `칼로리: ${value('calories', '0 kcal')}`,
  ].join('\n');
}

async function sendHealth(automatic = false) {
  $('send').disabled = true;
  try {
    const payload = new TextEncoder().encode(healthText());
    await gm.plugin.sendMessage(REQUEST_CHANNEL, payload);
    setStatus(automatic ? '예약 건강 정보가 Glass 플러그인으로 자동 전송되었습니다.' : '건강 정보가 Glass 플러그인으로 전송되었습니다.', 'ok');
  } catch (error) {
    setStatus(`전송 실패: ${error.message}`, 'error');
  } finally {
    $('send').disabled = false;
  }
}

function applyHealthUpdate(data) {
  if (!data || typeof data !== 'object') return;
  const isBroadcast = data.action === HEALTH_UPDATE_ACTION || data.type === HEALTH_UPDATE_ACTION;
  if (!isBroadcast && data.type !== 'health.update') return;
  const source = data.extras || data;
  const metrics = data.metrics || {
    sleep: source.sleep,
    heartRate: source.heartRate,
    steps: source.steps,
    distance: source.distance,
    calories: source.calories,
  };
  if (metrics.sleep != null) $('sleep').value = String(metrics.sleep);
  if (metrics.heartRate != null) $('heart').value = String(metrics.heartRate);
  if (metrics.steps != null) $('steps').value = String(metrics.steps);
  if (metrics.distance != null) $('distance').value = String(metrics.distance);
  if (metrics.calories != null) $('calories').value = String(metrics.calories);
  const automatic = isBroadcast || data.type === 'health.update';
  setStatus(automatic ? '예약 건강 데이터가 반영되었습니다. 안경으로 전송 중…' : '네이티브 Health Connect 데이터가 반영되었습니다.');
  if (automatic) {
    pendingAutomaticSend = true;
    if (pluginReady) {
      pendingAutomaticSend = false;
      void sendHealth(true);
    }
  }
}

window.addEventListener('message', (event) => applyHealthUpdate(event.data));
window.__memoMindHealthUpdate = applyHealthUpdate;

async function init() {
  await gm.ready();
  await gm.device.subscribeEvents(['connection']);
  gm.plugin.onMessage(({ channel, data }) => {
    if (channel !== REPLY_CHANNEL) return;
    const reply = new TextDecoder().decode(data || new Uint8Array());
    setStatus(reply || 'Glass 플러그인에서 응답을 받았습니다.', 'ok');
  });
  $('send').addEventListener('click', () => void sendHealth());
  $('sample').addEventListener('click', () => {
    $('sleep').value = '7시간 20분'; $('heart').value = '72 bpm'; $('steps').value = '3,855';
    $('distance').value = '5,917.0 m'; $('calories').value = '1,198.4 kcal';
    setStatus('예제 건강 데이터를 입력했습니다.');
  });
  pluginReady = true;
  if (pendingAutomaticSend) {
    pendingAutomaticSend = false;
    void sendHealth(true);
  }
  setStatus('준비되었습니다.');
}

gm.device.onConnection?.((event) => {
  connected = Boolean(event.data?.connected ?? event.connected);
  $('connection').textContent = connected ? 'MemoMind Glass 연결됨' : '안경 연결 대기 중';
  setStatus(connected ? '전송할 건강 정보를 확인하세요.' : 'MemoMind Glass 연결을 확인하세요.');
});

init().catch((error) => setStatus(`초기화 실패: ${error.message}`, 'error'));
