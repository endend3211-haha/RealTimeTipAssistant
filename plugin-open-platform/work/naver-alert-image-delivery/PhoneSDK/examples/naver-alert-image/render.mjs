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


