// AI Copilot Module for Newtype Glass OS
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

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('🤖 AI Copilot | 한 ⇄ 영 양방향 통역 (Gemini)', 24, 34);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText('상대방 발화 (English):', 24, 76);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('"Could you tell me how to get to the subway station?"', 24, 108);

    ctx.fillStyle = '#4ade80';
    ctx.font = '16px sans-serif';
    ctx.fillText('실시간 한국어 번역:', 24, 154);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('▶ "지하철역으로 어떻게 가는지 알려주실 수 있나요?"', 24, 188);

    // Footer
    ctx.strokeStyle = '#222222';
    ctx.beginPath();
    ctx.moveTo(24, 236);
    ctx.lineTo(W - 24, 236);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 음성 듣기 시작 / 정지  ·  2번: 번역 언어 전환 (영어/일본어/중국어)  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  scopedHub.device.onButton((e) => {
    renderHUD();
  });

  root.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate('home'));
  renderHUD();
}
