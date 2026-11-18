export default `
<div class="module-container">
  <div class="module-header">
    <div class="header-left">
      <span class="module-badge">K-Way 길안내</span>
      <h2>도보 · 차량 스마트 HUD</h2>
    </div>
    <div class="header-right">
      <button class="btn-home-return" data-action="home">◀ 안경 홈 복귀</button>
    </div>
  </div>

  <div class="nav-control-grid">
    <div class="mode-toggle">
      <button id="btnModeWalk" class="mode-btn active">🚶 도보 모드</button>
      <button id="btnModeDrive" class="mode-btn">🚗 차량 모드</button>
    </div>
    <div class="nav-state-badge" id="navStateBadge">대기 중</div>
  </div>

  <div class="route-search-card">
    <div class="search-input-row">
      <input type="text" id="routeQueryInput" placeholder="목적지 검색 (예: 해운대 해수욕장, 강남역, 코엑스)" />
      <button id="btnSearchRoute" class="btn-primary">경로 탐색</button>
    </div>
    <div class="quick-routes">
      <span class="quick-label">빠른 추천:</span>
      <button class="chip" data-quick="0">해운대</button>
      <button class="chip" data-quick="1">광안리</button>
      <button class="chip" data-quick="2">센텀시티</button>
    </div>
  </div>

  <div class="sim-actions">
    <button id="btnToggleSim" class="btn-action">🚶 도보 모의 산책 시작</button>
    <button id="btnLiveGps" class="btn-action secondary">📡 스마트폰 실시간 GPS</button>
  </div>

  <div class="guide-box">
    <div class="guide-title">안경 템플 버튼 조작 안내</div>
    <div class="guide-item"><span>1번 클릭</span> 다음 분기점으로 즉시 수동 전진</div>
    <div class="guide-item"><span>2번 클릭</span> 도보 ⇄ 차량 모드 즉시 전환</div>
    <div class="guide-item"><span>3번 클릭</span> 현위치 GPS 재탐색</div>
    <div class="guide-item highlight"><span>길게 누름</span> 🚨 언제든 안경 홈 대시보드로 복귀</div>
  </div>
</div>
`;

