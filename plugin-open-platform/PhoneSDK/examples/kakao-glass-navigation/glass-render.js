// 글라스 HUD 렌더러: 캔버스에 그린 뒤 GRAY_4로 변환해 display.updateImage(Lz4)로 전송.
// 변환/압축 방식은 PhoneSDK/examples/weather 예제와 동일합니다.
const W = 560, H = 272, X = 8, Y = 8;

function drawArrow(ctx, cx, cy, angle) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle * Math.PI / 180);
  ctx.beginPath();
  [[0, -80], [55, -15], [20, -15], [20, 80], [-20, 80], [-20, -15], [-55, -15]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawUTurn(ctx, cx, cy) {
  ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = 22; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(32, 75); ctx.lineTo(32, -15); ctx.arc(0, -15, 32, 0, Math.PI, true); ctx.lineTo(-32, 25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-70, 20); ctx.lineTo(6, 20); ctx.lineTo(-32, 75); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawArrive(ctx, cx, cy) {
  ctx.save(); ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function wrap(ctx, text, maxW, maxLines) {
  const lines = []; let line = '';
  for (const ch of [...text]) {
    if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; if (lines.length === maxLines) break; } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

// frame: { maneuver: {kind, angle}, distText, text }  |  { message }
export function drawFrame(frame) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.textBaseline = 'alphabetic';

  if (frame.message) {                       // 안내 대기/재탐색/도착 등 한 줄 상태
    ctx.font = '700 40px sans-serif'; ctx.textAlign = 'center';
    wrap(ctx, frame.message, W - 60, 2).forEach((l, i) => ctx.fillText(l, W / 2, 120 + i * 52));
    return canvas;
  }
  const m = frame.maneuver;
  if (m.kind === 'uturn') drawUTurn(ctx, 110, 100);
  else if (m.kind === 'arrive' || m.kind === 'via') drawArrive(ctx, 110, 100);
  else drawArrow(ctx, 110, 100, m.angle);

  ctx.textAlign = 'left';
  let size = 88; ctx.font = `700 ${size}px sans-serif`;
  while (ctx.measureText(frame.distText).width > 290 && size > 40) { size -= 6; ctx.font = `700 ${size}px sans-serif`; }
  ctx.fillText(frame.distText, 230, 128);

  ctx.fillStyle = '#555'; ctx.fillRect(20, 190, W - 40, 2);          // 구분선
  ctx.fillStyle = '#ddd'; ctx.font = '26px sans-serif';
  wrap(ctx, frame.text || '', W - 40, 2).forEach((l, i) => ctx.fillText(l, 20, 224 + i * 34));
  return canvas;
}

function toGray4(canvas) {
  const img = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const px = new Uint8Array((W / 2) * H);
  const nib = (o) => Math.max(0, Math.min(15, Math.round((img[o] * 0.299 + img[o + 1] * 0.587 + img[o + 2] * 0.114) / 17)));
  for (let i = 0; i < img.length; i += 8) px[i / 8] = (nib(i) << 4) | nib(i + 4);
  return px;
}
const toBase64 = (bytes) => { let s = ''; for (let o = 0; o < bytes.length; o += 16384) s += String.fromCharCode(...bytes.subarray(o, o + 16384)); return btoa(s); };

function compressLz4(input) {
  const out = [], dict = new Int32Array(65536).fill(-1); let anchor = 0, pos = 0;
  const hash = (o) => (Math.imul((input[o] | input[o + 1] << 8 | input[o + 2] << 16 | input[o + 3] << 24) >>> 0, 2654435761) >>> 16) & 65535;
  const len = (n) => { while (n >= 255) { out.push(255); n -= 255; } out.push(n); };
  while (pos + 12 <= input.length) {
    const slot = hash(pos), match = dict[slot]; dict[slot] = pos;
    if (match < 0 || pos - match > 65535 || input[match] !== input[pos] || input[match + 1] !== input[pos + 1] || input[match + 2] !== input[pos + 2] || input[match + 3] !== input[pos + 3]) { pos++; continue; }
    let ml = 4; while (pos + ml < input.length - 5 && input[match + ml] === input[pos + ml]) ml++;
    const lit = pos - anchor, enc = ml - 4;
    out.push(Math.min(lit, 15) << 4 | Math.min(enc, 15)); if (lit >= 15) len(lit - 15);
    for (let i = anchor; i < pos; i++) out.push(input[i]);
    const d = pos - match; out.push(d & 255, d >>> 8); if (enc >= 15) len(enc - 15);
    pos += ml; anchor = pos;
  }
  const rem = input.length - anchor; out.push(Math.min(rem, 15) << 4); if (rem >= 15) len(rem - 15);
  for (let i = anchor; i < input.length; i++) out.push(input[i]);
  return Uint8Array.from(out);
}

// 전송 중에 새 프레임이 오면 최신 것 하나만 이어서 보냅니다 (브리지 적체 방지).
export function createGlassSender(gm, onError) {
  let busy = false, pending = null, lastKey = '';
  const geo = { x: X, y: Y, width: W, height: H, stride: W / 2 };
  async function send(frame) {
    const px = toGray4(drawFrame(frame)), lz = compressLz4(px);
    if (lz.length + 14 < px.length + 10) await gm.display.updateImageLz4({ ...geo, decodedSize: px.length, dataBase64: toBase64(lz) });
    else await gm.display.updateImage({ ...geo, dataBase64: toBase64(px) });
  }
  return async function push(frame) {
    const key = JSON.stringify(frame);
    if (key === lastKey) return;             // 변화 없으면 전송 생략
    if (busy) { pending = frame; return; }
    busy = true;
    try { lastKey = key; await send(frame); }
    catch (e) { lastKey = ''; onError?.(e); }
    finally { busy = false; if (pending) { const p = pending; pending = null; push(p); } }
  };
}
