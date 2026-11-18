// Lens+ 번역 — MemoMind One 플러그인 v1.3.0
import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';

const $ = id => document.getElementById(id);
const W = 600, H = 350, STRIDE = W >> 1;
const TILES = [[0, 200], [200, 150]]; // 타일당 최대 60,000B (81,891B BLE 한도 이내)
const BRI_LEVELS = [0.35, 0.5, 0.65, 0.8, 1.0]; // 5단계 밝기 (야외에서도 보이도록 최대 100%)

const gm = createGMPlugin();
const S = {
  mode: 'translate', busy: false, key: '', detail: '', page: 0, pages: 1,
  briIdx: 2, // 기본 65%
  state: 'idle', // idle | busy | ok | err
  blob: null, thumbUrl: null,
  precise: false,
  models: [], lines: [], hasDisplay: false, glassesUp: true, pageOpen: false,
};
let drawTimer = null, sending = false, again = false;
const inHost = () => S.hasDisplay; // 앱(MemoMind) 안에서 실행 중인지

const setStatus = t => { $('status').textContent = t; };

/* ---------- 저장소 (gm.storage → localStorage 폴백) ---------- */
async function loadPref(k) {
  try { const r = await gm.storage.get(k); if (r && r.value != null) return r.value; } catch (_) {}
  try { return localStorage.getItem('lp_' + k); } catch (_) { return null; }
}
async function savePref(k, v) {
  try { await gm.storage.set(k, v); return; } catch (_) {}
  try { localStorage.setItem('lp_' + k, v); } catch (_) {}
}

/* ---------- ⚡ 초고속 이미지 리사이즈 (800px, 0.7 품질 → 60KB 전송) ---------- */
async function blobToJpegBase64(blob, maxSide = 1024, q = 0.75) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const url = c.toDataURL('image/jpeg', q);
  return { url, b64: url.split(',')[1] };
}

/* ---------- 프롬프트 빌더 (초고속 간결 응답 유도) ---------- */
function buildPrompt() {
  const lang = $('lang').value;
  const head = 'JSON만 출력: {"key":"...","detail":"..."}. key를 먼저, 짧게. 서론·인사 금지. ';
  if (S.mode === 'translate') {
    return head + `사진 속 외국어를 읽고 ${lang}로 번역. key: 핵심 번역 한 줄(35자 이내). detail: "[원문]\\n...\\n\\n[번역]\\n..." 글이 많으면 중요한 부분 위주로.`;
  }
  return head + '사진 속 문제를 풀어라. key: 최종 정답만 (예: "정답: ③" 또는 "51:③ 52:① 53:④"). ' +
    '문제가 여러 개면 번호별로 전부. 사진이 흐리거나 잘려 못 풀겠으면 key에 "재촬영 필요: 이유". ' +
    'detail: "[문제요약]\\n...\\n\\n[정답과 풀이]\\n번호별 핵심 근거 한 줄씩".';
}

const API = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACKS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

class ApiErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function listModels() {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) return;
  try {
    const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
    if (!res.ok) return;
    const j = await res.json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /^gemini/.test(n) && !/tts|image|embed|live|audio|robotics|computer|learnlm|exp|vision/.test(n));
    if (!names.length) return;
    // flash-lite 및 flash 우선 정렬
    names.sort((a, b) => {
      const aLite = /lite/.test(a) ? 2 : (/flash/.test(a) ? 1 : 0);
      const bLite = /lite/.test(b) ? 2 : (/flash/.test(b) ? 1 : 0);
      return bLite - aLite || b.localeCompare(a);
    });
    S.models = names;
    const sel = $('model'), cur = sel.value;
    sel.innerHTML = '';
    for (const n of names) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = /lite/.test(n) ? `${n} (⚡ 1초 초고속)` : n;
      sel.appendChild(o);
    }
    sel.value = names.includes(cur) ? cur : (names.find(n => /lite/.test(n)) || names.find(n => /flash/.test(n)) || names[0]);
  } catch (_) {}
}

const firstLine = t => (String(t || '').split('\n').map(x => x.trim()).find(x => x && !/^\[.*\]$/.test(x)) || '');
// 응답이 잘렸거나 JSON이 깨져도 정답(key)을 최대한 건져 낸다
function parseAnswer(text, model) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    const o = JSON.parse(t);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const detail = String(o.detail ?? '');
      return { key: String(o.key ?? '').trim() || firstLine(detail) || '답을 확인하지 못했습니다', detail, model };
    }
  } catch (_) {}
  const un = x => { try { return JSON.parse('"' + x.replace(/\\$/, '') + '"'); } catch (_) { return x.replace(/\\n/g, '\n').replace(/\\"/g, '"'); } };
  const km = t.match(/"key"\s*:\s*"((?:[^"\\]|\\.)*)/);
  const dm = t.match(/"detail"\s*:\s*"((?:[^"\\]|\\.)*)/);
  const detail = dm ? un(dm[1]) : (km ? '' : t);
  let key = km ? un(km[1]).trim() : '';
  if (!key) { const m = (detail || t).match(/정답\s*(?:은|는|:|：)?\s*([^\n]+)/); key = m ? ('정답: ' + m[1].trim()) : firstLine(detail); }
  return { key: key || '답을 확인하지 못했습니다', detail, model, partial: true };
}

async function callOnce(model, b64, apiKey, plain = false) {
  const gen = { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: S.mode === 'translate' ? 1500 : 2000 };
  if (!plain) {
    gen.responseSchema = {
      type: 'OBJECT', properties: { key: { type: 'STRING' }, detail: { type: 'STRING' } },
      required: ['key', 'detail'], propertyOrdering: ['key', 'detail'],
    };
    if (/2\.5|latest|-3/.test(model) && !/pro/.test(model)) {
      // 번역·빠른 풀이는 생각 0, 정밀 풀이는 1024 (생각 시간이 정답 정확도를 좌우)
      gen.thinkingConfig = { thinkingBudget: (S.mode === 'solve' && S.precise) ? 1024 : 0 };
    }
  }
  const body = {
    contents: [{ parts: [{ text: buildPrompt() }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
    generationConfig: gen,
  };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), S.precise ? 30000 : 15000);
  let res;
  try {
    res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiErr(0, e.name === 'AbortError' ? '응답 시간 초과' : '네트워크 연결 실패 (인터넷/권한 확인)');
  } finally { clearTimeout(t); }

  if (!res.ok) {
    let msg = ''; try { msg = (await res.json())?.error?.message || ''; } catch (_) {}
    // 모델이 스키마/생각 설정을 지원하지 않으면 단순 설정으로 한 번 더
    if (res.status === 400 && !plain && !/API key|API_KEY/i.test(msg)) return callOnce(model, b64, apiKey, true);
    throw new ApiErr(res.status, msg);
  }
  const json = await res.json();
  const text = (json?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
  if (!text) throw new ApiErr(204, 'AI가 빈 답변을 보냈습니다');
  return parseAnswer(text, model);
}

async function callGemini(b64) {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) throw new Error('Gemini API 키를 먼저 입력하세요.');
  const chosen = $('model').value;
  let list = [chosen, ...FALLBACKS];
  if (S.models.length) list = [chosen, ...FALLBACKS.filter(m => S.models.includes(m)), ...S.models.filter(m => /flash/.test(m))];
  list = [...new Set(list)].slice(0, 4);

  const t0 = Date.now();
  let cur = list[0], last = null;
  // 경과 시간은 휴대폰 상태줄에만 표시 (안경 화면은 다시 그리지 않음 → 전송 폭주 방지)
  const tick = setInterval(() => setStatus(`AI 분석 중… ${((Date.now() - t0) / 1000).toFixed(1)}초 (${cur})`), 250);
  try {
    for (let pass = 0; pass < 2; pass++) {
      for (const model of list) {
        cur = model;
        try { return await callOnce(model, b64, apiKey); }
        catch (e) {
          last = e; const st = e.status;
          if (st === 400 && /API key|API_KEY/i.test(e.message)) throw new Error('API 키가 올바르지 않습니다. 키를 다시 확인하세요.');
          if (st === 401 || st === 403) throw new Error('API 키 권한 오류(' + st + '). 키를 다시 확인하세요.');
          if (st === 404 || st === 400) continue;
          if ([0, 429, 500, 502, 503, 504, 204].includes(st)) continue;
          throw new Error(`AI 오류 ${st}: ${e.message.slice(0, 100)}`);
        }
      }
      if (pass === 0) await sleep(1000);
    }
  } finally { clearInterval(tick); }
  const st = last?.status;
  if (st === 503 || st === 429 || st === 500) throw new Error('Gemini 서버가 지금 매우 혼잡합니다. 1~2분 뒤 다시 시도하세요.');
  throw new Error(last?.message || '모든 모델 호출에 실패했습니다.');
}

/* ---------- 화면 테스트용 샘플 (실제 AI 풀이가 아님) ---------- */
const PRESETS = {
  menu: {
    key: "아보카도 토스트 & 수란",
    detail: "[원문]\nAvocado Toast with Poached Egg\nServed on organic sourdough\nFresh orange juice included\n\n[한국어 번역]\n유기농 사워도우 빵 위에 올린 아보카도 토스트와 수란\n(신선한 생오렌지 주스 포함)",
    thumb: "🍔 브런치 카페 메뉴판"
  },
  sign: {
    key: "지하철 1·2호선 환승구",
    detail: "[원문]\n地下鉄 1・2号線 のりかえ\nきっぷうりば はこちら\n\n[한국어 번역]\n지하철 1·2호선 갈아타는 곳\n승차권 파는 곳은 이쪽입니다",
    thumb: "🗾 일본 지하철 환승 안내 표지판"
  }
};

function runPreset(type) {
  const p = PRESETS[type];
  if (!p) return;
  S.key = '[샘플] ' + p.key;
  S.detail = '※ 화면 테스트용 샘플입니다. 실제 사진 분석 결과가 아닙니다.\n\n' + p.detail;
  S.page = 0; S.state = 'ok';
  showResult();
  setStatus('샘플 표시 중 (실제 풀이 아님)');
  requestDraw();
}

/* ---------- 사진 처리 흐름 ---------- */
/* 사진 선택: 미리보기만 하고 분석은 [분석 시작]을 눌러야 시작 */
function setPhoto(blob) {
  if (S.busy) return;
  S.blob = blob;
  if (S.thumbUrl) URL.revokeObjectURL(S.thumbUrl);
  S.thumbUrl = URL.createObjectURL(blob);
  $('thumb').src = S.thumbUrl; $('thumb').hidden = false;
  S.key = '사진 선택 완료 · [분석 시작]을 누르세요'; S.detail = ''; S.page = 0; S.state = 'idle';
  setStatus('사진 선택됨 · [🔍 분석 시작]을 누르세요');
  setBusy(false); showResult(); requestDraw();
}

async function analyze() {
  if (S.busy) return;
  if (!S.blob) { setStatus('먼저 [🖼️ 사진 선택]으로 사진을 고르세요'); return; }
  S.busy = true; setBusy(true);
  const t0 = Date.now();
  try {
    setStatus('사진 준비 중…');
    const { b64 } = await blobToJpegBase64(S.blob, S.precise ? 1600 : 1024, S.precise ? 0.85 : 0.75);
    S.key = '분석 중…'; S.detail = ''; S.page = 0; S.state = 'busy'; showResult(); requestDraw();

    const r = await callGemini(b64);
    const cost = ((Date.now() - t0) / 1000).toFixed(1);
    S.key = r.key; S.detail = r.detail; S.page = 0; S.state = 'ok';
    setStatus(`✅ 완료 (${cost}초 · ${r.model}${r.partial ? ' · 일부 복구' : ''}) · 버튼: 클릭=다음 / 더블=이전 / 길게=밝기`);
    speak(r.key);
  } catch (e) {
    S.key = '⚠ 오류'; S.detail = e.message || '실패'; S.state = 'err';
    setStatus('⚠ ' + S.detail);
  } finally {
    S.busy = false; setBusy(false); showResult(); requestDraw();
  }
}
function setBusy(b) {
  $('btnGallery').disabled = b;
  $('btnAnalyze').disabled = b || !S.blob;               // 사진을 고르기 전에는 비활성
  $('btnAnalyze').textContent = b ? '⏳ 분석 중…' : '🔍 분석 시작';
}
function showResult() {
  const k = $('keyText'); k.textContent = S.key; k.className = 'key ' + S.state;
  $('detail').textContent = S.detail;
}

/* 갤러리: 앱 파일 선택기(gm.files.pick) 우선, 일반 파일 입력 폴백 */
async function pickGallery() {
  try {
    const r = await gm.files.pick({ extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'], allowMultiple: false });
    const f = r?.files?.[0];
    if (!f) return;
    const opened = await gm.files.openRead(f.fileId);
    const chunks = []; const rd = opened.stream.getReader();
    try { for (;;) { const { value, done } = await rd.read(); if (done) break; chunks.push(value); } }
    finally { rd.releaseLock(); }
    setPhoto(new Blob(chunks));
    gm.files.delete(f.fileId).catch(() => {});
  } catch (e) {
    if (!inHost()) {   // 일반 브라우저(테스트)에서만 웹 파일 선택기 사용
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = ev => { const fl = ev.target.files?.[0]; if (fl) setPhoto(fl); };
      inp.click(); return;
    }
    S.key = '⚠ 갤러리를 열 수 없음'; S.detail = '앱 설정에서 이 플러그인의 "파일" 권한을 허용해 주세요.\n(' + (e.message || e) + ')'; S.state = 'err';
    setStatus(S.detail); showResult(); requestDraw();
  }
}

/* ---------- 안경 HUD 렌더러 (600×350 GRAY_4) ---------- */
const off = document.createElement('canvas'); off.width = W; off.height = H;
const octx = off.getContext('2d', { willReadFrequently: true });
const FONT = '"Noto Sans KR","Malgun Gothic",sans-serif';

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let cur = '', w = 0;
    for (const ch of para) {
      const cw = ctx.measureText(ch).width;
      if (w + cw > maxW && cur) { out.push(cur); cur = ch; w = cw; } else { cur += ch; w += cw; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function fitKey(c, text) {
  for (let px = 32; px >= 20; px -= 2) {
    c.font = `bold ${px}px ${FONT}`;
    if (c.measureText(text).width <= W - 32) return { lines: [text], px };
  }
  c.font = `bold 22px ${FONT}`;
  const ls = wrap(c, text, W - 32);
  return { lines: ls.slice(0, 2).map((l, i) => (i === 1 && ls.length > 2 ? l.slice(0, -1) + '…' : l)), px: 22 };
}

function renderHUD() {
  const c = octx;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

  // 정답 상자 레이아웃 먼저 계산 (본문 시작 위치/페이지당 줄 수가 여기에 달림)
  const keyText = S.state === 'busy' ? '분석 중…' : (S.key || '사진을 선택한 뒤 [분석 시작]을 누르세요');
  const kf = fitKey(c, keyText);
  const boxH = kf.lines.length > 1 ? 80 : 60;
  const bodyTop = 44 + boxH + 30;
  const lpp = Math.max(3, Math.floor((H - 10 - bodyTop) / 30) + 1);

  c.font = `600 20px ${FONT}`;
  S.lines = wrap(c, S.detail, W - 40);
  S.pages = Math.max(1, Math.ceil(S.lines.length / lpp));
  S.page = Math.min(S.page, S.pages - 1);
  const curBriPct = Math.round(BRI_LEVELS[S.briIdx] * 100);

  // 헤더 (이모지는 시스루 화면에서 뭉개져서 사용하지 않음)
  c.fillStyle = '#fff'; c.font = `bold 18px ${FONT}`;
  c.fillText(S.mode === 'solve' ? 'LENS+ 문제풀이' : 'LENS+ 번역', 10, 26);
  c.textAlign = 'right';
  c.fillText(`밝기 ${curBriPct}%  ${S.page + 1}/${S.pages}`, W - 10, 26);
  c.textAlign = 'left';
  c.fillRect(8, 34, W - 16, 2);

  // 정답 상자 (가장 크고 굵게)
  c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(8, 44, W - 16, boxH);
  c.font = `bold ${kf.px}px ${FONT}`;
  kf.lines.forEach((ln, i) => c.fillText(ln, 18, 44 + (kf.lines.length > 1 ? 34 : 42) + i * 30));

  // 본문
  c.font = `600 20px ${FONT}`;
  const from = S.page * lpp;
  S.lines.slice(from, from + lpp).forEach((ln, i) => c.fillText(ln, 12, bodyTop + i * 30));
  if (S.pages > 1) {
    const trackH = H - 10 - bodyTop, th = Math.max(24, trackH / S.pages);
    c.fillRect(W - 8, bodyTop - 16 + (S.page / (S.pages - 1)) * (trackH - th), 3, th);
  }

  // 4비트 GRAY_4 변환 (5단계 밝기 스케일 곱 적용)
  const d = c.getImageData(0, 0, W, H).data;
  const briScale = BRI_LEVELS[S.briIdx];
  const bytes = new Uint8Array(STRIDE * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const lum = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    const v = lum < 0.2 ? 0 : Math.min(15, Math.max(1, Math.round(lum * 15 * briScale)));
    const o = y * STRIDE + (x >> 1);
    bytes[o] = (x & 1) ? (bytes[o] & 0xF0) | v : (bytes[o] & 0x0F) | (v << 4);
  }
  return bytes;
}

function b64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function paintPhone(bytes) {
  const cv = $('hud'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = bytes[y * STRIDE + (x >> 1)], v = (x & 1) ? (r & 15) : (r >> 4), i = (y * W + x) * 4;
    img.data[i] = v * 3; img.data[i + 1] = v * 17; img.data[i + 2] = v * 4; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  $('page').textContent = `${S.page + 1} / ${S.pages}`;
  const pct = Math.round(BRI_LEVELS[S.briIdx] * 100);
  $('briBadge').textContent = `${pct}%`;
  $('btnBriDown').disabled = S.briIdx <= 0;
  $('btnBriUp').disabled = S.briIdx >= BRI_LEVELS.length - 1;
}

function requestDraw() {
  const bytes = renderHUD();
  paintPhone(bytes);
  if (drawTimer) return;
  drawTimer = setTimeout(() => { drawTimer = null; flush(); }, 100);
}

async function flush() {
  if (!S.hasDisplay || !S.glassesUp) return;
  if (sending) { again = true; return; }
  sending = true;
  try {
    const bytes = renderHUD();
    if (!S.pageOpen) { await gm.display.createPage(); S.pageOpen = true; }
    for (const [y, h] of TILES) {
      await gm.display.updateImage({
        x: 0, y, width: W, height: h, stride: STRIDE,
        dataBase64: b64(bytes.subarray(y * STRIDE, (y + h) * STRIDE)),
      });
    }
  } catch (e) {
    S.pageOpen = false;
    setStatus('안경 전송 오류: ' + (e.message || e));
  } finally {
    sending = false;
    if (again) { again = false; requestDraw(); }
  }
}

/* ---------- Harman Audio TTS ---------- */
function speak(t) {
  try {
    if (!('speechSynthesis' in window) || !t) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = S.mode === 'translate' ? ({ '한국어': 'ko-KR', 'English': 'en-US', '日本語': 'ja-JP', '中文': 'zh-CN' }[$('lang').value] || 'ko-KR') : 'ko-KR';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (_) {}
}

/* ---------- 2버튼 밝기 제어 ---------- */
const turn = d => { S.page = (S.page + d + S.pages) % S.pages; requestDraw(); };
const changeBri = delta => {
  const next = Math.max(0, Math.min(BRI_LEVELS.length - 1, S.briIdx + delta));
  if (next !== S.briIdx) {
    S.briIdx = next;
    savePref('briIdx', String(S.briIdx));
    requestDraw();
  }
};
const cycleBri = () => {
  S.briIdx = (S.briIdx + 1) % BRI_LEVELS.length;
  savePref('briIdx', String(S.briIdx));
  requestDraw();
};

/* ---------- UI 이벤트 바인딩 ---------- */
function bindUi() {
  $('btnAnalyze').onclick = analyze;
  $('btnGallery').onclick = pickGallery;

  // 퀵 프리셋
  $('btnPresetMenu').onclick = () => runPreset('menu');
  $('btnPresetSign').onclick = () => runPreset('sign');

  $('btnPrev').onclick = () => turn(-1);
  $('btnNext').onclick = () => turn(1);
  $('btnBriDown').onclick = () => changeBri(-1);
  $('btnBriUp').onclick = () => changeBri(1);
  $('btnTts').onclick = () => speak(`${S.key}. ${S.detail.split('\n\n').slice(-1)[0] || ''}`);
  
  $('apiKey').onchange = e => { savePref('key', e.target.value.trim()); listModels(); };
  $('model').onchange = e => savePref('model', e.target.value);
  $('precise').onchange = e => { S.precise = e.target.checked; savePref('precise', S.precise ? '1' : '0'); };
  $('lang').onchange = e => savePref('lang', e.target.value);
}

async function init() {
  bindUi();
  setBusy(false);
  S.key = '사진을 선택한 뒤 [분석 시작]을 누르세요';
  requestDraw();

  let ok = false;
  try {
    await Promise.race([gm.ready(), new Promise((_, rej) => setTimeout(() => rej(new Error('앱 연결 시간 초과')), 4000))]);
    ok = true;
  } catch (e) { setStatus('휴대폰 단독 모드 (' + e.message + ')'); }

  const [k, m, l, b, pr] = await Promise.all(['key', 'model', 'lang', 'briIdx', 'precise'].map(loadPref));
  if (pr === '1') { S.precise = true; $('precise').checked = true; }
  if (k) $('apiKey').value = k;
  if (m) $('model').value = m;
  if (l) $('lang').value = l;
  if (b != null && BRI_LEVELS[+b]) S.briIdx = +b;

  listModels();
  if (!ok) { requestDraw(); return; }
  S.hasDisplay = true;

  try {
    gm.device.onConnection(e => {
      S.glassesUp = e.connected !== false;
      if (S.glassesUp) { S.pageOpen = false; requestDraw(); }
    });
    // 안경 다리 버튼: single/click=다음, double=이전, long=밝기 순환
    gm.device.onButton(e => {
      if (e.action === 'long') cycleBri();
      else if (e.action === 'double') turn(-1);
      else turn(1);
    });
    await gm.device.subscribeEvents(['button', 'connection']);
    setStatus('안경 연결됨 · ⚡ 초고속 모드 준비 완료');
  } catch (e) {
    setStatus('안경 버튼 연결 실패: ' + (e.message || e));
  }
  requestDraw();
}

window.addEventListener('pagehide', () => { try { speechSynthesis.cancel(); gm.close(); } catch (_) {} });
init();
