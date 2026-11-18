import { opusRecordingToOgg } from '../vendor/gm-plugin-web-sdk.esm.js';

const channel = 20051;

function base64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function createMessengerBridge(gm, request) {
  const hostId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    value => value.toString(16).padStart(2, '0')).join('');
  const delivered = new Map();
  let running = true;
  let deviceAvailable = true;
  let linkId;
  let revision = 0;
  let current;
  let lastVoiceSession;
  let audioIssue = '';

  function post(type, data = {}, route = '/host') {
    return request(route, { hostId, linkId, type, ...data });
  }

  function suspend() {
    revision++;
    delivered.clear();
    lastVoiceSession = undefined;
    if (current) {
      current.abort.abort();
      clearTimeout(current.timer);
      current = undefined;
    }
    if (linkId) void post('hostAway').catch(() => {});
    linkId = undefined;
  }

  function failVoice(job, stage, error) {
    if (current !== job) return;
    const code = error?.code || error?.name || 'UNKNOWN';
    const message = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 160);
    audioIssue = `음성 ${stage} 실패 [${code}]${message ? ' ' + message : ''}`;
    job.abort.abort();
    clearTimeout(job.timer);
    current = undefined;
    void post('voiceError', { session: job.session }).catch(() => {});
  }

  async function finishVoice(job) {
    if (current !== job || !job.capture || job.finishing) return;
    job.finishing = true;
    clearTimeout(job.timer);
    let stage = '녹음 종료';
    try {
      const result = await job.capture.stop();
      if (current !== job || job.abort.signal.aborted) return;
      stage = '녹음 변환';
      const blob = opusRecordingToOgg(result);
      const ogg = base64(new Uint8Array(await blob.arrayBuffer()));
      if (current === job && !job.abort.signal.aborted) {
        stage = '휴대폰 전달';
        await post('voiceData', { session: job.session, ogg }, '/voice');
      }
    } catch (error) {
      failVoice(job, stage, error);
    } finally {
      if (current === job) current = undefined;
    }
  }

  async function startVoice(session) {
    const job = { session, abort: new AbortController() };
    current = job;
    lastVoiceSession = session;
    audioIssue = '';
    let stage = '마이크 연결';
    try {
      const options = { signal: job.abort.signal, maxDurationMs: 15000 };
      try {
        job.capture = await gm.audio.openRecording({ ...options, pickupMode: 'frontFocus' });
      } catch (error) {
        if (error?.code !== 'INVALID_REQUEST' || current !== job || options.signal.aborted) throw error;
        job.capture = await gm.audio.openRecording(options);
      }
      if (current !== job || job.abort.signal.aborted) return;
      if (job.stopRequested) {
        void finishVoice(job);
      } else {
        job.timer = setTimeout(() => void finishVoice(job), 14000);
        stage = '연결 상태 전달';
        await post('voiceReady', { session });
      }
    } catch (error) {
      failVoice(job, stage, error);
    }
  }

  function syncVoice(next) {
    if (current && (current.session !== next.voiceSession || next.capture === 'idle')) {
      current.abort.abort();
      clearTimeout(current.timer);
      current = undefined;
    }
    if (next.capture === 'record' && next.voiceSession !== lastVoiceSession) {
      void startVoice(next.voiceSession);
    }
    if (next.capture === 'finish' && current && current.session === next.voiceSession) {
      current.stopRequested = true;
      void finishVoice(current);
    }
  }

  const offMessage = gm.plugin.onMessage(({ channel: source, data }) => {
    if (running && linkId && source === channel && (data.length === 66 || data.length === 67)) {
      void post('hostEvent', { data: base64(data) }).catch(() => {});
    }
  });
  const offLifecycle = gm.on('runtime.lifecycleChanged', ({ state }) => {
    running = state === 'running';
    if (!running) suspend();
  });
  const offConnection = gm.device.onConnection(({ connected }) => {
    if (typeof connected !== 'boolean') return;
    deviceAvailable = connected;
    if (!deviceAvailable) suspend();
  });

  return {
    audioIssue: () => audioIssue,
    async poll() {
      if (!running || !deviceAvailable) return null;
      const activeRevision = revision;
      const next = await request('/host', { hostId });
      if (!running || revision !== activeRevision) return null;
      if (linkId && linkId !== next.linkId) {
        current?.abort.abort();
        clearTimeout(current?.timer);
        current = undefined;
        lastVoiceSession = undefined;
        delivered.clear();
      }
      linkId = next.linkId;
      syncVoice(next);
      for (const { id, data } of next.packets) {
        if (!running || revision !== activeRevision) break;
        const key = next.linkId + ':' + id;
        if (!delivered.has(key)) {
          let sent = false;
          try {
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            sent = (await gm.plugin.sendMessage(channel, bytes)).sent === true;
          } catch {}
          delivered.set(key, sent);
          if (delivered.size > 32) delivered.delete(delivered.keys().next().value);
        }
        if (running && revision === activeRevision) {
          await post('hostAck', { id, linkId: next.linkId, sent: delivered.get(key) });
        }
      }
      return next;
    },
    networkLost() {
      suspend();
    },
    close() {
      running = false;
      suspend();
      offMessage();
      offLifecycle();
      offConnection();
    },
  };
}
