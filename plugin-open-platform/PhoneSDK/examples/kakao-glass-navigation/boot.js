// 진단용: 모듈 로딩/실행 오류를 화면 상단 문구에 그대로 표시합니다 (없으면 조용히 멈춘 것처럼 보임).
const show = (text) => {
  const el = document.getElementById('status');
  if (el) { el.textContent = text; el.style.color = '#ff6b4a'; }
};
window.addEventListener('error', (e) => {
  const src = e.target && e.target.src;
  show(src ? `파일 로드 실패: ${src.split('/').pop()} (import한 파일 누락 가능)` : `스크립트 오류: ${e.message}`);
}, true);
window.addEventListener('unhandledrejection', (e) => show(`처리되지 않은 오류: ${e.reason?.message || e.reason}`));
