import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';

const gm = createGMPlugin();
const REPLY_CHANNEL = 20050;
const $ = (id) => document.getElementById(id);
const state = { page: false, notification: null, recording: null };
const log = (message) => { $('log').textContent = `${new Date().toLocaleTimeString()} ${message}\n${$('log').textContent}`; };
const setStatus = (message) => { $('status').textContent = message; log(message); };

function setReplyControls(enabled) { $('choose').disabled = !enabled; $('voice').disabled = !enabled; $('reply').disabled = !enabled; $('send').disabled = !enabled; }

async function showNotification(notification) {
  state.notification = notification;
  const text = `${notification.app}\n${notification.sender}\n${notification.message}`.slice(0, 900);
  // This paired GMP owns its LVGL screen; it does not implement gm.scene.
  // Send plain UTF-8 text, not JSON, matching its receiver.
  const payload = new TextEncoder().encode(text);
  await gm.plugin.sendMessage(REPLY_CHANNEL, payload);
  setReplyControls(true);
  setStatus(`안경에 표시됨: ${notification.sender}`);
}

function speechRecognition() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  return recognition;
}

async function voiceReply() {
  if (!state.notification) return setStatus('먼저 알림을 표시하세요.');
  const recognition = speechRecognition();
  if (recognition) {
    setStatus('안경 또는 휴대폰 마이크에서 말씀하세요…');
    recognition.onresult = (event) => { $('reply').value = event.results[0][0].transcript; setStatus(`“${$('reply').value}” 음성 인식 완료. 최종 보내기를 누르세요.`); };
    recognition.onerror = (event) => setStatus(`음성 인식 오류: ${event.error}`);
    recognition.start();
    return;
  }
  try {
    state.recording = await gm.audio.openRecording({ maxDurationMs: 8000, pickupMode: 'frontFocus', noiseReduction: true, codec: 'opus', sampleRate: 16000, channels: 1 });
    setStatus('안경 음성을 녹음 중입니다. 잠시 후 다시 눌러 정지하세요.');
  } catch (error) { setStatus(`오디오 캡처 실패: ${error.message}`); }
}

async function sendReply() {
  const reply = $('reply').value.trim();
  if (!state.notification || !reply) return setStatus('알림과 답장 내용을 확인하세요.');
  if (state.recording) { await state.recording.stop().catch(() => {}); state.recording = null; }
  const payload = new TextEncoder().encode(JSON.stringify({ type: 'notification.reply', notification: state.notification, text: reply }));
  try { await gm.plugin.sendMessage(REPLY_CHANNEL, new TextEncoder().encode(`답장 확인\n${reply}\n실제 Android 전송은 아직 연결되지 않았습니다.`)); setStatus('Studio 답장 표시 완료. 실제 메시지 발송 기능은 아직 연결되지 않았습니다.'); }
  catch (error) { setStatus(`답장 전송 실패: ${error.message}`); }
}

async function init() {
  await gm.ready();
  await gm.device.subscribeEvents(['connection']);
  gm.plugin.onMessage((message) => {
    if (message.channel !== REPLY_CHANNEL) return;
    try {
      if (message.data?.length === 2 && message.data[0] === 1) {
        const command = message.data[1];
        if (command === 1 && state.notification) $('choose').click();
        else if (command === 2 && state.notification) void voiceReply();
        else if (command === 3 && state.notification) void sendReply();
        else if (command === 4) setStatus('안경에서 답장을 취소했습니다.');
        return;
      }
      const event = JSON.parse(new TextDecoder().decode(message.data)); if (event.type === 'notification.posted') void showNotification(event.notification);
    }
    catch (error) { setStatus(`알림 이벤트 형식 오류: ${error.message}`); }
  });
  $('choose').addEventListener('click', () => { if (state.notification) { $('voice').disabled = false; $('reply').disabled = false; $('send').disabled = false; setStatus('답장 모드입니다. 안경 음성 입력을 누르고 말씀하세요.'); } });
  $('notify').addEventListener('click', () => showNotification({ app: $('app').value, sender: $('sender').value.trim(), message: $('message').value.trim() }).catch((e) => setStatus(e.message)));
  $('voice').addEventListener('click', () => voiceReply()); $('send').addEventListener('click', () => sendReply());
  setStatus('준비됨. Studio 알림 표시를 눌러 시작하세요.');
}
init().catch((error) => setStatus(`초기화 실패: ${error.message}`));
