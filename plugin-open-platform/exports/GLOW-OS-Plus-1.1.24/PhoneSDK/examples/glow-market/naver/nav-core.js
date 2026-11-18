// 경로 추적 순수 로직 (DOM/브리지 의존 없음). 좌표는 [경도, 위도], 거리는 m.
const R = 6371000, rad = (d) => d * Math.PI / 180;

export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 프록시 응답 → 누적거리 배열을 붙인 경로
export function buildRoute(raw) {
  const path = raw.path;
  const cum = new Float64Array(path.length);
  for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + haversine(path[i - 1], path[i]);
  const guide = [...raw.guide].sort((a, b) => a.pointIndex - b.pointIndex);
  return { path, cum, guide, totalM: cum[path.length - 1], durationMs: Number(raw.duration) || 0 };
}

// 위치를 경로의 선분에 투영. { seg, along(경로 시작부터 m), offM(경로와의 거리 m) }
function project(route, pos, from, to) {
  const { path, cum } = route;
  const cosLat = Math.cos(rad(pos[1]));
  let best = { seg: from, along: cum[from], offM: Infinity };
  for (let i = from; i < to; i++) {
    const ax = (path[i][0] - pos[0]) * cosLat * 111320, ay = (path[i][1] - pos[1]) * 110540;
    const bx = (path[i + 1][0] - pos[0]) * cosLat * 111320, by = (path[i + 1][1] - pos[1]) * 110540;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const off = Math.hypot(ax + t * dx, ay + t * dy);
    if (off < best.offM) best = { seg: i, along: cum[i] + t * (cum[i + 1] - cum[i]), offM: off };
  }
  return best;
}

// hint 부근을 먼저 탐색하고, 벗어났으면 전체 경로를 탐색 (되돌아오는 경로의 오매칭 방지)
export function locate(route, pos, hintSeg = 0) {
  const last = route.path.length - 1;
  const near = project(route, pos, Math.max(0, hintSeg - 3), Math.min(last, hintSeg + 400));
  if (near.offM <= 60) return near;
  const all = project(route, pos, 0, last);
  return all.offM < near.offM ? all : near;
}

// 아직 지나지 않은 첫 안내 지점의 인덱스 (from 이전으로는 되돌아가지 않음)
export function nextGuide(route, along, from = 0) {
  for (let g = from; g < route.guide.length; g++) {
    if (route.cum[route.guide[g].pointIndex] > along + 3) return g;
  }
  return route.guide.length - 1;
}

// 안내 코드 → 화살표 각도(12시=0°, 시계방향 +). 문서의 분기점 안내 코드 기준
const ANGLE = { 1: 0, 2: -90, 3: 90, 4: -45, 5: 45, 8: -90, 11: -120, 12: -90, 13: -30, 14: 30, 15: 90, 16: 120, 41: -45, 42: 45,
  21: 0, 23: -150, 24: -120, 25: -90, 26: -60, 27: -30, 28: 0, 29: 30, 30: 60, 31: 90, 32: 120, 33: 150, 34: 180 };
const LEFT_SIDE = new Set([57, 58, 59, 60, 62, 63, 64, 65, 76, 79, 81]);
const RIGHT_SIDE = new Set([66, 67, 68, 69, 71, 72, 73, 74, 77, 80, 82]);

export function maneuver(type) {
  if (type === 88) return { kind: 'arrive', angle: 0 };
  if (type === 87) return { kind: 'via', angle: 0 };
  if (type === 6 || type === 22 || type === 92) return { kind: 'uturn', angle: 0 };
  const t = type >= 91 && type <= 104 ? type - 70 : type;   // 회전 교차로는 로터리 코드로 환산
  let angle = ANGLE[t];
  if (angle === undefined) angle = LEFT_SIDE.has(type) ? -30 : RIGHT_SIDE.has(type) ? 30 : 0;
  return { kind: 'arrow', angle };
}

export function formatDistance(m) {
  if (m >= 10000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.max(0, Math.round(m / 10) * 10)}m`;
}

// 경로 시작부터 along(m) 떨어진 지점의 좌표 (데모 위치 이동용)
export function positionAt(route, along) {
  const { path, cum } = route, last = path.length - 1;
  const a = Math.max(0, Math.min(cum[last], along));
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= a) lo = mid; else hi = mid; }
  const span = cum[hi] - cum[lo], t = span === 0 ? 0 : (a - cum[lo]) / span;
  return { longitude: path[lo][0] + (path[hi][0] - path[lo][0]) * t, latitude: path[lo][1] + (path[hi][1] - path[lo][1]) * t };
}

// ── HUD 부가 정보 (속도/남은 거리/도착 시간/미니맵) ──
const FALLBACK_MPS = 30 / 3.6;   // 경로 소요시간이 없을 때(데모 등) 가정하는 평균 속도

export function formatRemain(m) {
  if (m >= 10000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`.replace('.0km', 'km');
  return `${Math.max(0, Math.round(m / 10) * 10)}m`;
}

// 남은 분. 경로 응답의 duration(ms 가정)에서 평균 속도를 구하고, 값이 비정상이면 30km/h로 계산
export function etaMinutes(route, remainM) {
  let mps = route.durationMs > 0 && route.totalM > 0 ? route.totalM / (route.durationMs / 1000) : 0;
  if (!(mps >= 1 && mps <= 60)) mps = FALLBACK_MPS;
  return Math.max(1, Math.round(remainM / mps / 60));
}
export function formatEta(min) {
  return min < 60 ? `${min}min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`;
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function rdp(p, eps) {   // Ramer-Douglas-Peucker 단순화
  if (p.length < 3) return p;
  const a = p[0], b = p[p.length - 1];
  let idx = -1, dmax = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = distToSeg(p[i], a, b); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax <= eps) return [a, b];
  return rdp(p.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(p.slice(idx), eps));
}

// 앞쪽 경로를 "진행 방향이 위쪽"인 좌표로 변환해 최대 maxPts개 점으로 단순화.
// 각 점은 [오른쪽, 앞쪽], 단위 2m, int8 범위(-127..127). 첫 점은 항상 현재 위치 [0,0].
export function previewPoints(route, loc, here, span = 250, maxPts = 8) {
  const { path, cum } = route, cosLat = Math.cos(rad(here[1]));
  const toM = (p) => [(p[0] - here[0]) * cosLat * 111320, (p[1] - here[1]) * 110540];
  const posM = (along) => { const q = positionAt(route, along); return toM([q.longitude, q.latitude]); };
  const end = Math.min(route.totalM, loc.along + span);

  let [hx, hy] = posM(Math.min(route.totalM, loc.along + 30));          // 진행 방향
  const hl = Math.hypot(hx, hy);
  if (hl < 1) { hx = 0; hy = 1; } else { hx /= hl; hy /= hl; }

  const pts = [[0, 0]];
  for (let i = loc.seg + 1; i < path.length && cum[i] <= end; i++) pts.push(toM(path[i]));
  const lastAlong = pts.length > 1 ? cum[loc.seg + pts.length - 1] : loc.along;
  if (end > lastAlong + 1) pts.push(posM(end));
  if (pts.length < 2) return [[0, 0]];

  const rotated = pts.map(([x, y]) => [x * hy - y * hx, x * hx + y * hy]);
  let out = rotated;
  for (let eps = 2; out.length > maxPts; eps *= 1.6) out = rdp(rotated, eps);
  const q = (v) => Math.max(-127, Math.min(127, Math.round(v / 2)));
  return out.map(([r, f]) => [q(r), q(f)]);
}
