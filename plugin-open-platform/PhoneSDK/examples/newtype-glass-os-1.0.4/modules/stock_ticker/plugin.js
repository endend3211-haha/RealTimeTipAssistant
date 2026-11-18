// Stock & Crypto Ticker Module with In-App Add/Delete Watchlist
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

  let selectedIdx = 0;
  let showChart = false;

  // Initial watchlist from Vault
  let watchlist = vault.get('finance.watchlist', [
    { symbol: '005930', name: '삼성전자', type: 'stock' },
    { symbol: '000660', name: 'SK하이닉스', type: 'stock' },
    { symbol: 'BTC', name: '비트코인', type: 'crypto' },
    { symbol: 'ETH', name: '이더리움', type: 'crypto' },
    { symbol: 'NVDA', name: 'NVIDIA', type: 'us_stock' }
  ]);

  // Mock Quotes Generator
  function getQuoteData(item) {
    const sym = item.symbol.toUpperCase();
    if (sym === '005930') {
      return { price: '74,500원', change: '+1,300 (+1.8%)', isUp: true, high: '75,000', low: '73,800', volume: '14.2M' };
    }
    if (sym === '000660') {
      return { price: '186,200원', change: '+4,400 (+2.4%)', isUp: true, high: '188,000', low: '183,000', volume: '3.8M' };
    }
    if (sym === '035720') {
      return { price: '48,650원', change: '-450 (-0.9%)', isUp: false, high: '49,300', low: '48,200', volume: '1.2M' };
    }
    if (sym === '035420') {
      return { price: '178,000원', change: '+2,000 (+1.1%)', isUp: true, high: '180,000', low: '176,500', volume: '850K' };
    }
    if (sym === 'BTC') {
      return { price: '138,400,000원', change: '+4,150,000 (+3.1%)', isUp: true, high: '141M', low: '135M', volume: '4.8K' };
    }
    if (sym === 'ETH') {
      return { price: '4,820,000원', change: '+110,000 (+2.3%)', isUp: true, high: '4.95M', low: '4.71M', volume: '12K' };
    }
    if (sym === 'NVDA') {
      return { price: '$142.50', change: '-1.15 (-0.8%)', isUp: false, high: '$145.2', low: '$141.0', volume: '52M' };
    }
    if (sym === 'TSLA') {
      return { price: '$248.80', change: '+8.40 (+3.5%)', isUp: true, high: '$252.0', low: '$242.1', volume: '68M' };
    }
    // Default fallback
    return {
      price: sym.length === 6 ? '50,000원' : '$100.00',
      change: '+500 (+1.0%)',
      isUp: true,
      high: '52,000',
      low: '49,500',
      volume: '100K'
    };
  }

  function renderListUI() {
    const listEl = root.querySelector('#stockListContainer');
    const badgeEl = root.querySelector('#stockCountBadge');
    if (!listEl) return;

    badgeEl.textContent = watchlist.length;
    listEl.innerHTML = '';

    if (watchlist.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">등록된 관심 종목이 없습니다. 위에서 추가해주세요.</div>';
      return;
    }

    watchlist.forEach((item, idx) => {
      const q = getQuoteData(item);
      const isSelected = idx === selectedIdx;
      const row = document.createElement('div');
      row.className = `stock-row-item ${isSelected ? 'active' : ''}`;
      row.innerHTML = `
        <div class="row-left" data-select="${idx}">
          <span class="stock-sym">${item.symbol}</span>
          <span class="stock-name">${item.name || item.symbol}</span>
        </div>
        <div class="row-right">
          <div class="row-quote" data-select="${idx}">
            <div class="stock-price">${q.price}</div>
            <div class="stock-change ${q.isUp ? 'up' : 'down'}">${q.change}</div>
          </div>
          <button class="btn-del-stock" data-del="${idx}" title="종목 삭제">✕</button>
        </div>
      `;

      // Select row to show on glasses
      row.querySelectorAll('[data-select]').forEach(el => {
        el.addEventListener('click', () => {
          selectedIdx = idx;
          renderListUI();
          renderGlassHUD();
        });
      });

      // Delete item
      row.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        watchlist.splice(idx, 1);
        if (selectedIdx >= watchlist.length) selectedIdx = Math.max(0, watchlist.length - 1);
        vault.set('finance.watchlist', watchlist);
        renderListUI();
        renderGlassHUD();
      });

      listEl.appendChild(row);
    });
  }

  function renderGlassHUD() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    if (watchlist.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('등록된 관심 종목이 없습니다', 30, 160);
      ctx.font = '16px sans-serif';
      ctx.fillText('스마트폰 화면에서 관심 종목을 추가해주세요', 30, 195);
      renderer.render(ctx).catch(() => {});
      return;
    }

    const item = watchlist[selectedIdx] || watchlist[0];
    const q = getQuoteData(item);

    // Header Bar
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`📈 K-Stock | 실시간 시세 (${selectedIdx + 1}/${watchlist.length})`, 24, 34);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('⚡ 실시간 동기화', W - 24, 34);
    ctx.textAlign = 'left';

    // Stock Name & Symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${item.name || item.symbol} (${item.symbol})`, 24, 76);

    // Current Price (50px bold)
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(q.price, 24, 134);

    // Change Rate Pill (Korean standard: Red is UP, Blue is DOWN)
    ctx.fillStyle = q.isUp ? '#f87171' : '#60a5fa';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(q.isUp ? `▲ ${q.change}` : `▼ ${q.change}`, 24, 172);

    // Mini Chart Box (360, 56, 216, 126)
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(360, 56, 216, 126);

    ctx.strokeStyle = q.isUp ? '#f87171' : '#60a5fa';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const pts = q.isUp ? [150, 140, 130, 135, 120, 110, 95, 80] : [70, 85, 90, 85, 110, 120, 130, 145];
    for (let i = 0; i < pts.length; i++) {
      const px = 370 + i * 28;
      const py = pts[i];
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Stats Row
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    ctx.fillText(`고가: ${q.high}   저가: ${q.low}   거래량: ${q.volume}`, 24, 216);

    // Separator line
    ctx.strokeStyle = '#222222';
    ctx.beginPath();
    ctx.moveTo(24, 236);
    ctx.lineTo(W - 24, 236);
    ctx.stroke();

    // Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1번: 차트 전환  ·  2번: 다음 종목 순환  ·  3번: 시세 갱신  ·  길게: 홈', W / 2, 330);
    ctx.textAlign = 'left';

    renderer.render(ctx).catch(() => {});
  }

  // Add Stock Handler
  function addStock(symbol, name = '') {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;

    // Check duplicate
    if (watchlist.some(w => w.symbol.toUpperCase() === sym)) {
      alert(`이미 등록된 종목입니다: ${sym}`);
      return;
    }

    const newItem = {
      symbol: sym,
      name: name || sym,
      type: sym.length === 6 ? 'stock' : 'crypto'
    };

    watchlist.push(newItem);
    selectedIdx = watchlist.length - 1; // switch to newly added
    vault.set('finance.watchlist', watchlist);
    renderListUI();
    renderGlassHUD();
  }

  // Bind Add Input
  const inpAdd = root.querySelector('#inpAddStock');
  const btnAdd = root.querySelector('#btnAddStock');
  btnAdd?.addEventListener('click', () => {
    if (inpAdd && inpAdd.value.trim()) {
      addStock(inpAdd.value.trim());
      inpAdd.value = '';
    }
  });

  inpAdd?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAdd?.click();
    }
  });

  // Bind Preset Chips
  root.querySelectorAll('.chip-preset').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.code;
      const name = chip.dataset.name;
      addStock(code, name);
    });
  });

  // Button Listeners
  scopedHub.device.onButton((e) => {
    const act = String(e.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    if (isSingle) {
      showChart = !showChart;
      renderGlassHUD();
    } else if (isDouble) {
      if (watchlist.length > 0) {
        selectedIdx = (selectedIdx + 1) % watchlist.length;
        renderListUI();
        renderGlassHUD();
      }
    } else if (isTriple) {
      renderGlassHUD();
    }
  });

  root.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate('home'));

  renderListUI();
  renderGlassHUD();
}
