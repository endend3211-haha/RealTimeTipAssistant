export default `
<div class="module-container">
  <div class="module-header">
    <div class="header-left">
      <span class="module-badge">YouTube HUD Streamer</span>
      <h2>유튜브 비디오 & 실시간 자막</h2>
    </div>
    <div class="header-right">
      <button class="btn-home-return" data-action="home">◀ 안경 홈 복귀</button>
    </div>
  </div>

  <!-- 1. 유튜브 URL 입력 바 -->
  <div class="yt-input-card">
    <div class="card-title">유튜브 영상 불러오기</div>
    <div class="input-row">
      <input type="text" id="inputYtUrl" placeholder="유튜브 링크 입력 (예: https://youtu.be/... 또는 watch?v=...)" />
      <button id="btnLoadYt" class="btn-primary">▶ 불러오기</button>
    </div>
    <div class="mirror-action-row">
      <button id="btnScreenMirror" class="btn-mirror" title="지금 크롬에서 보고 있는 유튜브 탭을 100% 실시간 영상으로 안경에 캡처 미러링">
        🔴 브라우저 탭 실시간 화면 미러링
      </button>
      <button id="btnPlaySampleMp4" class="btn-ctrl btn-highlight" title="CORS 제한 없는 실제 움직이는 동영상 직접 스트리밍">
        🎬 실제 MP4 동영상 직접 스트리밍
      </button>
    </div>
    <p class="yt-hint">✨ 유튜브 링크를 넣으면 <b>폰에서 재생</b>되고, 안경 HUD로 <b>실시간 560×272 고화질 비디오 프레임과 한글 자막</b>이 1초의 지연 없이 투사됩니다!</p>
  </div>

  <!-- 2. 시뮬레이터 즉시 체험 프리셋 (원클릭) -->
  <div class="preset-section">
    <div class="card-title">💡 시뮬레이터 즉시 체험 프리셋 (네트워크 제한 없이 원클릭 재생)</div>
    <div class="preset-scroll-row">
      <button class="btn-preset-chip active" data-preset="0">🎮 [토크] 침착맨 삼국지 꿀잼</button>
      <button class="btn-preset-chip" data-preset="1">🚀 [과학] SpaceX 스타십 5차 발사</button>
      <button class="btn-preset-chip" data-preset="2">🎵 [K-POP] NewJeans - Ditto MV</button>
      <button class="btn-preset-chip" data-preset="3">🧠 [테크] 스마트 안경 실사용기</button>
    </div>
  </div>

  <!-- 3. 폰 실시간 통합 비디오 플레이어 (단일 화면) -->
  <div class="yt-unified-player-card">
    <div class="player-top-row">
      <div class="title-wrap">
        <span class="video-icon">📺</span>
        <span id="txtVideoTitle" class="video-title">🎮 침착맨 삼국지 영걸전 완전 정복</span>
      </div>
      <div class="badge-wrap">
        <span class="player-mode-badge" id="playerModeBadge">▶ 재생 중</span>
        <span id="badgeFps" class="fps-badge">4 FPS · BLE 스트리밍</span>
      </div>
    </div>

    <!-- 단일 비디오 스크린 (폰 재생 + 안경 HUD 캡처 원천) -->
    <div class="unified-video-wrap">
      <video id="htmlVideo" playsinline loop crossorigin="anonymous"></video>
      <video id="screenMirrorVideo" playsinline muted autoplay style="display:none;"></video>
      <canvas id="simVideoCanvas" width="480" height="270"></canvas>
      <div id="ytIframeContainer" style="width:100%; height:100%; display:none;"></div>
      <div class="subtitle-overlay" id="txtLiveSubtitle">"관우와 장비가 군사를 이끌고 형주로 진격하는데..."</div>
    </div>

    <!-- 재생 타임라인 바 -->
    <div class="timeline-row">
      <span class="time-label" id="timeCurrent">00:15</span>
      <div class="progress-track" id="progressTrack">
        <input type="range" id="progressBar" min="0" max="100" value="5" style="width:100%; cursor:pointer;" />
      </div>
      <span class="time-label" id="timeTotal">05:00</span>
    </div>

    <!-- 통합 재생 컨트롤 바 -->
    <div class="playback-controls">
      <button id="btnSkipBackward" class="btn-ctrl">⏪ -10초</button>
      <button id="btnPlayPause" class="btn-ctrl btn-highlight">
        <span id="playPauseIcon">⏸️</span> <span id="playPauseLabel">일시정지</span>
      </button>
      <button id="btnSkipForward" class="btn-ctrl">⏩ +10초</button>
      <button id="btnToggleMute" class="btn-ctrl">🔊 소리 켬</button>
      <button id="btnCycleLayout" class="btn-ctrl">🖥️ 모드 전환</button>
    </div>
  </div>

  <!-- 4. 스트리밍 옵션 설정 (FPS, 디더링 모드, 레이아웃, 자막 모드) -->
  <div class="options-card">
    <div class="card-title">⚙️ 스트리밍 상세 옵션 설정</div>
    <div class="options-grid">
      <div class="option-item">
        <label for="selectFps">전송 프레임 (FPS)</label>
        <select id="selectFps">
          <option value="2">2 FPS (초절전 · 배터리 최우선)</option>
          <option value="4" selected>4 FPS (추천 · 안정적 밸런스)</option>
          <option value="6">6 FPS (부드러운 움직임)</option>
        </select>
      </div>

      <div class="option-item">
        <label for="selectDither">Micro-OLED 디더링 모드</label>
        <select id="selectDither">
          <option value="grayscale" selected>4-bit 그레이스케일 (부드러운 음영 - 기본값)</option>
          <option value="floyd">고대비 흑백 디더링 (선명도 극대화)</option>
          <option value="edge">사이버펑크 엣지 윤곽선 (SF 아웃라인)</option>
        </select>
      </div>

      <div class="option-item">
        <label for="selectLayout">HUD 디스플레이 레이아웃</label>
        <select id="selectLayout">
          <option value="hybrid" selected>하이브리드 PIP (미니영상 + 실시간 자막)</option>
          <option value="video-only">전체화면 영상 중심 (Wide Video)</option>
          <option value="subtitle-only">자막 &amp; 타임라인 전용 (초절전 모드)</option>
        </select>
      </div>

      <div class="option-item">
        <label for="selectSubMode">실시간 자막 언어</label>
        <select id="selectSubMode">
          <option value="ko" selected>한글 번역 자막 (100% 한국어 번역)</option>
          <option value="dual">한영 동시 자막 (한글 + 원문)</option>
          <option value="orig">원문 자막 그대로</option>
        </select>
      </div>
    </div>
  </div>

  <!-- 5. 실시간 자막 모니터 -->
  <div class="subtitle-monitor-card">
    <div class="subtitle-monitor-header">
      <span class="sub-tag">💬 현재 재생 자막 (실시간 안경 동기화)</span>
      <span class="sub-lang" id="subLangBadge">실시간 한글 번역 ON</span>
    </div>
    <div class="subtitle-box" id="subtitleBox">
      "관우와 장비가 군사를 이끌고 형주로 진격하는데, 이때 제갈량의 신묘한 계책이 적들의 허를 찌르게 됩니다."
    </div>
  </div>

  <!-- 6. 안경 시야(Micro-OLED) 가상 HUD 뷰포트 프리뷰 (560 × 272) -->
  <div class="hud-viewport-card">
    <div class="hud-card-header">
      <span class="hud-tag">👓 안경 시야 실시간 투사 프리뷰 (560 × 272)</span>
      <span class="hud-mono-tag">Micro-OLED 단색 녹색 / 화이트</span>
    </div>
    <div class="canvas-wrapper">
      <canvas id="hudCanvas" width="560" height="272"></canvas>
    </div>
  </div>

  <!-- 7. 안경 조작 가이드 -->
  <div class="guide-box">
    <div class="guide-title">안경 템플 버튼 조작 안내</div>
    <div class="guide-item"><span>1번 클릭</span> 영상 재생 / 일시정지 토글</div>
    <div class="guide-item"><span>2번 클릭</span> 10초 앞으로 건너뛰기</div>
    <div class="guide-item"><span>3번 클릭</span> 화면 모드 전환 (하이브리드 PIP ⇄ 와이드 ⇄ 자막 전용)</div>
    <div class="guide-item highlight"><span>길게 누름</span> 🚨 언제든 안경 홈 대시보드로 복귀</div>
  </div>
</div>
`;
