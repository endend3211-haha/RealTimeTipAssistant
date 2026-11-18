import http from 'node:http';

const { KAKAO_REST_API_KEY, PORT = 8788 } = process.env;
const DEMO = !KAKAO_REST_API_KEY;
if (DEMO) console.warn('KAKAO_REST_API_KEY가 없어 데모 모드로 실행합니다. 실제 검색/경로는 사용할 수 없습니다.');

const auth = { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
const coord = (v) => Number(v);
const pair = (v) => /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(v || '') ? v.split(',').map(Number) : null;

async function search(q) {
  if (DEMO) return { items: [{ name: q ? `${q} (데모 목적지)` : '강남역 (데모)', address: '서울특별시 강남구', lat: 37.4979, lng: 127.0276 }] };
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`, { headers: auth });
  if (!r.ok) throw Object.assign(new Error(`카카오 장소 검색 ${r.status}`), { status: 502 });
  const data = await r.json();
  return { items: (data.documents || []).map((i) => ({ name: i.place_name, address: i.road_address_name || i.address_name || '', lat: coord(i.y), lng: coord(i.x) })) };
}

async function route(start, goal) {
  if (DEMO) {
    const [sx, sy] = start, [gx, gy] = goal;
    return { distance: 1800, duration: 480000, path: [[sx, sy], [sx + (gx - sx) * 0.35, sy + (gy - sy) * 0.2], [gx, gy]], guide: [
      { pointIndex: 1, type: 3, instructions: '오른쪽 방향으로 이동하세요', distance: 700 },
      { pointIndex: 2, type: 88, instructions: '목적지에 도착했습니다', distance: 1100 },
    ] };
  }
  const r = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?origin=${start.join(',')}&destination=${goal.join(',')}&priority=RECOMMEND`, { headers: auth });
  if (!r.ok) throw Object.assign(new Error(`카카오 길찾기 ${r.status}`), { status: 502 });
  const data = await r.json();
  const summary = data.routes?.[0]?.summary;
  const sections = data.routes?.[0]?.sections || [];
  const roads = sections.flatMap((s) => s.roads || []);
  const path = roads.flatMap((road) => road.vertexes || []).reduce((a, v, i, all) => i % 2 ? a.concat([[all[i - 1], v]]) : a, []);
  const points = path.length ? path : [[start[0], start[1]], [goal[0], goal[1]]];
  const guide = roads.map((road, i) => ({ pointIndex: Math.min(points.length - 1, i), type: road.turn || 0, instructions: road.name || '도로를 따라 이동', distance: road.distance || 0 }));
  return { distance: summary?.distance || 0, duration: (summary?.duration || 0) * 1000, path: points, guide };
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204, {});
  try {
    if (u.pathname === '/search') return send(200, await search((u.searchParams.get('q') || '').trim().slice(0, 50)));
    if (u.pathname === '/route') {
      const s = pair(u.searchParams.get('start')), g = pair(u.searchParams.get('goal'));
      if (!s || !g) return send(400, { error: 'start/goal은 경도,위도 형식이어야 합니다' });
      return send(200, await route(s, g));
    }
    send(404, { error: 'not found' });
  } catch (e) { send(e.status || 502, { error: e.message || 'upstream failed' }); }
}).listen(PORT, () => console.log(`Kakao proxy on :${PORT}`));
