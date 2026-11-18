// 실행 (Node 18+):
//   NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...   ← 네이버 개발자센터(검색 API)
//   NCP_KEY_ID=...      NCP_KEY=...               ← 네이버 클라우드 플랫폼 Application(Directions 5)
//   node server.js
// 선택: DIRECTIONS_BASE (기본 https://naveropenapi.apigw.ntruss.com/map-direction/v1)
import http from 'node:http';

const { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NCP_KEY_ID, NCP_KEY, PORT = 8787 } = process.env;
const DIRECTIONS_BASE = process.env.DIRECTIONS_BASE || 'https://naveropenapi.apigw.ntruss.com/map-direction/v1';
if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET || !NCP_KEY_ID || !NCP_KEY) {
  console.error('NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NCP_KEY_ID, NCP_KEY 환경변수가 모두 필요합니다.'); process.exit(1);
}

const stripTags = (s = '') => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const coord = (v) => { const n = Number(v); return Math.abs(n) > 1000 ? n / 1e7 : n; };   // 정수(×1e7)/소수 모두 처리
const lngLatParam = (v) => /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(v || '') ? v : null;

async function search(q) {
  const r = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`, {
    headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET },
  });
  if (!r.ok) throw Object.assign(new Error(`naver search ${r.status}`), { status: 502 });
  const data = await r.json();
  return { items: (data.items || []).map((i) => ({ name: stripTags(i.title), address: i.roadAddress || i.address || '', lat: coord(i.mapy), lng: coord(i.mapx) }))
    .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng)) };
}

async function route(start, goal) {
  const r = await fetch(`${DIRECTIONS_BASE}/driving?start=${start}&goal=${goal}&option=traoptimal`, {
    headers: { 'x-ncp-apigw-api-key-id': NCP_KEY_ID, 'x-ncp-apigw-api-key': NCP_KEY },
  });
  if (!r.ok) throw Object.assign(new Error(`directions ${r.status}`), { status: 502 });
  const data = await r.json();
  if (data.code !== 0) throw Object.assign(new Error(data.message || `directions code ${data.code}`), { status: 422 });
  const best = data.route?.traoptimal?.[0];
  if (!best?.path?.length) throw Object.assign(new Error('경로 없음'), { status: 422 });
  return {
    distance: best.summary.distance, duration: best.summary.duration,
    path: best.path.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]),
    guide: (best.guide || []).map((g) => ({ pointIndex: g.pointIndex, type: g.type, instructions: g.instructions, distance: g.distance })),
  };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204, {});
  try {
    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
      return q ? send(200, await search(q)) : send(400, { error: 'q required' });
    }
    if (url.pathname === '/route') {
      const start = lngLatParam(url.searchParams.get('start')), goal = lngLatParam(url.searchParams.get('goal'));
      return start && goal ? send(200, await route(start, goal)) : send(400, { error: 'start/goal은 "경도,위도" 형식이어야 합니다' });
    }
    send(404, { error: 'not found' });
  } catch (e) { send(e.status || 502, { error: e.message || 'upstream failed' }); }
}).listen(PORT, () => console.log(`proxy on :${PORT}`));
