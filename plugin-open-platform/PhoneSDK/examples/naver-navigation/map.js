// 타일 이미지 없이 캔버스로 그리는 간이 위치 지도 (북쪽이 위). 외부 요청 없음.
const KY = 110540, rad = (d) => d * Math.PI / 180;
const NICE = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

// state: { here:{lat,lng}|null, dest:{lat,lng,name}|null, path:[[lng,lat]]|null, seg, mode:'fit'|'follow'|'overview' }
export function drawMap(canvas, s) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#10151b'; ctx.fillRect(0, 0, cw, ch);

  const pts = [];
  if (s.here) pts.push([s.here.lng, s.here.lat]);
  if (s.dest) pts.push([s.dest.lng, s.dest.lat]);
  if (s.mode === 'overview' && s.path) pts.push(...s.path);
  if (!pts.length) {
    ctx.fillStyle = '#7d8793'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('목적지를 선택하면 지도가 표시됩니다', cw / 2, ch / 2); return;
  }

  // 보기 영역: 중심(cLng,cLat)과 축척(px/m)
  let cLng, cLat, scale;
  const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  if (s.mode === 'follow' && s.here) { cLng = s.here.lng; cLat = s.here.lat; scale = Math.min(cw, ch) / 900; }
  else {
    cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2; cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx0 = 111320 * Math.cos(rad(cLat));
    const ex = Math.max(300, (Math.max(...lngs) - Math.min(...lngs)) * kx0), ey = Math.max(300, (Math.max(...lats) - Math.min(...lats)) * KY);
    scale = Math.min((cw - 70) / ex, (ch - 70) / ey);
  }
  const kx = 111320 * Math.cos(rad(cLat));
  const X = (lng) => cw / 2 + (lng - cLng) * kx * scale, Y = (lat) => ch / 2 - (lat - cLat) * KY * scale;

  // 격자 (절대 좌표 기준이라 이동하면 함께 움직임)
  const gridM = NICE.find((m) => m * scale >= 45) || NICE[NICE.length - 1];
  ctx.strokeStyle = '#1b232c'; ctx.lineWidth = 1; ctx.beginPath();
  const x0m = (cLng * kx) - cw / 2 / scale, x1m = (cLng * kx) + cw / 2 / scale, y0m = (cLat * KY) - ch / 2 / scale, y1m = (cLat * KY) + ch / 2 / scale;
  for (let m = Math.ceil(x0m / gridM) * gridM; m <= x1m; m += gridM) { const x = cw / 2 + (m - cLng * kx) * scale; ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
  for (let m = Math.ceil(y0m / gridM) * gridM; m <= y1m; m += gridM) { const y = ch / 2 - (m - cLat * KY) * scale; ctx.moveTo(0, y); ctx.lineTo(cw, y); }
  ctx.stroke();

  // 경로: 지나온 구간은 어둡게, 남은 구간은 초록
  if (s.path && s.path.length > 1) {
    const seg = Math.max(0, Math.min(s.path.length - 1, s.seg || 0));
    const stroke = (from, to, color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = from; i <= to; i++) { const x = X(s.path[i][0]), y = Y(s.path[i][1]); i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    };
    if (seg > 0) stroke(0, seg, '#3a4552', 5);
    stroke(seg, s.path.length - 1, '#03c75a', 6);
  }

  const dot = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  if (s.dest) {
    const x = X(s.dest.lng), y = Y(s.dest.lat); dot(x, y, 8, '#ff6b4a');
    if (s.dest.name) { ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#10151b'; ctx.fillStyle = '#fff';
      const label = [...s.dest.name].slice(0, 14).join(''); ctx.strokeText(label, x, y - 14); ctx.fillText(label, x, y - 14); }
  }
  if (s.here) { const x = X(s.here.lng), y = Y(s.here.lat); ctx.fillStyle = 'rgba(59,130,246,.25)'; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill(); dot(x, y, 7, '#3b82f6'); }

  // 축척 막대와 북쪽 표시
  const barM = [...NICE].reverse().find((m) => m * scale <= 110) || NICE[0], barPx = barM * scale;
  ctx.strokeStyle = '#cfd6dd'; ctx.fillStyle = '#cfd6dd'; ctx.lineWidth = 2; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.beginPath(); ctx.moveTo(12, ch - 14); ctx.lineTo(12 + barPx, ch - 14); ctx.moveTo(12, ch - 18); ctx.lineTo(12, ch - 10); ctx.moveTo(12 + barPx, ch - 18); ctx.lineTo(12 + barPx, ch - 10); ctx.stroke();
  ctx.fillText(barM >= 1000 ? `${barM / 1000}km` : `${barM}m`, 12, ch - 22);
  ctx.textAlign = 'center'; ctx.font = '700 12px sans-serif'; ctx.fillText('N ↑', cw - 22, 18);
}
