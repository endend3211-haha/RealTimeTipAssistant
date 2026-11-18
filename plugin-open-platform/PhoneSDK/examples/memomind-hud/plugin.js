import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { compressLz4, toBase64 } from './image.mjs';

const $ = id => document.getElementById(id);
const gm = createGMPlugin();
const canvas = $('preview');
const ctx = canvas.getContext('2d', { alpha: false });

// Exact 560 x 320 optical canvas standard for MemoMind One
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 320;
const TILE_HEIGHT = 64;
const TILE_COUNT = 5;

// Concise Glancable Demo Tips strictly complying with clean format (no redundant boilerplate)
const demoTips = [
  {
    header: "[이메일] 홍길동 대표 · 14:20",
    lines: [
      "🗂️ CM사업본부 2027년 사업계획보고 1차 회의 안내",
      "💡 주요 안건: 신규 프로젝트 예산안 심의 및 핵심 인력 배정",
      "• 회의 일시: 내일(수) 오후 2시 대회의실 (화상 회의 병행)",
      "• 사전 준비: 본부별 3개년 로드맵 및 예상 매출 자료 지참",
      "• 핵심 요청: 1차 예산안 사전 검토 후 서면 의견서 제출 요망",
      "• 참석 대상: 각 사업팀장 및 핵심 프로젝트 리드 전원 필수 참석"
    ],
    caption: "자막 | 실시간 비서 연결 대기 중..."
  },
  {
    header: "[연락처] 홍길동",
    lines: [
      "👤 홍길동",
      "📞 010-9876-5432"
    ],
    caption: "자막 | 홍길동 대표님 연락처 확인했습니다"
  },
  {
    header: "[실시간 주식] 삼성전자",
    lines: [
      "📈 현재가: 78,500원 (전일대비 +1,200원, +1.55% 상승)"
    ],
    caption: "자막 | 오늘 코스피 시장 마감 지수 확인해줘"
  }
];

let currentDemo = 0;
let isListening = true;
let isConnected = false;
let frameId = 0;
let hasPage = false;
let isSending = false;
let pendingVersion = 0;
let sentVersion = 0;
let isAssistantLinked = false;
let lastTipHeader = "";
let lastTipSignature = "";
let lastCaptionText = "";

// HUD Optical Display State
let hudHeader = demoTips[0].header;
let tipPrevLine = ""; // Compact history banner if rolled up
let tipActiveLines = [...demoTips[0].lines];
let hudCaption = demoTips[0].caption;

// Helper: Word-wrap text to fit within max width
function wrapText(text, maxWidth, font) {
  if (font) ctx.font = font;
  const result = [];
  const lines = (text || '').split('\n');
  for (const rawLine of lines) {
    let current = '';
    for (const ch of rawLine) {
      if (ctx.measureText(current + ch).width > maxWidth) {
        result.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

let hudRecentCaptions = [];

// Draw HUD Frame (strictly 560 x 320 coordinate space, 100% full optical utilization)
function drawHUD() {
  // 1. Deep solid black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textBaseline = 'top';

  const marginX = 14;
  const contentWidth = CANVAS_WIDTH - (marginX * 2); // 532px
  const hasActiveTip = Boolean(hudHeader && hudHeader !== "[ 대기 중 ]" && tipActiveLines.length > 0);

  // 2. Header Bar (y: 6 ~ 26)
  const headerText = hasActiveTip ? hudHeader : "[실시간 대화 자막] 온디바이스 음성 비서";
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(headerText, marginX, 6);

  // Status indicator at top right
  ctx.font = '11px sans-serif';
  ctx.fillStyle = isListening ? '#00FF66' : '#888888';
  ctx.textAlign = 'right';
  const statusStr = isListening ? '● 청취 중 (ON)' : '○ 일시정지 (OFF)';
  ctx.fillText(statusStr, CANVAS_WIDTH - marginX, 8);
  ctx.textAlign = 'left';

  // Top Header Divider (y: 28, 1px)
  ctx.fillStyle = '#2d4734';
  ctx.fillRect(marginX, 28, contentWidth, 1);

  if (hasActiveTip) {
    // ==================== MODE A: DUAL-PANE (AI TIP + LIVE CAPTION) ====================
    // --- Upper Zone: AI Tip Zone (y: 32 ~ 194, 162px Height) ---
    const innerWidth = contentWidth - 14; // 518px
    const tipItems = [];

    // Ingest tip active lines with word wrap (up to 7 items max to perfectly fit upper zone)
    tipActiveLines.forEach((item, idx) => {
      const isFirst = (idx === 0);
      const font = isFirst ? 'bold 15px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif'
                            : '14px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
      const wrapped = wrapText(item, innerWidth, font);
      wrapped.forEach((wLine, wIdx) => {
        if (tipItems.length < 7) {
          tipItems.push({
            text: wLine,
            font: font,
            color: (isFirst && wIdx === 0) ? '#ffffff' : '#d4ffd4'
          });
        }
      });
    });

    // Dynamic line height depending on item count to avoid any awkward gaps
    const tipLineHeight = tipItems.length <= 2 ? 34 : tipItems.length <= 4 ? 28 : 22;
    let tipCurrentY = tipItems.length <= 2 ? 46 : tipItems.length <= 4 ? 38 : 34;

    for (let i = 0; i < tipItems.length; i++) {
      ctx.font = tipItems[i].font;
      ctx.fillStyle = tipItems[i].color;
      ctx.fillText(tipItems[i].text, marginX + 10, tipCurrentY);
      tipCurrentY += tipLineHeight;
    }

    // Left Green Accent Bar
    const barStartY = tipItems.length <= 2 ? 46 : tipItems.length <= 4 ? 38 : 34;
    const barHeight = Math.max(24, Math.min(156, tipCurrentY - barStartY));
    ctx.fillStyle = '#00FF66';
    ctx.fillRect(marginX, barStartY, 3, barHeight);

    // --- Middle Section Divider (y: 196, 1px) ---
    ctx.fillStyle = '#2d4734';
    ctx.fillRect(marginX, 196, contentWidth, 1);

    // --- Lower Zone: 💬 Live Speech Transcript Zone (y: 200 ~ 285) ---
    // (This fills the entire previously empty space with rich, readable live conversation streaming)
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#00FF66';
    ctx.fillText("💬 실시간 대화 자막", marginX, 202);

    ctx.font = '10.5px sans-serif';
    ctx.fillStyle = '#007a33';
    ctx.textAlign = 'right';
    ctx.fillText("실시간 스트리밍", CANVAS_WIDTH - marginX, 203);
    ctx.textAlign = 'left';

    // Conversation speech body: extract text from hudCaption or recentCaptions
    let rawSpeech = hudCaption.startsWith("자막 | ") ? hudCaption.slice(5) : hudCaption;
    if (!rawSpeech || rawSpeech.includes("대기 중")) {
      rawSpeech = hudRecentCaptions.length > 0
        ? hudRecentCaptions.slice(-3).join(' ')
        : "음성을 감지하면 실시간 자막과 AI 분석이 여기에 동시 표시됩니다.";
    }

    const captionWrapped = wrapText(rawSpeech, contentWidth - 4, '14.5px sans-serif');
    let captionY = 222;
    ctx.font = '14.5px sans-serif';
    ctx.fillStyle = rawSpeech.includes("여기에 동시 표시") ? '#007a33' : '#ffffff';

    for (let i = 0; i < Math.min(3, captionWrapped.length); i++) {
      ctx.fillText(captionWrapped[i], marginX, captionY);
      captionY += 21;
    }

    // --- Bottom Footer Divider (y: 290, 1px) ---
    ctx.fillStyle = '#2d4734';
    ctx.fillRect(marginX, 290, contentWidth, 1);

    // --- Footer Action / Status Bar (y: 295 ~ 314) ---
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00993e';
    ctx.fillText("💡 터치패드: 세부 정보 확인 · 두 번 탭: 청취 ON/OFF · 길게 누름: 대화 저장", marginX, 298);
  } else {
    // ==================== MODE B: FULL-SCREEN CONVERSATION CAPTIONS ====================
    // When no tip is active: 100% of the display is used for large, optical-grade dialogue subtitles!
    let rawSpeech = hudCaption.startsWith("자막 | ") ? hudCaption.slice(5) : hudCaption;
    const historyLines = hudRecentCaptions.length > 0 ? [...hudRecentCaptions] : [];
    if (rawSpeech && !rawSpeech.includes("대기 중")) {
      historyLines.push(rawSpeech);
    }

    const fullContent = historyLines.length > 0
      ? historyLines.slice(-4).join('\n')
      : "대화가 시작되면 실시간 음성 자막과\nAI 상황별 지식 팁이 화면에 투사됩니다.";

    const wrappedLines = wrapText(fullContent, contentWidth - 14, '19px sans-serif');
    const startY = 46;
    let lineY = startY;
    const maxLines = 7;
    const displayList = wrappedLines.slice(-maxLines);

    displayList.forEach((line, i) => {
      const isLatest = (i === displayList.length - 1);
      ctx.font = isLatest ? 'bold 19px -apple-system, BlinkMacSystemFont, sans-serif' : '17px sans-serif';
      ctx.fillStyle = isLatest ? '#00FF66' : '#a7f3d0';
      ctx.fillText(line, marginX + 8, lineY);
      lineY += 28;
    });

    // Left Green Accent Bar
    ctx.fillStyle = '#00FF66';
    ctx.fillRect(marginX, startY, 3, Math.max(30, lineY - startY));

    // Bottom Divider
    ctx.fillStyle = '#2d4734';
    ctx.fillRect(marginX, 290, contentWidth, 1);

    // Footer Hint
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#00993e';
    ctx.fillText("💡 대화 중 필요한 지식(연락처/주식/일정/이메일 등)이 자동으로 분석됩니다", marginX, 298);
  }

  pendingVersion++;
  triggerSend();
}

// Convert RGB to 4-bit optical monochrome green luminance (0..15)
// Using precise ITU-R BT.601 integer formula: (77*R + 150*G + 29*B + 128) >> 8
function getOpticalLuminance(r, g, b) {
  const lum = Math.max(g, (77 * r + 150 * g + 29 * b + 128) >> 8);
  return Math.min(15, Math.max(0, Math.round(lum / 17)));
}

// Transmit 560 x 320 frame as 5 LZ4 tiles to Smart Glasses
async function triggerSend() {
  if (isSending || !isConnected) return;
  isSending = true;

  try {
    while (sentVersion < pendingVersion) {
      sentVersion = pendingVersion;

      if (!hasPage) {
        await gm.display.createPage();
        hasPage = true;
      }

      // Sample exactly 560 x 320 pixels from canvas origin
      const pixels = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
      const tiles = [];

      for (let t = 0; t < TILE_COUNT; t++) {
        const raw = new Uint8Array((CANVAS_WIDTH * TILE_HEIGHT) / 2); // 17,920 bytes
        for (let i = 0; i < raw.length; i++) {
          const o1 = (t * CANVAS_WIDTH * TILE_HEIGHT + i * 2) * 4;
          const o2 = o1 + 4;
          const g1 = getOpticalLuminance(pixels[o1], pixels[o1 + 1], pixels[o1 + 2]);
          const g2 = getOpticalLuminance(pixels[o2], pixels[o2 + 1], pixels[o2 + 2]);
          raw[i] = ((g1 & 0x0F) << 4) | (g2 & 0x0F);
        }
        tiles.push(raw);
      }

      const currentFrame = ++frameId;
      await gm.display.beginFrame({ frameId: currentFrame, tileCount: TILE_COUNT });

      for (let i = 0; i < TILE_COUNT; i++) {
        await gm.display.updateFrameImageLz4({
          frameId: currentFrame,
          tileIndex: i,
          x: 20,
          y: 15 + i * TILE_HEIGHT,
          width: CANVAS_WIDTH,
          height: TILE_HEIGHT,
          stride: 280,
          decodedSize: tiles[i].length,
          dataBase64: toBase64(compressLz4(tiles[i]))
        });
      }
    }
  } catch (e) {
    hasPage = false;
  } finally {
    isSending = false;
  }
}

function updateListeningUI(listening) {
  isListening = listening;
  const statusEl = $('connStatus');
  statusEl.innerText = isListening ? "청취 중 (ON)" : "청취 일시정지 (OFF)";
  statusEl.style.backgroundColor = isListening ? "#064e3b" : "#7f1d1d";
  statusEl.style.color = isListening ? "#a7f3d0" : "#fecaca";
  statusEl.style.borderColor = isListening ? "#059669" : "#dc2626";
}

async function toggleListening() {
  const next = !isListening;
  updateListeningUI(next);
  drawHUD();

  if (isAssistantLinked) {
    try {
      await fetch('http://127.0.0.1:18772/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'sttListening', value: next })
      });
    } catch (e) {
      console.warn("Local assistant control error:", e);
    }
  }
}

function applyNewTip(header, lines) {
  if (tipActiveLines.length > 0) {
    tipPrevLine = tipActiveLines[0]; // Retain 1st line of previous tip as history banner
  }
  hudHeader = header;
  tipActiveLines = Array.isArray(lines) ? lines : [lines];
  drawHUD();
}

let lastRenderTime = Date.now();
const HEARTBEAT_INTERVAL_MS = 4000; // 4-second heartbeat sync (0 FPS static, 1 FPS heartbeat)

// Poll Real-Time Tip Assistant Local HTTP Server (127.0.0.1:18772)
async function pollAssistant() {
  try {
    const res = await fetch('http://127.0.0.1:18772/live', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (!isAssistantLinked) {
        isAssistantLinked = true;
        $('bridgeStatus').innerText = "실시간 비서 앱 연동 완료 (127.0.0.1:18772)";
        $('bridgeStatus').style.color = "#00FF66";
      }
      if (typeof data.listening === 'boolean' && data.listening !== isListening) {
        updateListeningUI(data.listening);
      }
      let needRedraw = false;
      const now = Date.now();
      const newCaption = data.caption ? `자막 | ${data.caption}` : "자막 | (음성 대기 중...)";
      if (newCaption !== lastCaptionText) {
        lastCaptionText = newCaption;
        hudCaption = newCaption;
        needRedraw = true;
      }
      if (Array.isArray(data.recentCaptions)) {
        if (JSON.stringify(data.recentCaptions) !== JSON.stringify(hudRecentCaptions)) {
          hudRecentCaptions = data.recentCaptions;
          needRedraw = true;
        }
      }
      if (data.tip && data.tip.header) {
        const tipHeader = data.tip.header;
        const lines = Array.isArray(data.tip.lines) && data.tip.lines.length > 0
          ? data.tip.lines
          : [data.tip.header];
        const tipSignature = tipHeader + "::" + lines.join("|");
        if (tipSignature !== lastTipSignature) {
          lastTipSignature = tipSignature;
          lastTipHeader = tipHeader;
          applyNewTip(tipHeader, lines);
          needRedraw = false;
        }
      } else if (!data.tip && hudHeader !== "[ 대기 중 ]" && tipActiveLines.length > 0) {
        lastTipSignature = "";
        lastTipHeader = "";
        hudHeader = "[ 대기 중 ]";
        tipActiveLines = [];
        needRedraw = true;
      }
      // Adaptive FPS: 0 FPS when audio & tips are static; send 1 FPS heartbeat every 4 seconds
      if (!needRedraw && (now - lastRenderTime >= HEARTBEAT_INTERVAL_MS)) {
        needRedraw = true;
      }
      if (needRedraw) {
        lastRenderTime = now;
        drawHUD();
      }
    }
  } catch (_) {
    if (isAssistantLinked) {
      isAssistantLinked = false;
      $('bridgeStatus').innerText = "호스트 브릿지 연결 완료 (정상)";
    }
  }
}

// Hook UI Buttons
$('btnDemo1').onclick = () => {
  const t = demoTips[0];
  applyNewTip(t.header, t.lines);
};
$('btnDemo2').onclick = () => {
  const t = demoTips[1];
  applyNewTip(t.header, t.lines);
};
$('btnDemo3').onclick = () => {
  const t = demoTips[2];
  applyNewTip(t.header, t.lines);
};
$('btnToggle').onclick = () => toggleListening();

// Initial draw
drawHUD();

// Start live polling every 300ms
setInterval(pollAssistant, 300);

// Open Platform Host Bridge Handshake
(async () => {
  try {
    $('bridgeStatus').innerText = "호스트 브릿지 연결 중...";
    await gm.ready();
    $('bridgeStatus').innerText = "호스트 브릿지 연결 완료 (정상)";
    $('bridgeStatus').style.color = "#00FF66";
    isConnected = true;

    await gm.device.subscribeEvents(['button', 'connection']);

    gm.device.onButton(e => {
      if (e.action === 'single') {
        currentDemo = (currentDemo + 1) % demoTips.length;
        const t = demoTips[currentDemo];
        applyNewTip(t.header, t.lines);
      } else if (e.action === 'double') {
        toggleListening();
      }
    });

    gm.device.onConnection(e => {
      if (e.connected) {
        hasPage = false;
        drawHUD();
      }
    });

    drawHUD();
  } catch (err) {
    console.error("gm.ready() error:", err);
    $('bridgeStatus').innerText = "로컬 모드 (브릿지 대기: " + (err.message || err) + ")";
  }
})();
