// 시연용 가상 경로 (실제 도로 아님). API 키/GPS 없이 Studio에서 턴바이턴 화면을 확인하는 용도입니다.
const ORIGIN = { lng: 126.978, lat: 37.5665 };
const KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180), KY = 110540;
// [x(동쪽 m), y(북쪽 m), 안내 코드(없으면 null), 안내 문구]
const WAYPOINTS = [
  [0, 0, null, ''],
  [0, 400, 3, '(데모) 우회전'],
  [350, 400, 2, '(데모) 좌회전'],
  [350, 800, 5, '(데모) 오른쪽 방향'],
  [500, 950, 2, '(데모) 좌회전'],
  [500, 1300, 6, '(데모) 유턴'],
  [540, 1300, null, ''],
  [540, 1000, 3, '(데모) 우회전'],
  [300, 1000, 88, '(데모) 목적지'],
];
const toLngLat = (x, y) => [+(ORIGIN.lng + x / KX).toFixed(6), +(ORIGIN.lat + y / KY).toFixed(6)];

export function makeDemoRoute() {
  const path = [toLngLat(...WAYPOINTS[0])], guide = [];
  let total = 0, prevIdx = 0;
  for (let i = 1; i < WAYPOINTS.length; i++) {
    const [x0, y0] = WAYPOINTS[i - 1], [x1, y1, type, text] = WAYPOINTS[i];
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / 10));
    for (let k = 1; k <= n; k++) path.push(toLngLat(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n));
    total += len;
    if (type !== null) { guide.push({ pointIndex: path.length - 1, type, instructions: text, distance: Math.round(len) }); prevIdx = path.length - 1; }
  }
  return { distance: Math.round(total), duration: 0, path, guide };
}
const last = WAYPOINTS[WAYPOINTS.length - 1];
export const DEMO_DEST = { name: '데모 목적지', address: '샘플 경로 (실제 도로가 아님)', lng: toLngLat(last[0], last[1])[0], lat: toLngLat(last[0], last[1])[1] };
