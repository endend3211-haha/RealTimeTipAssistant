export default `<link rel="stylesheet" href="./megadrive/style.css">
<main><nav class="glow-navigation"><a href="#">← GLOW 홈</a></nav>
    <header>
      <p class="eyebrow">MEGA DRIVE / GLASS ARCADE</p>
      <h1>Street Fighter II′ Plus</h1>
      <p class="edition">CHAMPION EDITION</p>
      <p id="status" role="status">게임 불러오는 중…</p>
    </header>
    <section class="pad" aria-label="Mega Drive 6버튼 조이패드">
      <div class="dpad" aria-label="방향 패드">
        <button type="button" data-key="ArrowUp" aria-label="위">▲</button>
        <button type="button" data-key="ArrowLeft" aria-label="왼쪽">◀</button>
        <span class="pivot" aria-hidden="true"></span>
        <button type="button" data-key="ArrowRight" aria-label="오른쪽">▶</button>
        <button type="button" data-key="ArrowDown" aria-label="아래">▼</button>
      </div>
      <div class="actions" aria-label="공격 버튼">
        <button type="button" data-key="KeyQ">X</button>
        <button type="button" data-key="KeyW">Y</button>
        <button type="button" data-key="KeyE">Z</button>
        <button type="button" data-key="KeyA">A</button>
        <button type="button" data-key="KeyS">B</button>
        <button type="button" data-key="KeyD">C</button>
      </div>
      <div class="system">
        <button type="button" data-key="KeyZ">MODE</button>
        <button type="button" data-key="Enter" class="start">START</button>
      </div>
    </section>
    <footer>폰은 조이패드 · 게임 화면은 안경</footer>
</main>`;
