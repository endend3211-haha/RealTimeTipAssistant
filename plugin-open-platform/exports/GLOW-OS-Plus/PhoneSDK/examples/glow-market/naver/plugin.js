import { createScopedPlugin } from '../hub.mjs';
import { installHome, navigate } from '../navigation.mjs';
import { fullFrameTiles } from '../full-frame.mjs';
import { compressLz4 } from '../manga/lz4.mjs';
import { buildRoute, formatDistance, locate, maneuver, nextGuide, positionAt } from './nav-core.js';
import { makeDemoRoute, DEMO_DEST } from './demo-route.js';
import { drawFrame } from './glass-render.js';
import { drawMap } from './map.js';

export async function mount(root) {
  const gm = createScopedPlugin('naver');
  const status = root.querySelector('#navStatus');
  const start = root.querySelector('#demoRoute');
  const stop = root.querySelector('#stopRoute');
  const map = root.querySelector('#routeMap');
  const route = buildRoute(makeDemoRoute());
  const idleFrame = { message: '네이버 길안내 · 업데이트 예정' };
  let frameId = 0x4e560000;
  let sending = false;
  let pending;
  let timer;

  async function showHud(frame) {
    if (!gm.isActive()) return;
    pending = frame;
    if (sending) return;
    sending = true;
    try {
      while (pending && gm.isActive()) {
        const frameCanvas = drawFrame(pending);
        pending = null;
        const tiles = fullFrameTiles({ canvas: frameCanvas });
        const id = ++frameId;
        await gm.display.beginFrame({ frameId: id, tileCount: tiles.length });
        for (const [tileIndex, tile] of tiles.entries()) {
          await gm.display.updateFrameImageLz4({
            frameId: id, tileIndex, x: 0, y: tileIndex * 50, width: 600, height: 50,
            stride: 300, decodedSize: tile.length,
            dataBase64: btoa(String.fromCharCode(...compressLz4(tile))),
          });
        }
      }
    } catch (error) {
      if (gm.isActive()) status.textContent = '안경 전송 실패 · ' + error.message;
    } finally {
      sending = false;
      if (pending && gm.isActive()) void showHud(pending);
    }
  }

  function stopDemo() {
    clearInterval(timer);
    start.hidden = false;
    stop.hidden = true;
  }
  function reset() {
    stopDemo();
    status.textContent = '샘플 경로로 안경 길안내를 확인할 수 있습니다.';
    drawMap(map, { dest: DEMO_DEST, path: route.path, mode: 'overview' });
    void showHud(idleFrame);
  }
  function startDemo() {
    stopDemo();
    start.hidden = true;
    stop.hidden = false;
    let along = 0;
    let guideIndex = 0;
    const tick = () => {
      if (along >= route.totalM) {
        stopDemo();
        status.textContent = '샘플 목적지에 도착했습니다.';
        void showHud({ message: '샘플 목적지 도착' });
        return;
      }
      const { latitude: lat, longitude: lng } = positionAt(route, along);
      const location = locate(route, [lng, lat]);
      guideIndex = nextGuide(route, location.along, guideIndex);
      const guide = route.guide[guideIndex];
      const distance = formatDistance(route.cum[guide.pointIndex] - location.along);
      status.textContent = '샘플 경로 · ' + distance + ' · ' + guide.instructions;
      drawMap(map, { here: { lat, lng }, dest: DEMO_DEST, path: route.path, seg: location.seg, mode: 'overview' });
      void showHud({ maneuver: maneuver(guide.type), distText: distance, text: guide.instructions });
      along += 40;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  installHome(root);
  start.addEventListener('click', startDemo);
  stop.addEventListener('click', reset);
  gm.device.onButton(({ button, action }) => {
    if (action === 'single') startDemo();
    if (action === 'long' || action === 'very_long' ||
        (action === 'trigger' && ['10', '11', 'back', 'home'].includes(String(button)))) navigate('home');
  });
  gm.on('runtime.lifecycleChanged', ({ state }) => {
    if (state === 'running') reset();
    else { pending = null; stopDemo(); }
  });
  window.addEventListener('pagehide', stopDemo);
  await gm.ready();
  if (gm.isActive()) reset();
}
