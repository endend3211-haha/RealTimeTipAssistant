import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { haversine, buildRoute, locate, nextGuide, maneuver, formatDistance, positionAt, formatRemain, etaMinutes, formatEta, previewPoints } from './nav-core.js';
import { drawMap } from './map.js';
import { makeDemoRoute, DEMO_DEST } from './demo-route.js';
import { createGlassSender } from './glass-render.js';
import { createNativeSender, isExitMessage } from './native-sender.js';

const PROXY = (window.NAVER_NAV_CONFIG?.proxyUrl || '').replace(/\/$/, '');
const $ = (id) => document.getElementById(id);
const gm = createGMPlugin();
const setStatus = (t) => { $('status').textContent = t; };
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

let ready = false, dest = null, here = null, searching = false;
let route = null, navigating = false, hintSeg = 0, gIdx = 0, offCount = 0, lastReroute = 0, rerouting = false;
let demo = false, demoTimer = null, demoAlong = 0, overview = false;
const DEMO_SPEED_MPS = 40;   // 시연용 가속 속도 (실제 주행 속도 아님)
const DEMO_SHOWN_KMH = 30;   // 데모 중 글라스에 표시하는 가상 속도
let speedMps = null, prevPos = null;   // 현재 속도(m/s, 평활화)와 직전 위치

// ── 간이 지도 ──
function redrawMap() {
  try {
    drawMap($('map'), {
      here: here ? { lat: here.latitude, lng: here.longitude } : null,
      dest, path: route?.path || null, seg: hintSeg,
      mode: navigating && route ? (overview ? 'overview' : 'follow') : 'fit',
    });
  } catch (e) { /* 지도는 부가 기능이므로 실패해도 안내는 계속 */ }
}

const onGlassError = (e) => setStatus(`글라스 전송 실패: ${e.message || e.code || e}`);
// 'native': 글라스 전용 플러그인에 컴팩트 메시지 전송 (기본) / 'image': web_bridge에 이미지 전송 (manifest도 맞춰야 함)
const MODE = window.NAVER_NAV_CONFIG?.glassMode === 'image' ? 'image' : 'native';
const pushGlass = MODE === 'image' ? createGlassSender(gm, onGlassError) : createNativeSender(gm, onGlassError);
const clockText = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let lastFrame = null;
const glass = (frame) => { lastFrame = frame; if (ready) pushGlass({ ...frame, clockText: clockText() }); };
setInterval(() => { if (lastFrame) glass(lastFrame); }, 15000);   // 길안내 중이 아니어도 시계가 갱신되도록 (내용이 같으면 전송 생략)

// 위치 콜백의 speed(m/s)를 우선 쓰고, 없으면 직전 위치와의 거리/시간으로 계산
function trackSpeed(p) {
  const now = Date.now();
  let v = Number.isFinite(p.speed) && p.speed >= 0 ? p.speed : null;
  if (v === null && prevPos) {
    const dt = (now - prevPos.t) / 1000;
    if (dt >= 0.5) v = haversine([prevPos.lng, prevPos.lat], [p.longitude, p.latitude]) / dt;
  }
  prevPos = { lng: p.longitude, lat: p.latitude, t: now };
  if (v !== null) speedMps = speedMps === null ? v : speedMps * 0.6 + v * 0.4;
}
const lngLat = (p) => [p.longitude, p.latitude];

// ── 프록시 호출 ──
async function api(path) {
  if (!PROXY || PROXY.includes('YOUR-PROXY-DOMAIN')) throw new Error('config.js와 index.html CSP의 프록시 주소를 먼저 설정하세요');
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${PROXY}${path}`, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `서버 응답 ${res.status}`);
    return body;
  } catch (e) { throw e.name === 'AbortError' ? new Error('요청 시간이 초과되었습니다') : e; }
  finally { clearTimeout(timer); }
}

// ── 검색 ──
async function search() {
  const q = $('query').value.trim();
  if (!q || searching) return;
  searching = true; $('search-btn').disabled = true; $('results').replaceChildren(); setStatus('검색 중...');
  try {
    const { items } = await api(`/search?q=${encodeURIComponent(q)}`);
    renderResults(items || []);
    setStatus(items?.length ? '목적지를 선택하세요' : '검색 결과가 없습니다');
  } catch (e) { setStatus(`검색 실패: ${e.message}`); }
  finally { searching = false; $('search-btn').disabled = false; }
}
function renderResults(items) {
  const list = $('results');
  if (!items.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '다른 검색어로 다시 시도해 보세요.'; list.append(li); return; }
  for (const it of items) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = 'result';
    const s = document.createElement('strong'); s.textContent = it.name;
    const a = document.createElement('span'); a.textContent = it.address || '';
    b.append(s, a); b.addEventListener('click', () => selectDest(it)); li.append(b); list.append(li);
  }
}
function selectDest(it) {
  stopNav(false);
  dest = it;
  $('dest-name').textContent = it.name; $('dest-addr').textContent = it.address || '';
  $('results').replaceChildren(); $('start-btn').disabled = false;
  setStatus('목적지가 설정되었습니다. 안내를 시작하세요');
  showIdle();
}
function showIdle() {
  redrawMap();
  if (!dest) return;
  const t = here ? formatDistance(haversine(lngLat(here), [dest.lng, dest.lat])) : '위치 확인 중';
  $('distance').textContent = t; $('turn').textContent = '';
  glass({ message: `${dest.name}\n직선거리 ${t}`.replace('\n', ' · ') });
}

// ── 길안내 ──
async function fetchRoute() {
  const s = lngLat(here);
  const raw = await api(`/route?start=${s[0]},${s[1]}&goal=${dest.lng},${dest.lat}`);
  return buildRoute(raw);
}
async function startNav() {
  if (!dest) return;
  if (!here) { setStatus('현재 위치를 확인하는 중입니다. 잠시 후 다시 눌러 주세요'); return; }
  $('start-btn').disabled = true; setStatus('경로 탐색 중...'); glass({ message: '경로 탐색 중...' });
  try {
    route = await fetchRoute();
    navigating = true; hintSeg = 0; gIdx = 0; offCount = 0;
    $('stop-btn').hidden = false; $('start-btn').hidden = true;
    setStatus(`안내 중 · 총 ${formatDistance(route.totalM)}`);
    updateNav();
  } catch (e) {
    setStatus(`경로 탐색 실패: ${e.message}`); glass({ message: '경로 탐색 실패' }); $('start-btn').disabled = false;
  }
}
function stopNav(redraw = true) {
  if (demo) { speedMps = null; prevPos = null; }
  navigating = false; route = null; demo = false; clearInterval(demoTimer); demoTimer = null; overview = false;
  $('stop-btn').hidden = true; $('start-btn').hidden = false; $('start-btn').disabled = !dest || dest === DEMO_DEST;
  if (redraw) { setStatus('안내를 종료했습니다'); showIdle(); } else redrawMap();
}
async function reroute() {
  if (rerouting || Date.now() - lastReroute < 15000) return;
  rerouting = true; lastReroute = Date.now(); glass({ message: '경로 재탐색 중...' }); setStatus('경로를 벗어나 재탐색 중...');
  try { route = await fetchRoute(); hintSeg = 0; gIdx = 0; offCount = 0; setStatus('재탐색 완료'); }
  catch (e) { setStatus(`재탐색 실패: ${e.message}`); }
  finally { rerouting = false; }
}
function updateNav() {
  if (!navigating || !route || !here || rerouting) return;
  const loc = locate(route, lngLat(here), hintSeg);
  if (loc.offM > Math.max(60, here.accuracy || 0)) {
    if (++offCount >= 3) reroute(); else glass({ message: '경로를 확인하는 중...' });
    return;
  }
  offCount = 0; hintSeg = loc.seg;
  gIdx = nextGuide(route, loc.along, gIdx);
  const g = route.guide[gIdx], m = maneuver(g.type);
  const remain = route.cum[g.pointIndex] - loc.along;
  if (g.type === 88 && remain < 25) {
    glass({ message: '목적지에 도착했습니다' }); $('turn').textContent = '●'; $('distance').textContent = '도착';
    stopNav(false); setStatus('목적지에 도착했습니다'); return;
  }
  const distText = formatDistance(remain);
  $('turn').textContent = m.kind === 'uturn' ? '↩' : m.kind === 'arrow' ? ARROWS[((Math.round(m.angle / 45) % 8) + 8) % 8] : '●';
  $('distance').textContent = distText; $('dest-addr').textContent = g.instructions || dest.address || '';
  const remainAll = Math.max(0, route.totalM - loc.along);
  glass({
    maneuver: m, distText, text: g.instructions || '',
    speedText: speedMps === null ? '' : String(Math.round(speedMps * 3.6)),
    remainText: formatRemain(remainAll), etaText: formatEta(etaMinutes(route, remainAll)),
    preview: previewPoints(route, loc, lngLat(here)),
  });
  redrawMap();
}

// ── 데모 시연: 가상 경로를 따라 위치를 이동시킵니다 (GPS/프록시/API 키 불필요) ──
function startDemo() {
  stopNav(false);
  dest = DEMO_DEST; route = buildRoute(makeDemoRoute());
  $('dest-name').textContent = dest.name; $('dest-addr').textContent = dest.address; $('results').replaceChildren();
  demo = true; speedMps = DEMO_SHOWN_KMH / 3.6; navigating = true; hintSeg = 0; gIdx = 0; offCount = 0; demoAlong = 0; overview = false;
  $('start-btn').hidden = true; $('stop-btn').hidden = false;
  setStatus('데모 시연 중 (가상 경로 · 40m/초로 가속)');
  const tick = () => {
    if (!demo) return;
    const p = positionAt(route, demoAlong);
    here = { latitude: p.latitude, longitude: p.longitude, accuracy: 5 };
    demoAlong += DEMO_SPEED_MPS;
    updateNav();
  };
  tick(); demoTimer = setInterval(tick, 1000);
}

// ── 시작 ──
redrawMap();   // 목적지 선택 전에도 빈 지도 안내 문구를 표시
$('search-btn').addEventListener('click', search);
$('query').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
$('start-btn').addEventListener('click', startNav);
$('stop-btn').addEventListener('click', () => stopNav(true));
$('demo-btn').addEventListener('click', startDemo);
$('map').addEventListener('click', () => { if (navigating) { overview = !overview; redrawMap(); } });
window.addEventListener('resize', redrawMap);

(async () => {
  try {
    await gm.ready(); ready = true; setStatus('글라스 연결됨'); glass({ message: '목적지를 검색하세요' });
    if (MODE === 'native') gm.plugin.onMessage(({ channel, data }) => { if (isExitMessage(channel, data)) stopNav(true); });
  }
  catch (e) { setStatus(`브리지 연결 실패: ${e.message || e.code || e}`); }
  try {
    gm.location.onPosition((p) => { if (demo) return; trackSpeed(p); here = p; navigating ? updateNav() : showIdle(); });
    gm.location.onError(({ error }) => setStatus(`위치 오류: ${error?.message || error?.code || ''}`));
    await gm.location.watchPosition({ timeoutMs: 30000 });
  } catch (e) { setStatus(`위치를 가져오지 못했습니다: ${e.code || e.message}`); }
})();
