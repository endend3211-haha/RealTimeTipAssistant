export default `<link rel="stylesheet" href="./theme.css">
<nav class="glow-navigation"><a href="#">← GLOW 홈</a></nav>
<main class="console">
  <h1>네이버 지도 길안내</h1>
  <p>업데이트 예정 · 실제 목적지 검색 및 경로 안내</p>
  <section>
    <p id="navStatus" role="status">샘플 경로로 안경 길안내를 확인할 수 있습니다.</p>
    <button class="primary" id="demoRoute" type="button">샘플 길안내 시작</button>
    <button id="stopRoute" type="button" hidden>샘플 종료</button>
    <canvas id="routeMap" width="480" height="240" aria-label="샘플 경로 지도"></canvas>
  </section>
</main>`;
