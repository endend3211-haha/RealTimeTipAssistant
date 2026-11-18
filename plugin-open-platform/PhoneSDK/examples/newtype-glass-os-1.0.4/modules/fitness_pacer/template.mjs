export default `
<div class="module-container">
  <div class="module-header">
    <div class="header-left">
      <span class="module-badge">Fitness Pacer</span>
      <h2>스마트 러닝 페이서 HUD</h2>
    </div>
    <div class="header-right">
      <button class="btn-home-return" data-action="home">◀ 안경 홈 복귀</button>
    </div>
  </div>

  <div class="nav-control-grid">
    <div class="mode-toggle">
      <button id="btnModeRun" class="mode-btn active">🏃 러닝 (목표 5'30")</button>
      <button id="btnModeWalk" class="mode-btn">🚶 산책 (목표 12'00")</button>
    </div>
    <div class="nav-state-badge" id="fitnessStateBadge">대기 중</div>
  </div>

  <div class="route-search-card">
    <div class="stat-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
        <div style="font-size: 11px; color: #94a3b8;">실시간 페이스</div>
        <div id="metricPace" style="font-size: 20px; font-weight: bold; color: #ffffff;">0'00"</div>
      </div>
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
        <div style="font-size: 11px; color: #94a3b8;">총 이동거리</div>
        <div id="metricDist" style="font-size: 20px; font-weight: bold; color: #38bdf8;">0.00 km</div>
      </div>
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
        <div style="font-size: 11px; color: #94a3b8;">운동 시간</div>
        <div id="metricTime" style="font-size: 20px; font-weight: bold; color: #4ade80;">00:00</div>
      </div>
    </div>
    <div class="stat-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); text-align: center;">
        <div style="font-size: 10px; color: #94a3b8;">현재 속도</div>
        <div id="metricSpeed" style="font-size: 14px; font-weight: bold; color: #ffffff;">0.0 km/h</div>
      </div>
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); text-align: center;">
        <div style="font-size: 10px; color: #94a3b8;">소모 칼로리</div>
        <div id="metricCal" style="font-size: 14px; font-weight: bold; color: #fde047;">0 kcal</div>
      </div>
      <div class="stat-card" style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); text-align: center;">
        <div style="font-size: 10px; color: #94a3b8;">케이던스</div>
        <div id="metricCadence" style="font-size: 14px; font-weight: bold; color: #ffffff;">0 spm</div>
      </div>
    </div>
  </div>

  <div class="sim-actions">
    <button id="btnToggleWorkout" class="btn-action">🏃 러닝 운동 시작</button>
    <button id="btnLiveGps" class="btn-action secondary">📡 스마트폰 실시간 GPS</button>
  </div>

  <div class="guide-box">
    <div class="guide-title">안경 템플 버튼 조작 안내</div>
    <div class="guide-item"><span>1번 클릭</span> 운동 일시정지 ⇄ 재개 토글</div>
    <div class="guide-item"><span>2번 클릭</span> 러닝(5'30") ⇄ 산책(12'00") 모드 전환</div>
    <div class="guide-item"><span>3번 클릭</span> 📡 스마트폰 실시간 GPS 토글</div>
    <div class="guide-item highlight"><span>길게 누름</span> 🚨 언제든 안경 홈 대시보드로 복귀</div>
  </div>
</div>
`;
