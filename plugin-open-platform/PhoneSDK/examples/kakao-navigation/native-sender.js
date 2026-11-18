// 글라스 전용 플러그인(com.mcnex.kakao-navigation-glass)으로 보내는 컴팩트 메시지 (v2).
// 페이로드 규격은 GlassSDK/examples/kakao_navigation/kakao_navigation.c 상단 주석과 동일합니다.
export const NAV_CHANNEL = 0x4E56;   // 20054 — manifest의 device.messaging scope와 같아야 합니다
const KIND = { arrow: 0, uturn: 1, arrive: 2, via: 2, message: 3 };
const enc = new TextEncoder();

// UTF-8 경계를 깨지 않고 maxBytes 이하로 자르기
function utf8Limit(str, maxBytes) {
  let out = '', used = 0;
  for (const ch of str || '') {
    const n = enc.encode(ch).length;
    if (used + n > maxBytes) break;
    out += ch; used += n;
  }
  return enc.encode(out);
}

// v2: [2, kind, angle(2), (len,bytes) x {dist, text, speed, remain, eta, clock}, npts, (i8 right, i8 forward) x npts]
export function encodeFrame(frame) {
  const m = frame.message !== undefined ? { kind: 'message', angle: 0 } : frame.maneuver;
  const angle = Math.round(m.angle || 0) & 0xFFFF;                 // int16 big-endian
  const out = [2, KIND[m.kind] ?? 0, angle >> 8, angle & 0xFF];
  const field = (s, max) => { const b = utf8Limit(s, max); out.push(b.length, ...b); };
  field(frame.distText, 16);
  field(frame.message ?? frame.text, 200);
  field(frame.speedText, 8); field(frame.remainText, 8); field(frame.etaText, 8); field(frame.clockText, 8);
  const pv = frame.message !== undefined ? [] : (frame.preview || []).slice(0, 8);
  out.push(pv.length);
  for (const [x, y] of pv) out.push(x & 0xFF, y & 0xFF);
  return Uint8Array.from(out);
}

// 전송 중 새 프레임이 오면 최신 하나만 이어서 보내고, 같은 내용은 건너뜁니다.
export function createNativeSender(gm, onError) {
  let busy = false, pending = null, lastKey = '';
  return async function push(frame) {
    const payload = encodeFrame(frame), key = payload.join(',');
    if (key === lastKey) return;
    if (busy) { pending = frame; return; }
    busy = true;
    try { lastKey = key; await gm.plugin.sendMessage(NAV_CHANNEL, payload); }
    catch (e) { lastKey = ''; onError?.(e); }
    finally { busy = false; if (pending) { const p = pending; pending = null; push(p); } }
  };
}

// 글라스에서 길게 눌러 종료하면 { 1, 1 }이 옵니다. (종료 메시지의 첫 바이트는 버전과 무관하게 1)
export const isExitMessage = (channel, data) => channel === NAV_CHANNEL && data?.length >= 2 && data[0] === 1 && data[1] === 1;
