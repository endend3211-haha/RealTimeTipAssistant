export default `
<div class="module-container">
  <div class="module-header">
    <div class="header-left">
      <span class="module-badge">K-Stock & Crypto</span>
      <h2>국내 주식 · 코인 실시간 HUD</h2>
    </div>
    <div class="header-right">
      <button class="btn-home-return" data-action="home">◀ 안경 홈 복귀</button>
    </div>
  </div>

  <!-- 종목 직접 추가 섹션 -->
  <div class="stock-add-card">
    <div class="card-title">관심 종목 추가</div>
    <div class="input-row">
      <input type="text" id="inpAddStock" placeholder="종목코드 / 심볼 입력 (예: 005930, 035720, BTC, TSLA)" />
      <button id="btnAddStock" class="btn-primary">+ 추가</button>
    </div>
    <div class="preset-chips-row">
      <span class="quick-label">빠른 추천:</span>
      <button class="chip-preset" data-code="005930" data-name="삼성전자">+ 삼성전자</button>
      <button class="chip-preset" data-code="000660" data-name="SK하이닉스">+ SK하이닉스</button>
      <button class="chip-preset" data-code="035720" data-name="카카오">+ 카카오</button>
      <button class="chip-preset" data-code="035420" data-name="NAVER">+ NAVER</button>
      <button class="chip-preset" data-code="BTC" data-name="비트코인">+ BTC</button>
      <button class="chip-preset" data-code="NVDA" data-name="NVIDIA">+ NVDA</button>
      <button class="chip-preset" data-code="TSLA" data-name="테슬라">+ TSLA</button>
    </div>
  </div>

  <!-- 현재 관심 종목 리스트 (삭제 가능) -->
  <div class="watchlist-card">
    <div class="card-header-row">
      <div class="card-title">내 관심 종목 리스트 (<span id="stockCountBadge">0</span>)</div>
      <small class="muted-hint">터치 시 안경에 즉시 표시</small>
    </div>
    <div class="stock-list" id="stockListContainer">
      <!-- 동적 생성 -->
    </div>
  </div>

  <div class="guide-box">
    <div class="guide-title">안경 템플 버튼 조작 안내</div>
    <div class="guide-item"><span>1번 클릭</span> 현재 종목 상세 / 일봉 차트 토글</div>
    <div class="guide-item"><span>2번 클릭</span> 다음 관심 종목으로 순환 전환</div>
    <div class="guide-item"><span>3번 클릭</span> 실시간 호가/시세 즉시 새로고침</div>
    <div class="guide-item highlight"><span>길게 누름</span> 🚨 언제든 안경 홈 대시보드로 복귀</div>
  </div>
</div>
`;
