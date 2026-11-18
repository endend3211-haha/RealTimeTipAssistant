import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';

const gm = createGMPlugin();
const status = document.getElementById('status');
const source = document.getElementById('source');
const events = document.getElementById('events');
const entries = [];
document.getElementById('clear').onclick = () => {
  entries.length = 0;
  events.textContent = '';
};

try {
  gm.device.onButton(event => {
    entries.unshift(new Date().toLocaleTimeString() + ' · ' + source.value + '\n' + JSON.stringify(event));
    if (entries.length > 30) entries.pop();
    events.textContent = entries.join('\n\n');
  });
  await gm.ready();
  status.textContent = '버튼 이벤트 대기 중';
} catch (error) {
  status.textContent = 'MemoMind에서 플러그인을 열고 버튼 이벤트 권한을 확인하세요. ' + error.message;
}
