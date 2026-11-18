export default `
<div class="module-container">
  <div class="module-header">
    <div class="header-left">
      <span class="module-badge">K-Transit HUD</span>
      <h2>전국 실시간 대중교통 (지하철 · 버스)</h2>
    </div>
    <div class="header-right">
      <button class="btn-home-return" data-action="home">◀ 안경 홈 복귀</button>
    </div>
  </div>

  <!-- GPS Station Location Tag & Action -->
  <div class="nav-control-grid" style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
    <div class="transit-station-tag" id="currentStationTag" style="flex: 1; padding: 10px 14px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; font-weight: bold; color: #38bdf8; font-size: 13px; display: flex; align-items: center; justify-content: space-between;">
      <span id="txtStationName">📍 서울 강남역 사거리</span>
      <span id="txtGpsStatus" style="font-size: 11px; color: #00ff9d; font-family: monospace;">[📡 GPS 실시간]</span>
    </div>
    <button id="btnGpsTransit" class="btn-action secondary" style="width: auto; padding: 10px 14px; font-size: 12px; margin: 0; white-space: nowrap;">📡 GPS 재탐색</button>
  </div>

  <!-- 🚇 지하철 vs 🚌 버스 모드 선택 세그먼트 (User Request 핵심!) -->
  <div class="mode-toggle transit-mode-selector" style="display: flex; gap: 8px; margin-bottom: 14px;">
    <button class="mode-btn active" id="btnModeMetro" data-mode="METRO" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
      <span style="font-size: 14px;">🚇</span>
      <span>지하철 모드</span>
      <span class="mode-count" id="countMetro" style="font-size: 11px; background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 10px;">0</span>
    </button>
    <button class="mode-btn" id="btnModeBus" data-mode="BUS" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
      <span style="font-size: 14px;">🚌</span>
      <span>버스 모드</span>
      <span class="mode-count" id="countBus" style="font-size: 11px; background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 10px;">0</span>
    </button>
    <button class="mode-btn" id="btnModeAll" data-mode="ALL" style="display: flex; align-items: center; justify-content: center; gap: 6px;">
      <span style="font-size: 14px;">🌐</span>
      <span>통합 전체</span>
      <span class="mode-count" id="countAll" style="font-size: 11px; background: rgba(0,0,0,0.4); padding: 1px 6px; border-radius: 10px;">0</span>
    </button>
  </div>

  <!-- 주요 환승 거점 퀵 프리셋 (서울, 부산, 경기) -->
  <div class="quick-routes" style="margin-bottom: 14px;">
    <span class="quick-label">환승 거점:</span>
    <button class="chip active" data-station="gangnam">서울 강남역</button>
    <button class="chip" data-station="seomyeon">부산 서면역</button>
    <button class="chip" data-station="centum">부산 센텀시티</button>
    <button class="chip" data-station="haeundae">부산 해운대역</button>
    <button class="chip" data-station="bs_station">부산역 광장</button>
    <button class="chip" data-station="pangyo">경기 판교역</button>
  </div>

  <!-- 현재 안경 HUD 실시간 송출 카드 -->
  <div class="transit-card" style="margin-bottom: 14px; background: rgba(11, 21, 40, 0.85); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 10px; padding: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 11px; font-weight: 800; color: #00f0ff; font-family: monospace;">🕶️ 안경 HUD 송출 중</span>
        <span id="badgeCurrentMode" style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 800;">지하철</span>
      </div>
      <span id="txtHudIndex" style="font-size: 11px; color: #94a3b8; font-family: monospace;">(1/3)</span>
    </div>

    <div id="activeHudCard" style="padding: 12px 14px; background: rgba(3, 7, 18, 0.7); border: 1px solid rgba(0, 255, 157, 0.35); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
        <div>
          <span id="activeBadge" class="badge sub-line2" style="font-size: 12px;">2호선 강남역</span>
          <div id="activeDest" style="font-size: 12px; color: #cbd5e1; margin-top: 4px;">외선순환 (선릉·잠실 방면)</div>
        </div>
        <div style="text-align: right;">
          <div id="activeEta" style="font-size: 24px; font-weight: 900; color: #fde047; font-family: monospace; line-height: 1;">01:50</div>
          <span style="font-size: 10px; color: #94a3b8;">도착 예정</span>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; margin-top: 6px;">
        <span id="activeStatus">🚩 1번째 전 · 교대역 출발</span>
        <span id="activeCrowded" style="color: #f87171; font-weight: bold;">혼잡</span>
      </div>
    </div>
  </div>

  <!-- 정류장 / 역 도착 노선 목록 (터치 시 안경 HUD 전환) -->
  <div class="transit-card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <div class="card-title" id="transitListTitle" style="margin-bottom: 0;">실시간 도착 노선 목록</div>
      <span style="font-size: 11px; color: #94a3b8;">※ 터치 시 안경에 즉시 고정</span>
    </div>
    <div class="transit-list" id="transitListContainer">
      <!-- 동적 생성 -->
    </div>
  </div>

  <!-- 안경 조작 안내 -->
  <div class="guide-box">
    <div class="guide-title">안경 조작 매뉴얼 (TEMPLE CONTROLLER)</div>
    <div class="guide-item"><span>1번 클릭</span> ⏱️ 실시간 잔여시간 새로고침 (-15초 시뮬레이션)</div>
    <div class="guide-item"><span>2번 클릭</span> 🔄 다음 도착 노선으로 순환 전환</div>
    <div class="guide-item"><span>3번 클릭</span> 🔀 🚇 지하철 ↔ 🚌 버스 ↔ 🌐 전체 모드 원터치 전환!</div>
    <div class="guide-item highlight"><span>길게 누름</span> 🚨 비상 워프: 안경 홈 대시보드로 즉시 복귀</div>
  </div>
</div>
`;
