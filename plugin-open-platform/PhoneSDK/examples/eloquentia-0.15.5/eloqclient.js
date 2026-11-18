// Talks to Media Link 0.9.0+ on this phone (config + summary need 0.9.2; fact check, word finder, web check and OpenClaw memory need 0.9.3) (127.0.0.1:8795, /eloq/*). The token is pinned on first use by
// Media Link; "Reset Eloquentia link" on the Media Link screen clears it. Errors carry .status and .code.
export const BASE = 'http://127.0.0.1:8795';

export class EloqError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

export function createEloqClient({ token, fetchImpl = globalThis.fetch?.bind(globalThis), base = BASE, timeoutMs = 12000 } = {}) {
  async function call(method, path, body = null, { type = 'application/octet-stream', waitMs = timeoutMs } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = type;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), waitMs) : null;
    let r;
    try {
      r = await fetchImpl(`${base}${path}`, { method, headers, body, signal: ctl?.signal });
    } catch (e) {
      throw new EloqError(e?.name === 'AbortError' ? 'Media Link did not answer' : 'Memo 로컬 대화에서 연결 시작을 누르세요.', 0, 'OFFLINE');
    } finally { if (timer) clearTimeout(timer); }
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (!r.ok) {
      // Media Link errors look like {"ok":false,"code":"BUSY","error":"phone is behind"}
      const code = typeof j?.code === 'string' ? j.code : '';
      const msg = r.status === 401 ? 'Memo 로컬 대화의 연결 코드를 다시 복사하세요.'
        : (typeof j?.error === 'string' && j.error) || `HTTP ${r.status}`;
      throw new EloqError(msg, r.status, code);
    }
    return j || {};
  }
  return {
    health: () => call('GET', '/eloq/health'),
    // 0.9.6: mic = Media Link records the phone mic itself (keeps listening when this page is hidden)
    start: (mode, mic = false) => call('POST', `/eloq/start?mode=${encodeURIComponent(mode)}${mic ? '&mic=1' : ''}`),
    audio: (body) => call('POST', '/eloq/audio', body),
    state: (since) => call('GET', `/eloq/state?since=${Math.max(0, Number(since) || 0)}`),
    mode: (m) => call('POST', `/eloq/mode?m=${encodeURIComponent(m)}`),
    stop: () => call('POST', '/eloq/stop', null, { waitMs: 8000 }),
    // 0.9.2: notes go with every cue request; gate = smart timing (skip small talk)
    // 0.9.3 adds fact (flag wrong claims), word (word finder), web (check claims on the web, costs money),
    // recall (OpenClaw memory at Start) and save (summary + notes into OpenClaw memory). A switch left out keeps its Media Link value.
    config: ({ notes = '', gate = true, rate, style, about, ...sw } = {}) => {
      const body = { notes, gate: Boolean(gate) };
      if (typeof rate === 'string') body.rate = rate; // 0.9.6: calm / normal / max
      if (typeof style === 'string') body.style = style; // 0.9.8: character / plain (an older Media Link ignores it)
      if (typeof about === 'string') body.about = about; // 0.9.8: About me lines
      // live + tips: Media Link 0.9.5 (an older Media Link ignores them)
      for (const k of ['fact', 'word', 'web', 'recall', 'save', 'live', 'tips']) if (typeof sw[k] === 'boolean') body[k] = sw[k];
      return call('POST', '/eloq/config', JSON.stringify(body), { type: 'application/json' });
    },
    // 0.9.2: one summary of the session (Haiku, then Cerebras); the model call tries Haiku (30 s) then Cerebras (30 s)
    summary: () => call('POST', '/eloq/summary', null, { waitMs: 180000 }),
  };
}
