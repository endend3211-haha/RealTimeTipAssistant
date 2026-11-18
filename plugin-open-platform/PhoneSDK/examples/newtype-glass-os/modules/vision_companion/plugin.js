// Vision Companion Module for Newtype Glass OS
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

    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('👁️ Vision Companion | 전방 카메라 AI 캡처', 24, 34);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('[AI 분석 결과]: 고양이 및 커피잔 인식됨', 24, 84);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.fillText('책상 위에 털이 짧은 치즈 태비 고양이가 식빵을 굽고 있으며,', 24, 124);
    ctx.fillText('우측에는 따뜻한 아메리카노가 담긴 흰색 머그잔이 있습니다.', 24, 154);
    ctx.fillText('(영문 텍스트: "Antigravity Coding Assistant")', 24, 184);

    // Footer
    ctx.strokeStyle = '#222222';
    ctx.beginPath();
    ctx.moveTo(24, 236);
    ctx.lineTo(W - 24, 236);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 현재 보고 있는 장면 AI 분석  ·  2번: 텍스트 OCR 읽기 모드  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  scopedHub.device.onButton((e) => {
    renderHUD();
  });

  root.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate('home'));
  renderHUD();
}
