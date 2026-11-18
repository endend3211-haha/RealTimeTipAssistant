// Open Memory Module for Newtype Glass OS
import { vault } from '../../core/vault.mjs';
import { navigate, getRenderer } from '../../hub.mjs';

const W = 600;
const H = 350;

export async function mount(root, scopedHub) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = getRenderer();

  function renderHUD() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('📝 Open Memory | 안경 음성 라이프로그', 24, 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('최근 저장된 생각 메모:', 24, 82);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px sans-serif';
    ctx.fillText('1. "내일 오전 10시 테헤란로 미팅 자료 챙기기"', 24, 120);
    ctx.fillText('2. "안경 배터리 충전 및 신규 펌웨어 테스트 확인"', 24, 152);
    ctx.fillText('3. "주말에 해운대 러닝 코스 답사하기"', 24, 184);

    // Footer
    ctx.strokeStyle = '#222222';
    ctx.beginPath();
    ctx.moveTo(24, 236);
    ctx.lineTo(W - 24, 236);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 음성 메모 녹음 시작 / 완료  ·  2번: 저장된 메모 목록 탐색  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  scopedHub.device.onButton((e) => {
    renderHUD();
  });

  root.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate('home'));
  renderHUD();
}
