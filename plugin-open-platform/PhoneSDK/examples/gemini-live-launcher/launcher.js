
// gm_plugin.h: SINGLE=1, DOUBLE=2, LONG=3, VERY_LONG=4, RELEASE=5.
// Only explicit single clicks are accepted; missing/unknown values never launch.
export function isSingleClick(event) {
  return [1, 'single', 'single_click', 'SINGLE'].includes(event?.action);
}
export function isNod(event) {
  return event?.active !== false && event?.active !== 0 &&
    [1, 'nod', 'NOD'].includes(event?.gesture);
}
export function createLaunchGate(now = Date.now, cooldown = 3000) {
  let last = -Infinity;
  return () => {
    const current = now();
    if (current - last < cooldown) return false;
    last = current;
    return true;
  };
}


export const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8765';
export async function requestBridge({ token, health = false, answer = false, signal, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('수신기 앱의 32자리 연결 코드를 입력하세요.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 2500);
  try {
    const response = await fetchImpl(LOCAL_BRIDGE_URL + (answer ? '/answer' : health ? '/health' : '/launch-gemini'), {
      method: (health || answer) ? 'GET' : 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'X-Gemini-Token': token },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('수신기 응답 오류: HTTP ' + response.status);
    const result = await response.json();
    if (result.bridge !== 'memomind-gemini-v1' || result.ok !== true ||
        (!health && !answer && !['notification', 'activity_requested'].includes(result.delivery))) {
      throw new Error('올바른 Gemini 수신기 응답이 아닙니다.');
    }
    if (answer && (typeof result.text !== 'string' || [...result.text].length > 4000 ||
        !Number.isSafeInteger(result.sequence) || result.sequence < 0 ||
        typeof result.accessibility !== 'boolean')) throw new Error('답변 데이터 형식 오류');
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

// Conservative 22-column / 7-line pages for a 540x250 text area.
// Count Unicode code points so Korean and surrogate pairs are never split.
export function answerPages(text, columns = 22, rows = 7) {
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) throw new Error('Invalid page size');
  const lines = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    const chars = [...paragraph];
    if (!chars.length) lines.push('');
    for (let i = 0; i < chars.length; i += columns) lines.push(chars.slice(i, i + columns).join(''));
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows).join('\n'));
  return pages.length ? pages : [''];
}
