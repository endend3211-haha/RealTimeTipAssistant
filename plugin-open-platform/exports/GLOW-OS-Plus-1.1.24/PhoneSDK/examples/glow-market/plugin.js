import {fullFrameTiles} from './full-frame.mjs';
import {navigate} from './navigation.mjs';
import {createScopedPlugin} from './hub.mjs';
export async function mount(root){



const $ = (selector) => root.querySelector(selector);
const canvas = $('#deviceCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const W = 600;
const H = 350;
const DIRTY_TILE_WIDTH = 200;
const DIRTY_TILE_HEIGHT = 175;
const APPS = ['weather', 'typhoon', 'focus', 'messenger', 'manga', 'games', 'naver', 'calculator'];
const APP_LABELS = { home: '홈', weather: '날씨', typhoon: '뉴스', calculator: '계산기', focus: '주식', manga: '포캣만화', naver: '네이버 길안내', messenger: '메신저 답장', games: '게임 (에뮬)' };
const WEATHER = {
  0: ['맑음', 'sun'], 1: ['대체로 맑음', 'sun'], 2: ['구름 조금', 'cloud'], 3: ['흐림', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  80: ['Showers', 'rain'], 81: ['Heavy showers', 'rain'], 82: ['Severe showers', 'rain'], 95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Severe thunderstorm', 'storm']
};
const CALC_KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '.', '+', '⌫', '±', '%', '='];

let gm;
let eventSubscription;
let bridgeReady = false;
let deviceConnected = true;
let batteryPercent=null,batteryCharging=false,batteryReceivedAt=0;
let pageCreated = false;
let presenting = false;
let pendingPresent = false;
let lz4Available = true;
let atomicFrameAvailable = false;
let nextFrameId = 1;
let presentedTiles = new Map();
let renderTimer = null;
let renderRevision = 0;
let screen = 'home';
let homeIndex = 0;
let homeStart = 0;
const HOME_VISIBLE = 6;
let weatherOffset = 0;
let stormIndex = 0;
let calcIndex = 0;
let weather = null;
let storms = [];
let place = { name: '서울 · 수동', latitude: 37.5665, longitude: 126.9780 };
let manualPlace={...place};
let autoLocation=true,locationBusy=false,lastWeatherAt=0;
let calc = { display: '0', left: null, op: null, waiting: false, expression: '' };
let focusMinutes = 25;
let focusRemaining = 25 * 60;
let focusRunning = false;
let focusEndsAt = 0;
let focusTimer = null;
let toastTimer;

const shade = (level) => {
  const value = Math.max(0, Math.min(15, Math.round(level))) * 17;
  return `rgb(${value},${value},${value})`;
};

function font(size, weight = 500) {
  ctx.font = `${weight} ${size}px "PingFang SC","SF Pro Display",system-ui,sans-serif`;
  ctx.textBaseline = 'middle';
}

function pathRoundRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundRect(x, y, width, height, radius, level) {
  // Low-luminance fills become broad green blocks on the optical display.
  // Keep panel interiors black and preserve hierarchy with outlines and text.
  ctx.fillStyle = shade(level <= 4 ? 0 : level);
  pathRoundRect(x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundRect(x, y, width, height, radius, level, lineWidth = 1) {
  ctx.strokeStyle = shade(level);
  ctx.lineWidth = lineWidth;
  pathRoundRect(x, y, width, height, radius);
  ctx.stroke();
}

function line(x1, y1, x2, y2, level = 4, width = 1) {
  ctx.strokeStyle = shade(level);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function text(value, x, y, size = 16, level = 15, weight = 500, align = 'left') {
  font(size, weight);
  ctx.fillStyle = shade(level);
  ctx.textAlign = align;
  ctx.fillText(String(value), x, y);
}

function fitText(value, x, y, maxWidth, size = 16, level = 15, weight = 500, align = 'left') {
  font(size, weight);
  let output = String(value ?? '');
  while (output.length > 1 && ctx.measureText(output).width > maxWidth) output = `${output.slice(0, -2)}…`;
  text(output, x, y, size, level, weight, align);
}

function drawIcon(name, cx, cy, size = 26, level = 13) {
  ctx.strokeStyle = shade(level);
  ctx.fillStyle = shade(level);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (name === 'sun') {
    ctx.beginPath(); ctx.arc(cx, cy, size * .22, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i += 1) { const a = i * Math.PI / 4; line(cx + Math.cos(a) * size * .34, cy + Math.sin(a) * size * .34, cx + Math.cos(a) * size * .48, cy + Math.sin(a) * size * .48, level, 2); }
  } else if (name === 'cloud' || name === 'rain' || name === 'storm') {
    ctx.beginPath(); ctx.arc(cx - size * .15, cy, size * .2, Math.PI, 0); ctx.arc(cx + size * .08, cy - size * .08, size * .28, Math.PI, 0); ctx.arc(cx + size * .28, cy, size * .17, Math.PI, 0); ctx.stroke();
    line(cx - size * .35, cy, cx + size * .45, cy, level, 2);
    if (name === 'rain') for (let i = -1; i <= 1; i += 1) line(cx + i * size * .18, cy + size * .14, cx + i * size * .18 - 3, cy + size * .29, level, 2);
    if (name === 'storm') { line(cx + 2, cy + size * .09, cx - 4, cy + size * .28, level, 3); line(cx - 4, cy + size * .28, cx + 6, cy + size * .24, level, 3); }
  } else if (name === 'fog') {
    for (let i = -1; i <= 1; i += 1) line(cx - size * .42, cy + i * 7, cx + size * .42, cy + i * 7, level, 2);
  } else if (name === 'snow') {
    for (let i = 0; i < 3; i += 1) { const a = i * Math.PI / 3; line(cx - Math.cos(a) * size * .4, cy - Math.sin(a) * size * .4, cx + Math.cos(a) * size * .4, cy + Math.sin(a) * size * .4, level, 2); }
  } else if (name === 'typhoon') {
    strokeRoundRect(cx-size*.4, cy-size*.4, size*.8, size*.8, 3, level, 2);
    for (let i=0;i<3;i++) line(cx-size*.25,cy-8+i*8,cx+size*.25,cy-8+i*8,level,2);
  } else if (name === 'calculator') {
    strokeRoundRect(cx - size * .38, cy - size * .45, size * .76, size * .9, 4, level, 2);
    line(cx - size * .25, cy - size * .15, cx + size * .25, cy - size * .15, level, 2);
    for (let row = 0; row < 2; row += 1) for (let col = 0; col < 2; col += 1) { ctx.beginPath(); ctx.arc(cx - 6 + col * 12, cy + 2 + row * 11, 1.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (name === 'focus') {
    line(cx-size*.4,cy+size*.3,cx-size*.4,cy-size*.4,level,2);
    line(cx-size*.4,cy+size*.3,cx+size*.4,cy+size*.3,level,2);
    line(cx-size*.3,cy+size*.1,cx-size*.05,cy-size*.1,level,2);
    line(cx-size*.05,cy-size*.1,cx+size*.1,cy,level,2);
    line(cx+size*.1,cy,cx+size*.4,cy-size*.3,level,2);
  } else if (name === 'naver') {
    ctx.beginPath();
    ctx.moveTo(cx,cy-size*.45); ctx.lineTo(cx-size*.38,cy+size*.37);
    ctx.lineTo(cx,cy+size*.20); ctx.lineTo(cx+size*.38,cy+size*.37);
    ctx.closePath(); ctx.stroke();
  } else if (name === 'manga') {
    ctx.beginPath();
    ctx.moveTo(cx, cy-size*.25);
    ctx.quadraticCurveTo(cx-size*.21,cy-size*.44,cx-size*.44,cy-size*.32);
    ctx.lineTo(cx-size*.44,cy+size*.27);
    ctx.quadraticCurveTo(cx-size*.21,cy+size*.15,cx,cy+size*.34);
    ctx.quadraticCurveTo(cx+size*.21,cy+size*.15,cx+size*.44,cy+size*.27);
    ctx.lineTo(cx+size*.44,cy-size*.32);
    ctx.quadraticCurveTo(cx+size*.21,cy-size*.44,cx,cy-size*.25);
    ctx.lineTo(cx,cy+size*.34);ctx.stroke();
  } else if (name === 'games') {
    strokeRoundRect(cx-size*.44,cy-size*.28,size*.88,size*.56,7,level,2);
    line(cx-size*.29,cy,cx-size*.08,cy,level,2);line(cx-size*.185,cy-size*.105,cx-size*.185,cy+size*.105,level,2);
    ctx.beginPath();ctx.arc(cx+size*.18,cy-size*.07,2,0,Math.PI*2);ctx.arc(cx+size*.29,cy+size*.07,2,0,Math.PI*2);ctx.fill();
  } else if (name === 'messenger') {
    ctx.beginPath();ctx.moveTo(cx-size*.22,cy+size*.24);
    ctx.bezierCurveTo(cx-size*.61,cy+size*.12,cx-size*.52,cy-size*.35,cx,cy-size*.35);
    ctx.bezierCurveTo(cx+size*.59,cy-size*.35,cx+size*.61,cy+size*.29,cx-size*.04,cy+size*.27);
    ctx.lineTo(cx-size*.28,cy+size*.43);ctx.closePath();ctx.stroke();
    text('TALK',cx,cy,Math.round(size*.26),level,800,'center');
  }
  ctx.lineCap = 'butt';
}

function clearScreen() {
  ctx.fillStyle = shade(0);
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(title) {
  text('◌  GLOW OS Plus', 18, 18, 13, 12, 650);
  text(title, 300, 18, 13, 8, 550, 'center');
  const date=new Date(),hour=date.getHours();
  const now=`${hour%12||12}:${String(date.getMinutes()).padStart(2,'0')}`;
  text(hour<12?'오전':'오후',451,18,9,9,550,'right');
  text(now,500,18,13,13,650,'right');
  strokeRoundRect(513,12,21,11,3,8,1);
  const batteryKnown=deviceConnected&&batteryPercent!==null&&Date.now()-batteryReceivedAt<35000;
  if(batteryKnown){ctx.fillStyle=shade(12);ctx.fillRect(516,15,Math.round(15*batteryPercent/100),5);}
  text(batteryKnown?`${batteryPercent}%${batteryCharging?'+':''}`:'--%',583,18,11,12,550,'right');
  line(16, 36, 584, 36, 3, 1);
}

function drawFooter(hint = '← → 선택     CLICK 확인     길게 눌러 홈') {
  line(16, 328, 584, 328, 3, 1);
  text(hint, 300, 340, 10, 7, 500, 'center');
}

function get날씨Info(code) { return WEATHER[code] || ['변화하는 날씨', 'cloud']; }

function render홈() {
  drawHeader('HOME');
  fillRoundRect(18, 48, 156, 112, 16, 2);
  strokeRoundRect(18, 48, 156, 112, 16, 5);
  const now = new Date();
  const hour=now.getHours(),clock=`${hour%12||12}:${String(now.getMinutes()).padStart(2,'0')}`;
  text(hour<12?'오전':'오후',35,70,11,9,550);
  text(clock,34,102,35,15,650);
  text(now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }), 35, 132, 12, 8, 500);

  fillRoundRect(184, 48, 398, 112, 16, 1);
  strokeRoundRect(184, 48, 398, 112, 16, 4);
  if (weather?.current) {
    const [label, icon] = get날씨Info(weather.current.weather_code);
    drawIcon(icon, 222, 95, 45, 13);
    text(`${Math.round(weather.current.temperature_2m)}°`, 266, 86, 37, 15, 650);
    text(label, 269, 119, 13, 10, 550);
    text(place.name, 552, 70, 14, 12, 650, 'right');
    text(`체감 ${Math.round(weather.current.apparent_temperature)}°`, 552, 97, 12, 8, 500, 'right');
    text(`습도 ${weather.current.relative_humidity_2m}%  바람 ${Math.round(weather.current.wind_speed_10m)}km/h`, 552, 124, 11, 7, 500, 'right');
  } else {
    drawIcon('cloud', 225, 98, 42, 7);
    text('날씨 불러오는 중', 268, 91, 22, 12, 600);
    text(place.name, 268, 121, 12, 7);
  }

  const gap = 7;
  const cardW = 88;
  homeStart=Math.max(0,Math.min(homeStart,APPS.length-HOME_VISIBLE));
  for (let slot = 0; slot < Math.min(HOME_VISIBLE,APPS.length); slot += 1) {
    const i=homeStart+slot;
    const x = 18 + slot * (cardW + gap);
    const selected = i === homeIndex;
    fillRoundRect(x, 176, cardW, 139, 14, selected ? 4 : 1);
    strokeRoundRect(x, 176, cardW, 139, 14, selected ? 15 : 4, selected ? 2 : 1);
    const appIcon = APPS[i] === 'weather'
      ? get날씨Info(weather?.current?.weather_code)[1]
      : APPS[i];
    drawIcon(appIcon, x + cardW / 2, 218, 35, selected ? 15 : 10);
    text(APP_LABELS[APPS[i]], x + cardW / 2, 263, 13, selected ? 15 : 10, 600, 'center');
    const sub = APPS[i] === 'weather' ? 'FORECAST' : APPS[i] === 'typhoon' ? 'HEADLINES' : APPS[i] === 'calculator' ? 'CALCULATE' : APPS[i] === 'focus' ? 'PORTFOLIO' : APPS[i] === 'manga' ? 'COMICS' : APPS[i] === 'naver' ? '업데이트 예정' : APPS[i] === 'games' ? 'MEGA DRIVE' : 'MESSENGER';
    text(sub, x + cardW / 2, 286, 10, selected ? 11 : 6, 500, 'center');
    if (selected) { fillRoundRect(x + 31, 302, 26, 3, 2, 14); }
  }
  if(homeStart>0){line(10,238,4,245,14,2);line(4,245,10,252,14,2);}
  if(homeStart+HOME_VISIBLE<APPS.length){line(590,238,596,245,14,2);line(596,245,590,252,14,2);}
  drawFooter('방향: 이동 · 한 번: 오른쪽 · 두 번: 왼쪽 · 길게: 열기');
}

function render날씨() {
  drawHeader('WEATHER');
  const current = weather?.current;
  const [label, icon] = get날씨Info(current?.weather_code);
  fillRoundRect(18, 49, 188, 155, 16, 2);
  strokeRoundRect(18, 49, 188, 155, 16, 5);
  drawIcon(icon, 62, 91, 46, 13);
  text(current ? `${Math.round(current.temperature_2m)}°` : '--°', 102, 86, 43, 15, 650);
  text(label, 35, 139, 17, 12, 600);
  text(place.name, 35, 169, 12, 8);
  if (current) text(`체감 ${Math.round(current.apparent_temperature)}°  습도 ${current.relative_humidity_2m}%`, 35, 190, 11, 7);

  fillRoundRect(218, 49, 364, 155, 16, 1);
  strokeRoundRect(218, 49, 364, 155, 16, 4);
  text('NEXT 6 HOURS', 238, 67, 11, 8, 600);
  if (weather?.hourly) {
    const start = Math.max(0, weather.hourly.time.findIndex((item) => new Date(item) >= new Date())) + weatherOffset;
    const temps = weather.hourly.temperature_2m.slice(start, start + 6);
    const min = Math.min(...temps) - 1;
    const max = Math.max(...temps) + 1;
    const points = [];
    temps.forEach((temp, i) => {
      const x = 244 + i * 61;
      const y = 142 - ((temp - min) / Math.max(1, max - min)) * 48;
      points.push([x, y]);
      text(`${Math.round(temp)}°`, x, y - 15, 11, 11, 600, 'center');
      text(new Date(weather.hourly.time[start + i]).toLocaleTimeString('ko-KR', { hour: '2-digit', hour12: false }), x, 181, 9, 6, 500, 'center');
      if (i) line(points[i - 1][0], points[i - 1][1], x, y, 10, 2);
      ctx.fillStyle = shade(i === 0 ? 15 : 10); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  } else text('FETCHING FORECAST…', 400, 126, 17, 8, 500, 'center');

  const metrics = [
    ['RAIN', weather?.hourly ? `${weather.hourly.precipitation_probability[Math.max(0, weather.hourly.time.findIndex((item) => new Date(item) >= new Date()))]}%` : '--'],
    ['바람', current ? `${Math.round(current.wind_speed_10m)} km/h` : '--'],
    ['습도', current ? `${current.relative_humidity_2m}%` : '--']
  ];
  metrics.forEach(([name, value], i) => {
    const x = 18 + i * 194;
    fillRoundRect(x, 217, 182, 96, 13, 1);
    strokeRoundRect(x, 217, 182, 96, 13, 4);
    text(name, x + 16, 240, 11, 7, 500);
    text(value, x + 16, 276, 22, 14, 650);
    fillRoundRect(x + 16, 296, Math.min(145, i === 0 ? Number.parseInt(value, 10) * 1.45 || 10 : i === 1 ? 90 : 112), 4, 2, 9);
  });
  drawFooter('← → 타임라인     길게 눌러 홈');
}

function renderTyphoon() {
  drawHeader('GLOBAL CYCLONES');
  if (!storms.length) {
    drawIcon('typhoon', 300, 126, 84, 11);
    text('NO ACTIVE TROPICAL CYCLONES', 300, 209, 24, 14, 650, 'center');
    text('SOURCE: GDACS · HOLD TO REFRESH', 300, 246, 12, 7, 500, 'center');
    drawFooter('길게 눌러 홈');
    return;
  }
  const storm = storms[stormIndex % storms.length];
  fillRoundRect(18, 49, 340, 264, 16, 1);
  strokeRoundRect(18, 49, 340, 264, 16, 5);
  text(`ACTIVE SYSTEM ${stormIndex + 1} / ${storms.length}`, 38, 73, 11, 7, 600);
  fitText(storm.eventname || storm.name, 38, 109, 280, 28, 15, 650);
  fillRoundRect(38, 132, 88, 24, 12, storm.alertlevel === 'Red' ? 12 : storm.alertlevel === 'Orange' ? 8 : 5);
  text(`${storm.alertlevel || 'Green'} ALERT`, 82, 144, 10, 15, 650, 'center');
  text(storm.country || 'OPEN OCEAN', 38, 181, 14, 11, 550);
  const point = Array.isArray(storm.coordinates) ? `${Number(storm.coordinates[1]).toFixed(1)}°, ${Number(storm.coordinates[0]).toFixed(1)}°` : 'LOCATION UPDATING';
  text(`COORDS  ${point}`, 38, 214, 12, 8);
  text(`SOURCE  ${storm.source || 'GDACS'}`, 38, 241, 12, 8);
  text(`UPDATED  ${new Date(storm.datemodified).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 38, 268, 12, 8);
  text('FOR REFERENCE ONLY · FOLLOW LOCAL OFFICIAL ALERTS', 38, 296, 10, 6);

  fillRoundRect(370, 49, 212, 264, 16, 1);
  strokeRoundRect(370, 49, 212, 264, 16, 4);
  for (let r = 28; r <= 82; r += 27) { ctx.strokeStyle = shade(3); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(476, 170, r, 0, Math.PI * 2); ctx.stroke(); }
  line(390, 170, 562, 170, 3); line(476, 84, 476, 256, 3);
  drawIcon('typhoon', 476, 170, 70, 14);
  ctx.fillStyle = shade(14); ctx.beginPath(); ctx.arc(476, 170, 4, 0, Math.PI * 2); ctx.fill();
  text('CYCLONE LOCATION', 476, 281, 11, 8, 550, 'center');
  drawFooter('↑ ↓ 전환     길게 눌러 홈');
}

function render계산기() {
  drawHeader('CALCULATOR');
  fillRoundRect(18, 48, 564, 62, 14, 2);
  strokeRoundRect(18, 48, 564, 62, 14, 5);
  fitText(calc.expression, 36, 65, 300, 11, 7, 500);
  fitText(calc.display, 558, 86, 440, 30, 15, 650, 'right');
  const gap = 7;
  const keyW = 135.75;
  const keyH = 36;
  CALC_KEYS.forEach((key, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 18 + col * (keyW + gap);
    const y = 120 + row * (keyH + 5);
    const selected = index === calcIndex;
    fillRoundRect(x, y, keyW, keyH, 9, selected ? 13 : ['÷', '×', '−', '+', '='].includes(key) ? 3 : 1);
    strokeRoundRect(x, y, keyW, keyH, 9, selected ? 15 : 4, selected ? 2 : 1);
    text(key, x + keyW / 2, y + keyH / 2 + 1, 16, selected ? 0 : 13, 650, 'center');
  });
  drawFooter('방향키 선택     CLICK 입력     길게: 홈');
}

function render집중() {
  drawHeader('FOCUS');
  const total = focusMinutes * 60;
  const visualElapsed = Math.floor((total - focusRemaining) / 5) * 5;
  const progress = total ? visualElapsed / total : 0;
  const focusCenterX = 145;
  ctx.strokeStyle = shade(3); ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(focusCenterX, 177, 96, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = shade(13); ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(focusCenterX, 177, 96, -.5 * Math.PI, -.5 * Math.PI + Math.PI * 2 * progress); ctx.stroke(); ctx.lineCap = 'butt';
  const mm = String(Math.floor(focusRemaining / 60)).padStart(2, '0');
  const ss = String(focusRemaining % 60).padStart(2, '0');
  text(`${mm}:${ss}`, focusCenterX, 145, 36, 15, 650, 'center');
  text(focusRunning ? 'FOCUSING' : 'READY', focusCenterX, 205, 12, focusRunning ? 12 : 7, 550, 'center');
  fillRoundRect(314, 61, 268, 79, 14, 1); strokeRoundRect(314, 61, 268, 79, 14, 4);
  text('CURRENT MODE', 332, 82, 10, 7); text(`${focusMinutes} MINUTES`, 332, 113, 22, 14, 650);
  fillRoundRect(314, 153, 268, 79, 14, focusRunning ? 4 : 1); strokeRoundRect(314, 153, 268, 79, 14, focusRunning ? 13 : 4);
  text(focusRunning ? '클릭하여 일시정지' : '클릭하여 시작', 332, 177, 11, 8); text(focusRunning ? '리듬을 유지하세요' : '집중을 시작하세요', 332, 207, 21, 14, 650);
  fillRoundRect(314, 245, 268, 68, 14, 1); strokeRoundRect(314, 245, 268, 68, 14, 4);
  text('← → 전환  25 / 5 / 50 MIN', 332, 279, 12, 9, 550);
  drawFooter('← → 시간     CLICK 시작/일시정지     길게: 홈');
}

function renderGames(){
  drawHeader('게임 (에뮬)');
  drawIcon('games',110,145,80,14);
  strokeRoundRect(200,75,370,205,18,15,2);
  text('메가드라이브',225,117,29,15,650);
  text('Street Fighter II′ Plus',225,159,19,12);
  text('폰: 조이패드 · 안경: 게임 화면',225,202,15,10);
  drawFooter('한 번: 메가드라이브 열기     길게: 홈');
}
function startMegaDrive(){navigate('megadrive');}

function renderDevice() {
  clearScreen();
  if (screen === 'home') render홈();
  else if (screen === 'weather') render날씨();
  else if (screen === 'typhoon') renderTyphoon();
  else if (screen === 'calculator') render계산기();
  else if (screen === 'focus') render집중();
  else if (screen === 'games') renderGames();
  $('#screenName').textContent = APP_LABELS[screen];
}

function toGray4Bytes() {
  const pixels = ctx.getImageData(0, 0, W, H).data;
  const bytes = new Uint8Array((W * H) / 2);
  let output = 0;
  for (let i = 0; i < pixels.length; i += 8) {
    const left = Math.round((pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722) / 17);
    const right = Math.round((pixels[i + 4] * .2126 + pixels[i + 5] * .7152 + pixels[i + 6] * .0722) / 17);
    bytes[output] = (Math.min(15, left) << 4) | Math.min(15, right);
    output += 1;
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function lz4CompressBlock(input) {
  const sourceLength = input.length;
  const hashTable = new Int32Array(65536);
  hashTable.fill(-1);
  const output = new Uint8Array(sourceLength + Math.ceil(sourceLength / 255) + 32);
  const matchFindLimit = sourceLength - 12;
  const matchCopyLimit = sourceLength - 5;
  let inputOffset = 0;
  let anchor = 0;
  let outputOffset = 0;

  const read32 = (offset) => (
    input[offset]
    | (input[offset + 1] << 8)
    | (input[offset + 2] << 16)
    | (input[offset + 3] << 24)
  ) >>> 0;
  const hash = (value) => (Math.imul(value, 2654435761) >>> 16) & 0xffff;
  const writeLength = (length) => {
    let remaining = length;
    while (remaining >= 255) { output[outputOffset] = 255; outputOffset += 1; remaining -= 255; }
    output[outputOffset] = remaining;
    outputOffset += 1;
  };

  while (inputOffset <= matchFindLimit) {
    const sequence = read32(inputOffset);
    const hashValue = hash(sequence);
    const reference = hashTable[hashValue];
    hashTable[hashValue] = inputOffset;
    const canMatch = reference >= 0
      && inputOffset - reference <= 65535
      && read32(reference) === sequence;
    if (!canMatch) { inputOffset += 1; continue; }

    const tokenOffset = outputOffset;
    outputOffset += 1;
    const literalLength = inputOffset - anchor;
    let token = Math.min(literalLength, 15) << 4;
    if (literalLength >= 15) writeLength(literalLength - 15);
    output.set(input.subarray(anchor, inputOffset), outputOffset);
    outputOffset += literalLength;

    const distance = inputOffset - reference;
    output[outputOffset] = distance & 0xff;
    output[outputOffset + 1] = distance >>> 8;
    outputOffset += 2;

    const matchStart = inputOffset;
    let matchReference = reference;
    inputOffset += 4;
    matchReference += 4;
    while (inputOffset < matchCopyLimit && input[inputOffset] === input[matchReference]) {
      inputOffset += 1;
      matchReference += 1;
    }
    const encodedMatchLength = inputOffset - matchStart - 4;
    token |= Math.min(encodedMatchLength, 15);
    output[tokenOffset] = token;
    if (encodedMatchLength >= 15) writeLength(encodedMatchLength - 15);
    anchor = inputOffset;
  }

  const literalLength = sourceLength - anchor;
  const tokenOffset = outputOffset;
  outputOffset += 1;
  output[tokenOffset] = Math.min(literalLength, 15) << 4;
  if (literalLength >= 15) writeLength(literalLength - 15);
  output.set(input.subarray(anchor), outputOffset);
  outputOffset += literalLength;
  return output.slice(0, outputOffset);
}

function extractGray4Region(frame, sourceWidth, x, y, width, height) {
  const sourceStride = sourceWidth / 2;
  const tileStride = width / 2;
  const tile = new Uint8Array(tileStride * height);
  const xBytes = x / 2;
  for (let row = 0; row < height; row += 1) {
    const start = (y + row) * sourceStride + xBytes;
    tile.set(frame.subarray(start, start + tileStride), row * tileStride);
  }
  return tile;
}

function bytesEqual(left, right) {
  if (!left || left.length !== right.length) return false;
  for (let index = 0; index < right.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function buildFrameUpdates(frame) {
  const updates = [];
  for (let y = 0; y < H; y += DIRTY_TILE_HEIGHT) {
    const height = Math.min(DIRTY_TILE_HEIGHT, H - y);
    const cacheEntries = [];
    let firstDirtyX = W;
    let dirtyEndX = 0;
    for (let x = 0; x < W; x += DIRTY_TILE_WIDTH) {
      const width = Math.min(DIRTY_TILE_WIDTH, W - x);
      const key = `${x}:${y}`;
      const tile = extractGray4Region(frame, W, x, y, width, height);
      if (bytesEqual(presentedTiles.get(key), tile)) continue;
      cacheEntries.push({ key, tile });
      firstDirtyX = Math.min(firstDirtyX, x);
      dirtyEndX = Math.max(dirtyEndX, x + width);
    }
    if (cacheEntries.length === 0) continue;

    // Keep 200x175 blocks for dirty detection, but transmit at most one
    // bounding tile per display row. Bluetooth round-trip latency dominates
    // the small amount of unchanged data between two dirty blocks.
    const width = dirtyEndX - firstDirtyX;
    const tile = cacheEntries.length === 1
      ? cacheEntries[0].tile
      : extractGray4Region(frame, W, firstDirtyX, y, width, height);
    updates.push({
      cacheEntries,
      tile,
      compressed: lz4CompressBlock(tile),
      geometry: { x: firstDirtyX, y, width, height }
    });
  }
  return updates;
}

function rememberPresentedUpdates(updates) {
  for (const update of updates) {
    for (const entry of update.cacheEntries) {
      presentedTiles.set(entry.key, entry.tile);
    }
  }
}

async function presentRawFallback(region, geometry) {
  const maxWidth = 600;
  const maxHeight = 175;
  for (let relativeY = 0; relativeY < geometry.height; relativeY += maxHeight) {
    for (let relativeX = 0; relativeX < geometry.width; relativeX += maxWidth) {
      const width = Math.min(maxWidth, geometry.width - relativeX);
      const height = Math.min(maxHeight, geometry.height - relativeY);
      const tile = extractGray4Region(region, geometry.width, relativeX, relativeY, width, height);
      await gm.display.updateImage({
        x: geometry.x + relativeX,
        y: geometry.y + relativeY,
        width,
        height,
        stride: width / 2,
        dataBase64: bytesToBase64(tile)
      });
    }
  }
}

async function presentTile(tile, geometry, compressed = lz4CompressBlock(tile)) {
  const stride = geometry.width / 2;
  if (lz4Available) {
    try {
      await gm.display.updateImageLz4({
        ...geometry,
        stride,
        decodedSize: tile.length,
        dataBase64: bytesToBase64(compressed)
      });
      return;
    } catch (error) {
      if (!['METHOD_NOT_FOUND', 'CAPABILITY_UNAVAILABLE', 'TIMEOUT'].includes(error.code)) throw error;
      lz4Available = false;
      console.warn(`LZ4 unavailable (${error.code}); falling back to tiled GRAY_4`);
    }
  }
  await presentRawFallback(tile, geometry);
}

function nextAtomicFrameId() {
  const frameId = nextFrameId;
  nextFrameId = nextFrameId >= 0xffffffff ? 1 : nextFrameId + 1;
  return frameId;
}

async function presentAtomicFrame(updates) {
  const frameId = nextAtomicFrameId();
  try {
    await gm.display.beginFrame({ frameId, tileCount: updates.length });
  } catch (error) {
    if (['METHOD_NOT_FOUND', 'CAPABILITY_UNAVAILABLE'].includes(error.code)) {
      atomicFrameAvailable = false;
      if (error.code === 'CAPABILITY_UNAVAILABLE') lz4Available = false;
      return false;
    }
    throw error;
  }

  for (let tileIndex = 0; tileIndex < updates.length; tileIndex += 1) {
    const update = updates[tileIndex];
    const stride = update.geometry.width / 2;
    await gm.display.updateFrameImageLz4({
      frameId,
      tileIndex,
      ...update.geometry,
      stride,
      decodedSize: update.tile.length,
      dataBase64: bytesToBase64(update.compressed)
    });
  }
  return true;
}

async function presentDevice() {
  if (!bridgeReady || !deviceConnected) return;
  if (presenting) { pendingPresent = true; return; }
  presenting = true;
  const revision = renderRevision;
  try {
    if (!pageCreated) {
      await gm.display.createPage();
      pageCreated = true;
      presentedTiles = new Map();
    }
    const tiles=fullFrameTiles({canvas},true);
    const id=nextFrameId++;
    await gm.display.beginFrame({frameId:id,tileCount:7});
    for(let i=0;i<7;i++)await gm.display.updateFrameImageLz4({frameId:id,tileIndex:i,x:0,y:i*50,width:600,height:50,stride:300,decodedSize:tiles[i].length,dataBase64:bytesToBase64(lz4CompressBlock(tiles[i]))});

  } catch (error) {
    if (error.code === 'DEVICE_DISCONNECTED') deviceConnected = false;
    presentedTiles = new Map();
    console.warn('Device presentation failed', error);
  } finally {
    presenting = false;
    if (pendingPresent) { pendingPresent = false; void presentDevice(); }
  }
}

function requestRender() {
  renderRevision += 1;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderDevice();
    void presentDevice();
  }, 60);
}

function setScreen(next) {
  if (next === 'messenger') { navigate('messenger'); return; }
  if (next === 'manga' || next === 'naver') { navigate(next); return; }
  if (next === 'typhoon' || next === 'focus') { navigate(next === 'typhoon' ? './news/index.html' : './stocks/index.html'); return; }
  screen = next;
  requestRender();
}

function moveSelection(dx, dy = 0) {
  if (screen === 'home') {
    homeIndex=Math.max(0,Math.min(APPS.length-1,homeIndex+(dy||dx)));
    if(homeIndex<homeStart)homeStart=homeIndex;
    if(homeIndex>=homeStart+HOME_VISIBLE)homeStart=homeIndex-HOME_VISIBLE+1;
  } else if (screen === 'weather') weatherOffset = Math.max(0, Math.min(12, weatherOffset + dx));
  else if (screen === 'typhoon' && storms.length) stormIndex = (stormIndex + (dy || dx) + storms.length) % storms.length;
  else if (screen === 'calculator') {
    const row = Math.floor(calcIndex / 4);
    const col = calcIndex % 4;
    calcIndex = ((row + dy + 5) % 5) * 4 + ((col + dx + 4) % 4);
  } else if (screen === 'focus' && !focusRunning && dx) {
    const options = [25, 5, 50];
    const index = options.indexOf(focusMinutes);
    focusMinutes = options[(index + dx + options.length) % options.length];
    focusRemaining = focusMinutes * 60;
  }
  requestRender();
}

function activateSelection() {
  if (screen === 'home') setScreen(APPS[homeIndex]);
  else if (screen === 'games') startMegaDrive();
  else if (screen === 'calculator') press계산기(CALC_KEYS[calcIndex]);
  else if (screen === 'focus') toggle집중();
  else if (screen === 'weather') { weatherOffset = weatherOffset ? 0 : 1; requestRender(); }
  else if (screen === 'typhoon' && storms.length) { stormIndex = (stormIndex + 1) % storms.length; requestRender(); }
}

function longAction() { setScreen('home'); }


function press계산기(key) {
  const ops = { '÷': '/', '×': '*', '−': '-', '+': '+' };
  if (/^\d$/.test(key)) { calc.display = calc.waiting || calc.display === '0' ? key : calc.display + key; calc.waiting = false; }
  else if (key === '.' && !calc.display.includes('.')) calc.display += '.';
  else if (key === 'C') calc = { display: '0', left: null, op: null, waiting: false, expression: '' };
  else if (key === '⌫') calc.display = calc.display.length > 1 ? calc.display.slice(0, -1) : '0';
  else if (key === '±') calc.display = String(-Number(calc.display));
  else if (key === '%') calc.display = String(Number(calc.display) / 100);
  else if (ops[key]) {
    if (calc.op && !calc.waiting) calculate();
    calc.left = Number(calc.display); calc.op = ops[key]; calc.waiting = true; calc.expression = `${calc.display} ${key}`;
  } else if (key === '=') calculate();
  requestRender();
}

function calculate() {
  if (calc.left === null || !calc.op) return;
  const right = Number(calc.display);
  const result = calc.op === '+' ? calc.left + right : calc.op === '-' ? calc.left - right : calc.op === '*' ? calc.left * right : right === 0 ? NaN : calc.left / right;
  const symbol = calc.op === '*' ? '×' : calc.op === '/' ? '÷' : calc.op;
  calc.expression = `${calc.left} ${symbol} ${right} =`;
  calc.display = Number.isFinite(result) ? String(Number(result.toPrecision(12))) : 'ERROR';
  calc.left = null; calc.op = null; calc.waiting = true;
}

function toggle집중() {
  focusRunning = !focusRunning;
  clearInterval(focusTimer);
  if (focusRunning) {
    focusEndsAt = Date.now() + focusRemaining * 1000;
    focusTimer = setInterval(() => {
      focusRemaining = Math.max(0, Math.ceil((focusEndsAt - Date.now()) / 1000));
      if (screen === 'focus') requestRender();
      if (!focusRemaining) { focusRunning = false; clearInterval(focusTimer); toast('집중 session complete'); requestRender(); }
    }, 1000);
  }
  requestRender();
}

function reset집중() {
  focusRunning = false;
  clearInterval(focusTimer);
  focusRemaining = focusMinutes * 60;
  requestRender();
}

async function storageGet(key, fallback = null) {
  try {
    if (bridgeReady) return (await gm.storage.get(key)).value ?? fallback;
    const raw = localStorage.getItem(`glow-market:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

async function storageSet(key, value) {
  try {
    if (bridgeReady) await gm.storage.set(key, value);
    else localStorage.setItem(`glow-market:${key}`, JSON.stringify(value));
  } catch { /* Keep the device usable if storage is temporarily unavailable. */ }
}

async function fetch날씨() {
  let success=false;const requestedPlace={...place};
  try {
    const params = new URLSearchParams({
      latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto',
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,weather_code,precipitation_probability', forecast_days: '2'
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const fresh=await response.json();if(!fresh.current)throw Error('날씨 응답 형식 오류');weather=fresh;success=true;
    lastWeatherAt=Date.now();
    await storageSet('weather-cache', { weather, place, time: Date.now() });
  } catch {
    const cache = await storageGet('weather-cache');
    if (cache?.weather&&Math.abs(cache.place?.latitude-requestedPlace.latitude)<0.001&&Math.abs(cache.place?.longitude-requestedPlace.longitude)<0.001)weather=cache.weather;else weather=null;
  }
  $('#cityInput').value = place.name;
  $('#dataState').textContent = weather ? `날씨 updated · ${place.name}` : '날씨 unavailable';
  if (screen === 'home' || screen === 'weather') requestRender();
  return success;
}

async function fetchStorms() {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 45 * 86400000);
    const day = (date) => date.toISOString().slice(0, 10);
    const response = await fetch(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromdate=${day(from)}&todate=${day(to)}&alertlevel=red;orange;green`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const unique = new Map();
    for (const feature of data.features || []) {
      const item = feature.properties || {};
      if (String(item.iscurrent).toLowerCase() === 'true') unique.set(item.eventid, { ...item, coordinates: feature.geometry?.coordinates });
    }
    storms = [...unique.values()].sort((a, b) => new Date(b.datemodified) - new Date(a.datemodified));
    await storageSet('storms-cache', { storms, time: Date.now() });
  } catch {
    const cache = await storageGet('storms-cache');
    storms = cache?.storms || [];
  }
  stormIndex = Math.min(stormIndex, Math.max(0, storms.length - 1));
  $('#dataState').textContent = `${weather ? `날씨 updated · ${place.name}` : '날씨 unavailable'} · ${storms.length} 활성 태풍`;
  if (screen === 'home' || screen === 'typhoon') requestRender();
}

let citySearchController,citySearchRevision=0;
async function updateCity(query) {
 citySearchController?.abort();const revision=++citySearchRevision;query=query.trim();
 const results=$('#cityResults'),message=$('#citySearchStatus');results.replaceChildren();
 if(query.length<2){message.textContent='도시 이름을 두 글자 이상 입력하세요.';return;}
 const controller=new AbortController();citySearchController=controller;
 const timer=setTimeout(()=>controller.abort(),12000);message.textContent='도시 검색 중…';
 try{
  const params=new URLSearchParams({name:query,count:'10',language:'ko',format:'json'});
  const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`,{signal:controller.signal});
  if(!response.ok)throw Error('도시 검색 서버 오류 HTTP '+response.status);
  const data=await response.json();if(revision!==citySearchRevision)return;
  const rows=(data.results||[]).filter(r=>typeof r.name==='string'&&Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
  message.textContent=rows.length?`${rows.length}개 도시 · 적용할 지역을 선택하세요.`:'검색 결과가 없습니다. 시·군 이름 또는 영문 도시명으로 다시 검색하세요.';
  for(const row of rows){const button=document.createElement('button');button.type='button';button.className='city-result';button.textContent=[row.name,row.admin1,row.country].filter(Boolean).join(' · ');
   button.onclick=async()=>{
    if(locationBusy){message.textContent='현재 위치·날씨 조회가 끝난 뒤 다시 선택하세요.';return;}
    locationBusy=true;for(const b of results.querySelectorAll('button'))b.disabled=true;
    try{place={name:row.name,latitude:row.latitude,longitude:row.longitude,country:row.country};manualPlace={...place};autoLocation=false;$('#autoLocation').checked=false;
     await storageSet('weather-auto-location',false);await storageSet('weather-place',place);
     $('#locationState').textContent='수동 도시 · '+[row.name,row.admin1,row.country].filter(Boolean).join(' · ');
     message.textContent='선택한 도시 날씨를 불러오는 중…';const ok=await fetch날씨();message.textContent=ok?row.name+' 날씨 적용 완료':'도시는 저장했습니다. 날씨 조회에 실패했습니다. 새로고침으로 재시도하세요.';
    }finally{locationBusy=false;for(const b of results.querySelectorAll('button'))b.disabled=false;}
   };results.append(button);
  }
 }catch(e){if(revision!==citySearchRevision)return;message.textContent=e.name==='AbortError'?'도시 검색 시간이 초과되었습니다. 다시 검색하세요.':e instanceof TypeError?'도시 검색 연결 실패 · 인터넷 연결을 확인하세요.':e.message;}
 finally{clearTimeout(timer);if(citySearchController===controller)citySearchController=null;}
}

function toast(message) {
  const target = $('#toast');
  target.textContent = message;
  target.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('show'), 1600);
}

async function initializeBridge() {
  try {
    gm = createScopedPlugin('home');
    await gm.ready();
    const capabilities = await gm.runtime.getCapabilities();
    atomicFrameAvailable = capabilities.display?.includes('atomic-framed-lz4') === true;
    bridgeReady = true;
    gm.on('runtime.lifecycleChanged',e=>{if(e.state!=='running'){clearTimeout(renderTimer);return;}if(e.state==='running'){if(screen==='games')screen='home';pageCreated=false;presentedTiles=new Map();requestRender();setTimeout(()=>{pageCreated=false;presentedTiles=new Map();requestRender();},180);}});
    const savedPlace = await storageGet('weather-place');
    if (savedPlace) {place = savedPlace;manualPlace={...savedPlace};}
    autoLocation=(await storageGet('weather-auto-location',true))!==false;
    $('#autoLocation').checked=autoLocation;
    $('#cityInput').value = place.name;
    $('#deviceState').classList.add('ready');
    $('#deviceState span').textContent = '기기 준비 완료';
    gm.plugin.onMessage(({channel,data})=>{if(channel!==0x4750||data.length!==2)return;batteryPercent=data[0]<=100?data[0]:null;batteryCharging=data[1]===1;batteryReceivedAt=Date.now();requestRender();});
    gm.device.onButton((event) => {
      if (event.action === 'trigger') {
        switch (String(event.button).toLowerCase()) {
          case 'up': moveSelection(0, -1); break;
          case 'down': moveSelection(0, 1); break;
          case 'left': moveSelection(-1, 0); break;
          case 'right': moveSelection(1, 0); break;
          case '6': case '8': case 'page_up': case 'scroll_up':
            if (screen === 'home') moveSelection(-1, 0);
            break;
          case '7': case '9': case 'page_down': case 'scroll_down':
            if (screen === 'home') moveSelection(1, 0);
            break;
          case '10': case '11': case 'back': case 'home': setScreen('home'); break;
        }
      } else if (screen === 'home') {
        if (event.action === 'single') moveSelection(1);
        else if (event.action === 'double') moveSelection(-1);
        else if (['long','very_long'].includes(event.action)) activateSelection();
      } else if (event.action === 'single') activateSelection();
      else if (['long','very_long'].includes(event.action)) longAction();
    });
    gm.device.onConnection((event) => {
      deviceConnected = event.connected;
      if(!event.connected){batteryPercent=null;batteryReceivedAt=0;}
      pageCreated = false;
      presentedTiles = new Map();
      $('#deviceState').classList.toggle('ready', event.connected);
      $('#deviceState span').textContent = event.connected ? '기기 준비 완료' : '기기 연결 끊김';
      requestRender();
    });
    eventSubscription = (await gm.device.subscribeEvents(['button', 'connection'])).subscriptionId;
    requestRender();
  } catch (error) {
    $('#deviceState span').textContent = 'Configuration only';
    console.warn('GM Bridge unavailable', error);
  }
}

$('#openMegaDrive').onclick=startMegaDrive;
$('#wakeDevice').addEventListener('click', () => { setScreen('home'); toast('기기 데스크톱이 활성화되었습니다'); });
$('#cityForm').addEventListener('submit', (event) => { event.preventDefault(); void updateCity($('#cityInput').value); });
window.addEventListener('pagehide', () => { citySearchController?.abort(); clearInterval(focusTimer); if(eventSubscription) void gm.device.unsubscribeEvents(eventSubscription).catch(()=>{}); gm?.close(); });

for (const [id,app] of [['openNews','typhoon'],['openStocks','focus'],['openManga','manga'],['openNaver','naver'],['openMessenger','messenger']]) root.querySelector(`#${id}`).onclick=()=>setScreen(app);

async function refreshWeather(){
 if(locationBusy)return;locationBusy=true;
 try{
  if(autoLocation){
   $('#locationState').textContent='현재 위치 확인 중…';
   try{
    const pos=await gm.location.getCurrentPosition({timeoutMs:15000});
    if(!Number.isFinite(pos.latitude)||!Number.isFinite(pos.longitude))throw Error('위치 결과 없음');
    place={name:'현재 위치',latitude:pos.latitude,longitude:pos.longitude};
    $('#locationState').textContent=`현재 위치 · ${new Date().toLocaleTimeString('ko-KR')} 확인`;
   }catch(e){place={...manualPlace};$('#locationState').textContent='위치 확인 불가 · 위치 권한·GPS·MemoMind 버전을 확인하세요. 수동 도시 날씨를 표시합니다. '+(e.code||e.message);}
  }else $('#locationState').textContent='수동 도시 날씨';
  await fetch날씨();
 }finally{locationBusy=false;}
}
$('#autoLocation').onchange=()=>{autoLocation=$('#autoLocation').checked;void storageSet('weather-auto-location',autoLocation);void refreshWeather();};
$('#refreshLocation').onclick=()=>void refreshWeather();

renderDevice();
await initializeBridge();
await refreshWeather();
setInterval(() => { if (screen === 'home') requestRender(); if(!document.hidden && Date.now()-lastWeatherAt>300000)void refreshWeather(); }, 60000);




}

