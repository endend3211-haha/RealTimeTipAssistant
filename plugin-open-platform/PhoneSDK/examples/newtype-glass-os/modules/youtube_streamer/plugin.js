// YouTube HUD Streamer Module for Newtype Glass OS
// Ported from standalone 09_youtube_hud_streamer: Ultra-stable 560x272 Micro-OLED single-call LZ4 engine
import { navigate } from '../../hub.mjs';
import { compressLz4, toBase64 } from '../../core/lz4.mjs';

const W = 560;
const H = 272;
const STRIDE = 280;
const DECODED_SIZE = STRIDE * H; // 76,160 bytes (< 81,901 maxDecodedBytes limit!)

export async function mount(root, scopedHub) {
  // 1. DOM Elements
  const badgeFps = root.querySelector('#badgeFps');
  const inputYtUrl = root.querySelector('#inputYtUrl');
  const btnLoadYt = root.querySelector('#btnLoadYt');
  const btnScreenMirror = root.querySelector('#btnScreenMirror');
  const btnPlaySampleMp4 = root.querySelector('#btnPlaySampleMp4');
  const presetChips = root.querySelectorAll('.btn-preset-chip');

  const htmlVideo = root.querySelector('#htmlVideo');
  const screenMirrorVideo = root.querySelector('#screenMirrorVideo');
  const simVideoCanvas = root.querySelector('#simVideoCanvas');
  const simVideoCtx = simVideoCanvas ? simVideoCanvas.getContext('2d') : null;
  const txtVideoTitle = root.querySelector('#txtVideoTitle');
  const playerModeBadge = root.querySelector('#playerModeBadge');
  const txtLiveSubtitle = root.querySelector('#txtLiveSubtitle');
  const ytIframeContainer = root.querySelector('#ytIframeContainer');

  const progressBar = root.querySelector('#progressBar');
  const timeCurrent = root.querySelector('#timeCurrent');
  const timeTotal = root.querySelector('#timeTotal');

  const btnPlayPause = root.querySelector('#btnPlayPause');
  const playPauseIcon = root.querySelector('#playPauseIcon');
  const playPauseLabel = root.querySelector('#playPauseLabel');
  const btnSkipBackward = root.querySelector('#btnSkipBackward');
  const btnSkipForward = root.querySelector('#btnSkipForward');
  const btnToggleMute = root.querySelector('#btnToggleMute');
  const btnCycleLayout = root.querySelector('#btnCycleLayout');

  const selectFps = root.querySelector('#selectFps');
  const selectDither = root.querySelector('#selectDither');
  const selectLayout = root.querySelector('#selectLayout');
  const selectSubMode = root.querySelector('#selectSubMode');

  const subtitleBox = root.querySelector('#subtitleBox');
  const subLangBadge = root.querySelector('#subLangBadge');

  const hudCanvas = root.querySelector('#hudCanvas');
  const hudCtx = hudCanvas ? hudCanvas.getContext('2d', { willReadFrequently: true }) : null;

  // Offscreen HUD Canvas for rendering & nibble extraction
  const offscreenHudCanvas = document.createElement('canvas');
  offscreenHudCanvas.width = W;
  offscreenHudCanvas.height = H;
  const offscreenCtx = offscreenHudCanvas.getContext('2d', { willReadFrequently: true });

  // 2. Playback State
  let isPlaying = true;
  let currentTime = 15.0;
  let totalDuration = 300.0;
  let currentPresetIdx = 0;
  let currentFps = 4; // 2, 4, 6 FPS
  let ditherMode = 'grayscale'; // 'grayscale' (default 4-bit), 'floyd', 'edge'
  let layoutMode = 'hybrid'; // 'hybrid', 'video-only', 'subtitle-only'
  let subtitleMode = 'ko'; // 'ko', 'dual', 'orig'
  let isMuted = false;

  let isCustomYtPlaying = false;
  let customYtThumbnail = null;
  let customYtTitle = '';
  let customYtChannel = '';
  let customYtSubtitles = [];
  let isScreenMirroring = false;
  let isDirectVideoPlaying = false;

  let animTick = 0;
  let lastFrameTime = performance.now();
  let animFrameId = null;
  let syncTimerIntervalId = null;
  let isSyncing = false;
  let pendingSync = false;
  let lastSyncTime = 0;
  let isDisposed = false;
  let isActive = true;               // false while another app (e.g. Home) owns the glass display
  let wasPlayingBeforeSuspend = false;
  let audioBlocked = false;          // true when browser autoplay policy forced muted playback

  // 3. 4 Dynamic Simulation Presets
  const YOUTUBE_PRESETS = [
    {
      title: "침착맨 삼국지 영걸전 완전 정복 (유비의 결단)",
      channel: "침착맨 플러스",
      category: "🎮 게임·토크",
      duration: 520,
      subtitles: [
        { start: 0, end: 5, ko: "관우와 장비가 군사를 이끌고 형주로 진격하는데...", orig: "관우와 장비가 군사를 이끌고 형주로 진격하는데..." },
        { start: 5, end: 11, ko: "이때 제갈량의 신묘한 계책이 적들의 허를 찌르게 됩니다.", orig: "이때 제갈량의 신묘한 계책이 적들의 허를 찌르게 됩니다." },
        { start: 11, end: 18, ko: "조조군 10만 대군이 강을 건너려다 일제히 당황하기 시작하죠.", orig: "조조군 10만 대군이 강을 건너려다 일제히 당황하기 시작하죠." },
        { start: 18, end: 24, ko: "방통이 '지금이 바로 총공격을 퍼부을 절호의 타이밍'이라며 웃습니다.", orig: "방통이 '지금이 바로 총공격을 퍼부을 절호의 타이밍'이라며 웃습니다." },
        { start: 24, end: 32, ko: "결국 적장의 진영이 완전히 무너지며 역사적인 승리를 거둡니다.", orig: "결국 적장의 진영이 완전히 무너지며 역사적인 승리를 거둡니다." },
        { start: 32, end: 40, ko: "이 승리로 인해 유비는 형주 남부 4개 군을 모두 평정하게 됩니다.", orig: "이 승리로 인해 유비는 형주 남부 4개 군을 모두 평정하게 됩니다." }
      ]
    },
    {
      title: "SpaceX Starship Flight 5 - Super Heavy Booster Catch",
      channel: "SpaceX Official",
      category: "🚀 우주·과학",
      duration: 380,
      subtitles: [
        { start: 0, end: 5, ko: "[발사 10초 전] 모든 시스템 이상 무, 발사 시퀀스가 개시됩니다.", orig: "T-minus 10, 9, 8... All systems go for launch." },
        { start: 5, end: 11, ko: "[엔진 점화] 33기의 랩터 엔진이 최대 추력으로 뿜어냅니다!", orig: "Ignition! All 33 Raptor engines are roaring at full thrust!" },
        { start: 11, end: 18, ko: "[발사대 이탈] 스타십이 발사대를 성공적으로 통과하여 상승 중입니다!", orig: "Starship has successfully cleared the orbital launch tower!" },
        { start: 18, end: 25, ko: "[단 분리 성공] 슈퍼헤비 부스터 분리 확인, 발사대로 귀환을 시작합니다.", orig: "Super Heavy booster separation confirmed. Returning to base." },
        { start: 25, end: 33, ko: "[포획 대기] 메카질라 초대형 로봇팔이 부스터 착륙을 대기합니다!", orig: "Mechazilla giant chopstick arms are ready for booster catch!" },
        { start: 33, end: 40, ko: "[역사적 성공] 공중 로봇팔로 부스터 포획 성공! 항공우주 신기록 달성!", orig: "Booster catch confirmed! Historic milestone in aerospace engineering!" }
      ]
    },
    {
      title: "NewJeans (뉴진스) 'Ditto' Official MV (Side A)",
      channel: "HYBE LABELS",
      category: "🎵 K-POP",
      duration: 215,
      subtitles: [
        { start: 0, end: 6, ko: "[가사 번역] 네 곁에 있고 싶어, 솔직히 네가 좋아, 수수께끼는 싫어~", orig: "Stay in the middle, Like you a little, Don't want no riddle~" },
        { start: 6, end: 12, ko: "[가사 번역] 말해줘 똑같이 말해줘, 디토라고 해줘, 아침은 너무 멀어", orig: "말해줘 Say it back, Oh say it ditto~ 아침은 너무 멀어" },
        { start: 12, end: 18, ko: "[가사 번역] 디토라고 말해줘, 훌쩍 커버렸어 함께한 기억처럼", orig: "So say it ditto~ 훌쩍 커버렸어 함께한 기억처럼" },
        { start: 18, end: 24, ko: "[가사 번역] 널 보면 내 마음이 자꾸 두근거려, 어디까지 가볼까?", orig: "널 보면 내 마음이 자꾸 두근거려, 어디까지 가볼까?" },
        { start: 24, end: 30, ko: "[가사 번역] 라타타타 심장이 울려, 널 향해 거침없이 뛰고 있어", orig: "Ra-ta-ta-ta 울린 심장 (Ra-ta-ta-ta) 널 향해 뛰고 있어" },
        { start: 30, end: 38, ko: "[가사 번역] 거울 미로 속을 헤매기 싫어, 그냥 내 손을 꼭 잡아줘.", orig: "I don't want to walk in this mirror maze, just hold my hand." }
      ]
    },
    {
      title: "MemoMind One 스마트 안경 3주 찐사용기 (HUD 미러링 대박!)",
      channel: "잇섭 ITSub",
      category: "🧠 테크리뷰",
      duration: 480,
      subtitles: [
        { start: 0, end: 6, ko: "와 여러분, 오늘 보여드릴 건 진짜 안경에 화면이 뜨는 스마트 안경입니다.", orig: "와 여러분, 오늘 보여드릴 건 진짜 안경에 화면이 뜨는 스마트 안경입니다." },
        { start: 6, end: 12, ko: "무게가 겨우 38g밖에 안 되는데 눈앞에 560×272 고해상도 HUD가 떠요.", orig: "무게가 겨우 38g밖에 안 되는데 눈앞에 560×272 고해상도 HUD가 떠요." },
        { start: 12, end: 18, ko: "특히 폰에서 유튜브 틀고 안경으로 자막이랑 PIP 보는 게 진짜 미쳤습니다.", orig: "특히 폰에서 유튜브 틀고 안경으로 자막이랑 PIP 보는 게 진짜 미쳤습니다." },
        { start: 18, end: 25, ko: "지하철이나 걸어가면서 폰 안 보고 안경으로 강의 듣기에 최고네요.", orig: "지하철이나 걸어가면서 폰 안 보고 안경으로 강의 듣기에 최고네요." },
        { start: 25, end: 32, ko: "배터리도 일반 텍스트 모드에선 하루 종일 가고 최적화가 끝내줍니다.", orig: "배터리도 일반 텍스트 모드에선 하루 종일 가고 최적화가 끝내줍니다." },
        { start: 32, end: 40, ko: "이건 단순한 가젯이 아니라 우리 일상을 바꿀 물건입니다.", orig: "이건 단순한 가젯이 아니라 우리 일상을 바꿀 물건입니다." }
      ]
    }
  ];

  // 4. Time Formatting & Subtitles
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getCurrentSubtitle() {
    if (isScreenMirroring) {
      return "[실시간 미러링] 브라우저 화면이 4 FPS로 안경에 무선 전송되고 있습니다.";
    }
    if (isCustomYtPlaying) {
      if (customYtSubtitles && customYtSubtitles.length > 0) {
        const found = customYtSubtitles.find(s => currentTime >= s.start && currentTime < s.end);
        if (found) {
          if (subtitleMode === 'orig') return found.orig || found.ko || found.text;
          if (subtitleMode === 'dual' && found.orig && found.orig !== (found.ko || found.text)) {
            return `${found.ko || found.text} (${found.orig})`;
          }
          return found.ko || found.text;
        }
      }
      return `[실시간 유튜브 스트리밍] '${customYtTitle || "유튜브 영상"}' 재생 중 · 안경 시야 투사 중`;
    }
    const preset = YOUTUBE_PRESETS[currentPresetIdx];
    const maxSubEnd = preset.subtitles[preset.subtitles.length - 1].end;
    const loopTime = currentTime % (maxSubEnd + 5);

    const found = preset.subtitles.find(s => loopTime >= s.start && loopTime < s.end);
    if (!found) return "▶ 음악 및 사운드 재생 중...";

    if (subtitleMode === 'orig') return found.orig || found.ko;
    if (subtitleMode === 'dual' && found.orig && found.orig !== found.ko) {
      return `${found.ko} (${found.orig})`;
    }
    return found.ko;
  }

  function wrapTextLines(c, text, maxWidth) {
    if (!text) return [];
    const words = text.split(/(\s+)/);
    const lines = [];
    let current = "";
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const test = current + word;
      if (c.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current.trimEnd());
        current = word.trimStart();
      } else {
        current = test;
      }
    }
    if (current.length > 0) lines.push(current.trimEnd());
    return lines;
  }

  // 5. 60 FPS Video Engine (requestAnimationFrame)
  function startVideoEngine() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    lastFrameTime = performance.now();
    function loop(now) {
      if (isDisposed || !isActive) { animFrameId = null; return; } // Sleep while another app owns the glass
      const delta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      if (isPlaying) {
        if (isDirectVideoPlaying && htmlVideo && !isNaN(htmlVideo.currentTime)) {
          currentTime = htmlVideo.currentTime;
          totalDuration = htmlVideo.duration || 596;
        } else {
          currentTime += delta;
          const curPreset = YOUTUBE_PRESETS[currentPresetIdx];
          const dur = isCustomYtPlaying ? totalDuration : curPreset.duration;
          if (currentTime >= dur) currentTime = 0;
        }
        animTick += delta * 60;
        updateTimeUI();
      }

      renderSimulatedVideoScene();
      animFrameId = requestAnimationFrame(loop);
    }
    animFrameId = requestAnimationFrame(loop);
  }

  function renderSimulatedVideoScene() {
    if (!simVideoCtx) return;
    const ctx = simVideoCtx;
    const w = simVideoCanvas.width;
    const h = simVideoCanvas.height;

    // 1. 브라우저 탭 실시간 화면 미러링
    if (isScreenMirroring && screenMirrorVideo && screenMirrorVideo.readyState >= 2) {
      ctx.drawImage(screenMirrorVideo, 0, 0, w, h);
      return;
    }

    // 2. 실제 HTML5 직접 MP4 비디오
    if (isDirectVideoPlaying && htmlVideo && htmlVideo.readyState >= 2) {
      ctx.drawImage(htmlVideo, 0, 0, w, h);
      return;
    }

    // 3. 실제 유튜브 링크 썸네일 & 다이나믹 모션 엔진 (Ken Burns + 스캔라인 + 이퀄라이저)
    if (isCustomYtPlaying && customYtThumbnail) {
      const zoom = 1.08 + Math.sin(animTick * 0.05) * 0.05;
      const panX = Math.sin(animTick * 0.03) * 16;
      const panY = Math.cos(animTick * 0.02) * 10;

      ctx.save();
      ctx.translate(w / 2 + panX, h / 2 + panY);
      ctx.scale(zoom, zoom);
      ctx.drawImage(customYtThumbnail, -w / 2, -h / 2, w, h);
      ctx.restore();

      // 사이버펑크 네온 스캔라인
      const scanY = (animTick * 3.5) % h;
      ctx.fillStyle = "rgba(124, 255, 139, 0.45)";
      ctx.fillRect(0, scanY, w, 2.5);

      // 하단 실시간 사운드 이퀄라이저 바
      for (let i = 0; i < 28; i++) {
        const wave = Math.sin((animTick * 0.25) + (i * 0.5)) * 0.5 + 0.5;
        const barH = wave * 22 + 4;
        ctx.fillStyle = "#7cff8b";
        ctx.fillRect(15 + i * 16, h - barH - 8, 10, barH);
      }

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`REC ● LIVE DYNAMIC HUD [${currentFps} FPS]`, 15, 20);
      return;
    }

    // 4. 4대 프리셋 가상 애니메이션 모드
    ctx.fillStyle = "#0a0f14";
    ctx.fillRect(0, 0, w, h);

    if (currentPresetIdx === 0) {
      // 씬 1: 삼국지 토크
      ctx.strokeStyle = "rgba(40, 70, 90, 0.4)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      const bounce = Math.sin(animTick * 0.1) * 6;
      ctx.fillStyle = "#10b981";
      ctx.beginPath(); ctx.arc(w * 0.35, h * 0.45 + bounce, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fbbf24"; ctx.fillRect(w * 0.35 - 35, h * 0.45 + bounce - 45, 70, 15);
      ctx.fillStyle = "#000000"; ctx.fillRect(w * 0.35 - 15, h * 0.45 + bounce - 5, 8, 8); ctx.fillRect(w * 0.35 + 8, h * 0.45 + bounce - 5, 8, 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)"; ctx.fillRect(w * 0.52, h * 0.3, 180, 56);
      ctx.strokeStyle = "#7cff8b"; ctx.strokeRect(w * 0.52, h * 0.3, 180, 56);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 13px sans-serif";
      ctx.fillText("제갈량: 주군, 지금입니다!", w * 0.54, h * 0.46);
    } else if (currentPresetIdx === 1) {
      // 씬 2: 로켓 발사
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 20; i++) {
        const sx = (i * 37 + (animTick * 2)) % w;
        const sy = (i * 23 + (animTick * 4)) % h;
        ctx.fillRect(sx, sy, 2, 2);
      }
      const rx = w * 0.5; const ry = h * 0.45;
      ctx.fillStyle = "#e2e8f0"; ctx.fillRect(rx - 20, ry - 70, 40, 110);
      ctx.beginPath(); ctx.moveTo(rx - 20, ry - 70); ctx.lineTo(rx, ry - 110); ctx.lineTo(rx + 20, ry - 70); ctx.fillStyle = "#ef4444"; ctx.fill();
      const flame = Math.sin(animTick * 0.4) * 15 + 35;
      ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.moveTo(rx - 15, ry + 40); ctx.lineTo(rx, ry + 40 + flame); ctx.lineTo(rx + 15, ry + 40); ctx.fill();
    } else if (currentPresetIdx === 2) {
      // 씬 3: 음악 MV (Ditto)
      for (let i = 0; i < 18; i++) {
        const barH = (Math.sin(animTick * 0.15 + i * 0.5) * 0.5 + 0.5) * 110 + 10;
        ctx.fillStyle = i % 2 === 0 ? "#f43f5e" : "#38bdf8";
        ctx.fillRect(30 + i * 24, h - barH - 25, 16, barH);
      }
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 16px sans-serif";
      ctx.fillText("🎵 NewJeans - Ditto", 40, 50);
    } else {
      // 씬 4: 안경 리뷰
      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
      const cx = w * 0.5; const cy = h * 0.5;
      const rotW = Math.cos(animTick * 0.05) * 80 + 130;
      ctx.strokeRect(cx - rotW * 0.5, cy - 35, rotW * 0.45, 55);
      ctx.strokeRect(cx + rotW * 0.05, cy - 35, rotW * 0.45, 55);
      ctx.fillStyle = "#7cff8b"; ctx.font = "bold 13px sans-serif";
      ctx.fillText("Micro-OLED 560×272 HUD 도파관", cx - 95, cy - 50);
    }
  }

  // 6. Dither & Frame Processing
  function drawProcessedVideoFrame(targetCtx, x, y, w, h) {
    if (!simVideoCanvas) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = Math.floor(w);
    tempCanvas.height = Math.floor(h);
    const tCtx = tempCanvas.getContext("2d");

    tCtx.drawImage(simVideoCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imgData.data;

    if (ditherMode === "floyd") {
      // 고대비 흑백 디더링 (OLED 가독성 최적화)
      for (let i = 0; i < data.length; i += 4) {
        const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const px = (i / 4) % tempCanvas.width;
        const py = Math.floor((i / 4) / tempCanvas.width);
        const threshold = ((px % 2) ^ (py % 2)) ? 110 : 145;
        const val = luma > threshold ? 255 : 0;
        data[i] = val === 255 ? 124 : 0;
        data[i + 1] = val === 255 ? 255 : 0;
        data[i + 2] = val === 255 ? 139 : 0;
      }
    } else if (ditherMode === "edge") {
      // 사이버펑크 엣지 아웃라인
      for (let i = 0; i < data.length - 8; i += 4) {
        const cur = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const next = data[i + 4] * 0.299 + data[i + 5] * 0.587 + data[i + 6] * 0.114;
        const edge = Math.abs(cur - next) > 24 ? 255 : 0;
        data[i] = edge ? 56 : 0;
        data[i + 1] = edge ? 255 : 0;
        data[i + 2] = edge ? 248 : 0;
      }
    } else {
      // 4-bit 그레이스케일
      for (let i = 0; i < data.length; i += 4) {
        const luma = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        const quant = Math.min(255, Math.floor(luma / 16) * 17);
        data[i] = Math.round(quant * 0.48);
        data[i + 1] = quant;
        data[i + 2] = Math.round(quant * 0.54);
      }
    }

    tCtx.putImageData(imgData, 0, 0);
    targetCtx.drawImage(tempCanvas, x, y, w, h);
  }

  function grayscaleNibble(data, offset) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    return Math.min(15, Math.floor(luma / 16));
  }

  // 7. Full 560x272 HUD Drawing
  function drawHUDCanvas(encodePixels = true) {
    const ctx = offscreenCtx;
    ctx.fillStyle = '#070e08';
    ctx.fillRect(0, 0, W, H);

    const preset = YOUTUBE_PRESETS[currentPresetIdx];
    const curSub = getCurrentSubtitle();
    const curTitle = isScreenMirroring ? "🔴 브라우저 탭 실시간 화면 미러링" : (isCustomYtPlaying ? (customYtTitle || "유튜브 영상") : preset.title);
    const curChannel = isScreenMirroring ? "내 브라우저 화면" : (isCustomYtPlaying ? (customYtChannel || "YouTube") : preset.channel);
    const curDuration = isCustomYtPlaying ? totalDuration : preset.duration;

    // Header Bar
    ctx.fillStyle = '#7CFF8B';
    ctx.font = 'bold 12.5px sans-serif';
    ctx.fillText('▶ YOUTUBE HUD STREAMER', 18, 22);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    const timeStr = `${formatTime(currentTime)} / ${formatTime(curDuration)}`;
    const playStatus = isPlaying ? `[${currentFps} FPS · 재생 중]` : '[일시정지]';
    // Audio is played by the phone (speaker / BT earphones); show the real state on the lens
    let sndLabel = 'SND: 무음 프리셋';
    if (isDirectVideoPlaying) sndLabel = (htmlVideo && !htmlVideo.muted && !htmlVideo.paused) ? 'SND: 폰 ON' : 'SND: MUTE';
    ctx.fillText(`${sndLabel}  ${playStatus} ${timeStr}`, W - 18, 22);
    ctx.textAlign = 'left';

    ctx.strokeStyle = 'rgba(124, 255, 139, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, 28); ctx.lineTo(W - 18, 28); ctx.stroke();

    // Body by Layout
    if (layoutMode === "hybrid") {
      const pipX = 18; const pipY = 36; const pipW = 210; const pipH = 118;
      drawProcessedVideoFrame(ctx, pipX, pipY, pipW, pipH);

      ctx.strokeStyle = '#7cff8b'; ctx.lineWidth = 1.5; ctx.strokeRect(pipX, pipY, pipW, pipH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pipX - 2, pipY - 2, 6, 2); ctx.fillRect(pipX - 2, pipY - 2, 2, 6);
      ctx.fillRect(pipX + pipW - 4, pipY - 2, 6, 2); ctx.fillRect(pipX + pipW, pipY - 2, 2, 6);

      const infoX = 240; const infoW = W - infoX - 18;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Pretendard, sans-serif';
      const titleLines = wrapTextLines(ctx, curTitle, infoW).slice(0, 2);
      titleLines.forEach((line, idx) => ctx.fillText(line, infoX, 50 + (idx * 18)));

      ctx.fillStyle = '#fbbf24'; ctx.font = '11px sans-serif';
      ctx.fillText(`📺 ${curChannel}`, infoX, 88);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(infoX, 98, infoW, 72);
      ctx.strokeStyle = 'rgba(124, 255, 139, 0.4)'; ctx.strokeRect(infoX, 98, infoW, 72);

      let subHeaderTag = '💬 [실시간 한글 번역 자막]';
      if (subtitleMode === "dual") subHeaderTag = '💬 [한영 동시 자막]';
      else if (subtitleMode === "orig") subHeaderTag = '💬 [영상 원문 자막]';

      ctx.fillStyle = '#a3ffa3'; ctx.font = 'bold 10.5px sans-serif';
      ctx.fillText(subHeaderTag, infoX + 8, 114);

      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Pretendard, sans-serif';
      const subLines = wrapTextLines(ctx, curSub, infoW - 16).slice(0, 2);
      subLines.forEach((line, idx) => ctx.fillText(line, infoX + 8, 134 + (idx * 18)));

    } else if (layoutMode === "video-only") {
      const vidW = 380; const vidH = 175; const vidX = (W - vidW) / 2; const vidY = 34;
      drawProcessedVideoFrame(ctx, vidX, vidY, vidW, vidH);
      ctx.strokeStyle = '#7cff8b'; ctx.lineWidth = 1.5; ctx.strokeRect(vidX, vidY, vidW, vidH);

    } else {
      // Subtitle only
      const subW = W - 36;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(18, 38, subW, 140);
      ctx.strokeStyle = 'rgba(124, 255, 139, 0.4)'; ctx.strokeRect(18, 38, subW, 140);

      ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`📺 ${curTitle} · ${curChannel}`, 30, 60);

      ctx.fillStyle = '#fde047'; ctx.font = 'bold 16px Pretendard, sans-serif';
      const bigSubLines = wrapTextLines(ctx, curSub, subW - 24).slice(0, 3);
      bigSubLines.forEach((line, idx) => ctx.fillText(line, 30, 95 + (idx * 26)));
    }

    // Timeline Progress Bar
    const progress = Math.min(1, currentTime / Math.max(1, curDuration));
    const barX = 18; const barY = 224; const barW = W - 36; const barH = 5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#7cff8b'; ctx.fillRect(barX, barY, barW * progress, barH);

    // Bottom Navigation Guide & NT Ed. Signature
    ctx.fillStyle = '#64748b'; ctx.font = '10.5px sans-serif';
    ctx.fillText('🔘 1번: 재생/일시정지 | 2번: 10초 스킵 | 3번: 모드 전환 | 길게: 홈', 18, H - 10);

    ctx.textAlign = 'right'; ctx.fillStyle = '#38bdf8';
    ctx.fillText(`NT(잘생긴아) Ed. · ${layoutMode.toUpperCase()} · ${currentFps}FPS`, W - 18, H - 10);
    ctx.textAlign = 'left';

    // Copy to preview canvas in Phone UI
    if (hudCtx) {
      hudCtx.drawImage(offscreenHudCanvas, 0, 0, W, H);
    }

    if (!encodePixels) return null;

    // 4-bit Grayscale Nibble Encoding (76,160 bytes total)
    const imgData = ctx.getImageData(0, 0, W, H).data;
    const pixels = new Uint8Array(DECODED_SIZE);
    for (let idx = 0; idx < imgData.length; idx += 8) {
      const p1 = grayscaleNibble(imgData, idx);
      const p2 = grayscaleNibble(imgData, idx + 4);
      pixels[idx / 8] = (p1 << 4) | p2;
    }

    return { width: W, height: H, stride: STRIDE, pixels };
  }

  // 8. Safe Single-Call LZ4 Glass Transmission (Zero Log Waterfall!)
  async function syncToGlasses() {
    if (isDisposed || !isActive) return; // Never paint over another app's screen (e.g. Home dashboard)
    if (isSyncing) {
      pendingSync = true;
      return;
    }

    const minInterval = Math.max(120, Math.floor(1000 / currentFps));
    const now = Date.now();
    if (now - lastSyncTime < minInterval) {
      if (!pendingSync) {
        pendingSync = true;
        setTimeout(() => {
          pendingSync = false;
          syncToGlasses();
        }, minInterval - (now - lastSyncTime));
      }
      return;
    }

    isSyncing = true;
    lastSyncTime = now;

    try {
      const frame = drawHUDCanvas(true);
      if (frame && isActive && scopedHub.display?.updateImageLz4) {
        const compressed = compressLz4(frame.pixels);
        await scopedHub.display.updateImageLz4({
          x: 0,
          y: 0,
          width: frame.width,
          height: frame.height,
          stride: frame.stride,
          decodedSize: frame.pixels.length,
          dataBase64: toBase64(compressed)
        });
      }
    } catch (err) {
      console.warn('[YouTube Streamer] syncToGlasses 경고:', err);
    } finally {
      isSyncing = false;
      if (pendingSync && isActive && !isDisposed) {
        pendingSync = false;
        setTimeout(syncToGlasses, 40);
      } else {
        pendingSync = false;
      }
    }
  }

  function startGlassesSyncTimer() {
    if (syncTimerIntervalId) clearInterval(syncTimerIntervalId);
    const intervalMs = Math.max(120, Math.floor(1000 / currentFps));
    syncTimerIntervalId = setInterval(() => {
      if (!isPlaying || isDisposed || !isActive) return; // Freeze when paused or suspended!
      syncToGlasses();
    }, intervalMs);
  }

  // 9. UI Updates & Controls
  function updateTimeUI() {
    const maxDur = isDirectVideoPlaying ? (htmlVideo.duration || 596) : (isCustomYtPlaying ? totalDuration : YOUTUBE_PRESETS[currentPresetIdx].duration);
    if (timeCurrent) timeCurrent.textContent = formatTime(currentTime);
    if (timeTotal) timeTotal.textContent = formatTime(maxDur);
    if (progressBar) progressBar.value = Math.floor((currentTime / Math.max(1, maxDur)) * 100);
    const curSub = getCurrentSubtitle();
    if (subtitleBox) subtitleBox.textContent = `"${curSub}"`;
    if (txtLiveSubtitle) txtLiveSubtitle.textContent = `"${curSub}"`;
  }

  function togglePlayPause() {
    isPlaying = !isPlaying;
    if (playPauseIcon) playPauseIcon.textContent = isPlaying ? "⏸️" : "▶️";
    if (playPauseLabel) playPauseLabel.textContent = isPlaying ? "일시정지" : "재생";
    if (playerModeBadge) playerModeBadge.textContent = isPlaying ? "▶ 재생 중" : "⏸️ 일시정지";

    if (isDirectVideoPlaying && htmlVideo) {
      if (isPlaying) safePlay();
      else htmlVideo.pause();
    }

    drawHUDCanvas(true);
    syncToGlasses();
  }

  function skipTime(delta) {
    const maxDur = isDirectVideoPlaying ? (htmlVideo.duration || 596) : (isCustomYtPlaying ? totalDuration : YOUTUBE_PRESETS[currentPresetIdx].duration);
    currentTime = Math.max(0, Math.min(maxDur, currentTime + delta));

    if (isDirectVideoPlaying && htmlVideo) {
      htmlVideo.currentTime = currentTime;
    }

    updateTimeUI();
    drawHUDCanvas(true);
    syncToGlasses();
  }

  function cycleLayout() {
    const layouts = ["hybrid", "video-only", "subtitle-only"];
    const curIdx = layouts.indexOf(layoutMode);
    layoutMode = layouts[(curIdx + 1) % layouts.length];
    if (selectLayout) selectLayout.value = layoutMode;
    drawHUDCanvas(true);
    syncToGlasses();
  }

  // Button Listeners
  if (btnPlayPause) btnPlayPause.addEventListener("click", togglePlayPause);
  if (btnSkipBackward) btnSkipBackward.addEventListener("click", () => skipTime(-10));
  if (btnSkipForward) btnSkipForward.addEventListener("click", () => skipTime(10));
  if (btnCycleLayout) btnCycleLayout.addEventListener("click", cycleLayout);

  // Audio helpers: browsers block unmuted autoplay once the click gesture expires (e.g. after a slow yt-dlp resolve).
  // Try with sound first; if blocked, keep the video running muted and ask the user for one tap.
  function updateMuteUI() {
    if (!btnToggleMute || !htmlVideo) return;
    if (!isDirectVideoPlaying) {
      btnToggleMute.textContent = "🔈 프리셋은 무음";
    } else if (audioBlocked) {
      btnToggleMute.textContent = "🔇 탭해서 소리 켜기";
    } else {
      btnToggleMute.textContent = htmlVideo.muted ? "🔇 음소거됨" : "🔊 소리 켬";
    }
  }

  async function safePlay() {
    if (!htmlVideo) return;
    htmlVideo.muted = isMuted;
    try {
      await htmlVideo.play();
      audioBlocked = false;
    } catch (err) {
      if (err && err.name === 'NotAllowedError' && !isMuted) {
        htmlVideo.muted = true;
        audioBlocked = true;
        try { await htmlVideo.play(); } catch (e) { console.warn('[Video] play blocked:', e); }
      } else {
        console.warn('[Video] play notice:', err);
      }
    }
    updateMuteUI();
  }

  if (btnToggleMute) {
    btnToggleMute.addEventListener("click", async () => {
      if (!htmlVideo) return;
      if (audioBlocked) {
        // This click is a fresh user gesture → unmuted playback is now allowed
        isMuted = false;
        audioBlocked = false;
        htmlVideo.muted = false;
        if (htmlVideo.paused && isPlaying) await htmlVideo.play().catch(() => {});
      } else {
        isMuted = !isMuted;
        htmlVideo.muted = isMuted;
      }
      updateMuteUI();
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  if (progressBar) {
    progressBar.addEventListener("input", (e) => {
      const maxDur = isDirectVideoPlaying ? (htmlVideo.duration || 596) : (isCustomYtPlaying ? totalDuration : YOUTUBE_PRESETS[currentPresetIdx].duration);
      const pct = parseInt(e.target.value, 10);
      currentTime = (pct / 100) * maxDur;
      if (isDirectVideoPlaying && htmlVideo) {
        htmlVideo.currentTime = currentTime;
      }
      updateTimeUI();
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  // Preset Chips
  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      presetChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      isCustomYtPlaying = false;
      isScreenMirroring = false;
      isDirectVideoPlaying = false;
      if (htmlVideo) {
        htmlVideo.pause();
        htmlVideo.style.display = "none";
      }
      if (simVideoCanvas) simVideoCanvas.style.display = "block";
      if (ytIframeContainer) ytIframeContainer.style.display = "none";

      const pIdx = parseInt(chip.dataset.preset, 10);
      currentPresetIdx = pIdx;
      currentTime = 0;
      updateMuteUI();

      const preset = YOUTUBE_PRESETS[pIdx];
      if (txtVideoTitle) txtVideoTitle.textContent = preset.title;
      if (inputYtUrl) inputYtUrl.value = "";
      updateTimeUI();
      drawHUDCanvas(true);
      syncToGlasses();
    });
  });

  // Options Selectors
  if (selectFps) {
    selectFps.addEventListener("change", (e) => {
      currentFps = parseInt(e.target.value, 10);
      if (badgeFps) badgeFps.textContent = `${currentFps} FPS · BLE 스트리밍`;
      startGlassesSyncTimer();
    });
  }

  if (selectDither) {
    selectDither.value = ditherMode;
    selectDither.addEventListener("change", (e) => {
      ditherMode = e.target.value;
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  if (selectLayout) {
    selectLayout.addEventListener("change", (e) => {
      layoutMode = e.target.value;
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  if (selectSubMode) {
    selectSubMode.addEventListener("change", (e) => {
      subtitleMode = e.target.value;
      if (subLangBadge) {
        if (subtitleMode === "ko") {
          subLangBadge.textContent = "실시간 한글 번역 ON";
          subLangBadge.style.color = "#7cff8b";
        } else if (subtitleMode === "dual") {
          subLangBadge.textContent = "한영 동시 모드";
          subLangBadge.style.color = "#38bdf8";
        } else {
          subLangBadge.textContent = "원문 자막 모드";
          subLangBadge.style.color = "#fbbf24";
        }
      }
      updateTimeUI();
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  // Custom YouTube URL Loader
  function extractYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  async function loadCustomYouTubeVideo(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      alert("유효한 유튜브 링크를 입력해 주세요!\n(예: https://www.youtube.com/watch?v=... 또는 https://youtu.be/...)");
      return;
    }

    isScreenMirroring = false;
    presetChips.forEach(c => c.classList.remove("active"));
    currentTime = 0;
    totalDuration = 300;
    customYtSubtitles = [];

    if (txtVideoTitle) txtVideoTitle.textContent = "⏳ 실제 유튜브 동영상 스트림 로딩 중...";

    // 1. Thumbnail load
    const thumb = new Image();
    thumb.crossOrigin = "anonymous";
    thumb.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    thumb.onload = () => {
      customYtThumbnail = thumb;
      if (!isDirectVideoPlaying) {
        drawHUDCanvas(true);
        syncToGlasses();
      }
    };

    // 2. Stream proxy query (User Custom Proxy / Local)
    let proxySuccess = false;
    const candidateBases = [];
    if (window.location.port === "8089") candidateBases.push("");

    // 개인 프록시 서버: 사용자가 통합 설정(Vault)이나 설정에 명시적으로 입력했을 때만 연결 (테스터 배포 시 NAS IP 완전 은닉)
    let customProxy = "";
    try {
      if (typeof vault !== "undefined" && vault.get) {
        customProxy = vault.get("youtube.proxyServer", "");
      }
    } catch (_) {}
    if (!customProxy) {
      customProxy = localStorage.getItem("yt_custom_proxy") || "";
    }
    if (customProxy && customProxy.trim()) {
      candidateBases.push(customProxy.trim().replace(/\/$/, ""));
    } else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      candidateBases.push("http://127.0.0.1:8089");
    }

    for (const base of candidateBases) {
      try {
        const resolveRes = await fetch(`${base}/api/resolve?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(1200) });
        if (resolveRes.ok) {
          const data = await resolveRes.json();
          if (data && (data.stream_proxy || data.title)) {
            customYtTitle = data.title || `유튜브 영상 (${videoId})`;
            customYtChannel = data.author || "YouTube";
            if (data.duration > 0) totalDuration = data.duration;
            if (data.subtitles && Array.isArray(data.subtitles)) customYtSubtitles = data.subtitles;

            if (txtVideoTitle) txtVideoTitle.textContent = customYtTitle;

            if (htmlVideo) {
              htmlVideo.crossOrigin = "anonymous";
              htmlVideo.src = data.stream_proxy.startsWith("http") ? data.stream_proxy : `${base}${data.stream_proxy}`;
              htmlVideo.style.display = "block";
              if (simVideoCanvas) simVideoCanvas.style.display = "none";
              isDirectVideoPlaying = true;
              await safePlay();
              isPlaying = true;
              if (playPauseIcon) playPauseIcon.textContent = "⏸️";
              if (playPauseLabel) playPauseLabel.textContent = "일시정지";
            }

            isDirectVideoPlaying = true;
            isCustomYtPlaying = true;
            proxySuccess = true;
            updateTimeUI();
            drawHUDCanvas(true);
            syncToGlasses();
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // 3. Fallback: IFrame + Ken Burns mode
    if (!proxySuccess) {
      isDirectVideoPlaying = false;
      isCustomYtPlaying = true;
      try {
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (res.ok) {
          const data = await res.json();
          customYtTitle = data.title || `유튜브 영상 (${videoId})`;
          customYtChannel = data.author_name || "YouTube";
        }
      } catch (e) {
        customYtTitle = `유튜브 영상 (${videoId})`;
        customYtChannel = "YouTube";
      }
      if (txtVideoTitle) txtVideoTitle.textContent = customYtTitle;

      if (ytIframeContainer) {
        ytIframeContainer.innerHTML = `<iframe id="ytIframePlayer" width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        ytIframeContainer.style.display = "block";
      }
      if (htmlVideo) htmlVideo.style.display = "none";
      if (simVideoCanvas) simVideoCanvas.style.display = "block";

      updateTimeUI();
      drawHUDCanvas(true);
      syncToGlasses();
    }
  }

  if (btnLoadYt && inputYtUrl) {
    btnLoadYt.addEventListener("click", () => {
      const url = inputYtUrl.value.trim();
      loadCustomYouTubeVideo(url);
    });
    inputYtUrl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const url = inputYtUrl.value.trim();
        loadCustomYouTubeVideo(url);
      }
    });
  }

  // Screen Mirroring Button
  if (btnScreenMirror) {
    btnScreenMirror.addEventListener("click", async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "never" },
          audio: false
        });
        if (screenMirrorVideo) {
          screenMirrorVideo.srcObject = stream;
          screenMirrorVideo.play();
          isScreenMirroring = true;
          isCustomYtPlaying = false;
          isDirectVideoPlaying = false;
          if (txtVideoTitle) txtVideoTitle.textContent = "🔴 브라우저 탭 실시간 화면 미러링";
          drawHUDCanvas(true);
          syncToGlasses();
        }
      } catch (err) {
        alert("화면 공유가 취소되었거나 지원되지 않는 환경입니다.");
      }
    });
  }

  // Sample MP4 Button
  if (btnPlaySampleMp4) {
    btnPlaySampleMp4.addEventListener("click", () => {
      if (!htmlVideo) return;
      isCustomYtPlaying = false;
      isScreenMirroring = false;
      isDirectVideoPlaying = true;
      htmlVideo.crossOrigin = "anonymous";
      htmlVideo.src = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
      htmlVideo.style.display = "block";
      if (simVideoCanvas) simVideoCanvas.style.display = "none";
      safePlay();
      isPlaying = true;
      if (txtVideoTitle) txtVideoTitle.textContent = "🎬 Big Buck Bunny (직접 MP4 스트리밍)";
      drawHUDCanvas(true);
      syncToGlasses();
    });
  }

  // Return to Home Button
  const btnHome = root.querySelector('[data-action="home"]');
  if (btnHome) {
    btnHome.addEventListener('click', () => {
      navigate('home'); // Hub lifecycle → 'suspended' pauses video, audio and glass sync
    });
  }

  // 10. Hardware Temple Buttons
  const unsubButton = scopedHub.device.onButton((e) => {
    const act = String(e?.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    if (isSingle) {
      togglePlayPause();
    } else if (isDouble) {
      skipTime(10);
    } else if (isTriple) {
      cycleLayout();
    }
  });

  // 11. Start Engines & Glass Page Creation
  startVideoEngine();
  startGlassesSyncTimer();
  updateMuteUI();

  if (scopedHub.display?.createPage) {
    await scopedHub.display.createPage().catch(() => {});
  }
  drawHUDCanvas(true);
  syncToGlasses();

  // 12. Suspend / Resume (module stays mounted, so re-entering keeps the same video & settings)
  function suspend() {
    if (!isActive) return;
    isActive = false;
    pendingSync = false;
    if (syncTimerIntervalId) { clearInterval(syncTimerIntervalId); syncTimerIntervalId = null; }
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    wasPlayingBeforeSuspend = !!(isDirectVideoPlaying && htmlVideo && !htmlVideo.paused);
    if (htmlVideo && !htmlVideo.paused) htmlVideo.pause(); // stop audio when leaving the app
  }

  function resume() {
    if (isActive || isDisposed) return;
    isActive = true;
    lastSyncTime = 0;
    startVideoEngine();
    startGlassesSyncTimer();
    if (wasPlayingBeforeSuspend && isPlaying) safePlay();
    drawHUDCanvas(true);
    syncToGlasses();
  }

  // 13. Cleanup Handler (only on real runtime stop)
  function cleanup() {
    isDisposed = true;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (syncTimerIntervalId) clearInterval(syncTimerIntervalId);
    if (htmlVideo) {
      htmlVideo.pause();
      htmlVideo.src = "";
    }
    if (screenMirrorVideo && screenMirrorVideo.srcObject) {
      screenMirrorVideo.srcObject.getTracks().forEach(t => t.stop());
    }
    if (unsubButton) unsubButton();
  }

  scopedHub.on('runtime.lifecycleChanged', (e) => {
    if (e.state === 'stopped' || e.state === 'closed') {
      cleanup();
    } else if (e.state === 'suspended') {
      suspend();
    } else if (e.state === 'running') {
      resume();
    }
  });
}
