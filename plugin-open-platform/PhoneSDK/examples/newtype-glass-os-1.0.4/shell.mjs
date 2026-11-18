// Newtype Glass OS - Main Shell Orchestrator
import { activate, getActiveAppId, createScopedPlugin, resubscribe, getGlassBattery, getRenderer } from './hub.mjs';
import { HomeHUD, APPS } from './desktop/home_hud.mjs';
import { vault } from './core/vault.mjs';

const mounted = new Set();
let homeHUD = null;

const SHARED_MODULE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  button, [role="button"], input, select, textarea { touch-action: manipulation; cursor: pointer; }
  .module-container { padding: 18px; color: #e2e8f0; }
  .module-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(0, 240, 255, 0.2); padding-bottom: 12px; }
  .module-badge { display: inline-block; padding: 3px 8px; background: rgba(0, 240, 255, 0.12); color: #00f0ff; border: 1px solid rgba(0, 240, 255, 0.35); border-radius: 4px; font-size: 11px; font-weight: 800; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 6px; }
  .module-header h2 { font-size: 18px; font-weight: 800; color: #ffffff; letter-spacing: 0.3px; }
  .btn-home-return { padding: 7px 14px; background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.4); color: #00f0ff; clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); font-weight: 700; font-size: 12px; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; }
  .btn-home-return:hover { background: rgba(0, 240, 255, 0.2); box-shadow: 0 0 12px rgba(0, 240, 255, 0.35); color: #ffffff; }
  .guide-box { margin-top: 24px; padding: 16px; background: linear-gradient(135deg, rgba(11, 21, 40, 0.8) 0%, rgba(6, 13, 26, 0.9) 100%); border: 1px solid rgba(0, 240, 255, 0.25); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
  .guide-title { font-size: 12px; font-weight: 800; color: #00f0ff; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.6px; font-family: monospace; }
  .guide-item { display: flex; justify-content: space-between; font-size: 13px; color: #cbd5e1; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); }
  .guide-item span { color: #00f0ff; font-weight: 700; font-family: monospace; }
  .guide-item.highlight { border-bottom: none; color: #fca5a5; font-weight: 700; margin-top: 4px; }
  .guide-item.highlight span { color: #fca5a5; }
  .btn-primary { background: #00f0ff; color: #030712; border: none; padding: 10px 16px; clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); font-weight: 800; font-family: monospace; letter-spacing: 0.5px; cursor: pointer; box-shadow: 0 0 14px rgba(0, 240, 255, 0.35); transition: all 0.2s; }
  .btn-primary:hover { background: #ffffff; box-shadow: 0 0 20px rgba(0, 240, 255, 0.6); }
  .btn-action { display: block; width: 100%; margin: 8px 0; padding: 12px; background: #00ff9d; color: #030712; border: none; clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); font-weight: 800; font-size: 14px; letter-spacing: 0.5px; cursor: pointer; box-shadow: 0 0 14px rgba(0, 255, 157, 0.35); transition: all 0.2s; }
  .btn-action:hover { background: #ffffff; box-shadow: 0 0 20px rgba(0, 255, 157, 0.6); }
  .btn-action.secondary { background: rgba(0, 240, 255, 0.08); color: #00f0ff; border: 1px solid rgba(0, 240, 255, 0.35); box-shadow: none; }
  .mode-toggle { display: flex; gap: 8px; margin-bottom: 14px; }
  .mode-btn { flex: 1; padding: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .mode-btn.active { background: rgba(0, 240, 255, 0.15); border-color: #00f0ff; color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.25); }
  .stock-row, .transit-row { display: flex; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(0, 240, 255, 0.15); clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); margin-bottom: 8px; }
  .up { color: #f87171; }
  .down { color: #38bdf8; }
  .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; font-family: monospace; margin-right: 8px; }
  .bus-blue { background: #1d4ed8; color: #fff; }
  .bus-green { background: #059669; color: #fff; }
  .bus-red { background: #dc2626; color: #fff; }
  .sub-line1 { background: #1e3a8a; color: #fff; }
  .sub-line2 { background: #047857; color: #fff; }
  .sub-sinbundang { background: #b91c1c; color: #fff; }
  .active-row { border-color: #00f0ff !important; box-shadow: 0 0 14px rgba(0, 240, 255, 0.25); }
  /* Stock Watchlist & Add/Delete Styling */
  .stock-add-card, .watchlist-card, .yt-input-card, .preset-section, .yt-player-preview-card { background: rgba(11, 21, 40, 0.7); border: 1px solid rgba(0, 240, 255, 0.2); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); padding: 16px; margin-bottom: 16px; }
  .card-title { font-size: 13px; font-weight: 800; color: #00f0ff; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 10px; }
  .card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .muted-hint { font-size: 11px; color: #64748b; }
  .input-row { display: flex; gap: 8px; margin-bottom: 10px; }
  .input-row input { flex: 1; padding: 10px 14px; background: rgba(3, 7, 18, 0.7); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 6px; color: #ffffff; font-family: monospace; font-size: 13px; outline: none; }
  .input-row input:focus { border-color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.35); }
  .preset-chips-row, .preset-scroll-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .quick-label { font-size: 11px; color: #94a3b8; font-weight: 700; font-family: monospace; }
  .chip-preset, .btn-preset-chip { padding: 5px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(0, 240, 255, 0.25); color: #cbd5e1; border-radius: 14px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
  .chip-preset:hover, .btn-preset-chip:hover, .btn-preset-chip.active { background: rgba(0, 240, 255, 0.2); border-color: #00f0ff; color: #00f0ff; box-shadow: 0 0 10px rgba(0, 240, 255, 0.3); }
  .stock-list { display: flex; flex-direction: column; gap: 8px; }
  .stock-row-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(0, 240, 255, 0.15); clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); transition: all 0.2s; }
  .stock-row-item:hover, .stock-row-item.active { background: rgba(0, 240, 255, 0.1); border-color: #00f0ff; box-shadow: 0 0 12px rgba(0, 240, 255, 0.2); }
  .row-left { display: flex; flex-direction: column; cursor: pointer; flex: 1; }
  .stock-sym { font-size: 11px; color: #38bdf8; font-weight: 800; font-family: monospace; }
  .stock-name { font-size: 14px; color: #ffffff; font-weight: 800; }
  .row-right { display: flex; align-items: center; gap: 12px; }
  .row-quote { display: flex; flex-direction: column; align-items: flex-end; cursor: pointer; }
  .stock-price { font-size: 14px; font-weight: 800; color: #ffffff; font-family: monospace; }
  .stock-change { font-size: 11px; font-weight: 800; font-family: monospace; }
  .btn-del-stock { width: 24px; height: 24px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
  .btn-del-stock:hover { background: rgba(239, 68, 68, 0.35); color: #ffffff; }
  .empty-hint { padding: 20px; text-align: center; color: #64748b; font-size: 12px; font-family: monospace; }
  /* YouTube Player & Streaming Styling */
  .yt-unified-player-card, .yt-embed-card { background: rgba(11, 21, 40, 0.8); border: 1px solid rgba(0, 240, 255, 0.25); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.5); }
  .title-wrap { display: flex; align-items: center; gap: 6px; overflow: hidden; flex: 1; }
  .badge-wrap { display: flex; align-items: center; gap: 6px; }
  .unified-video-wrap { position: relative; width: 100%; border-radius: 6px; overflow: hidden; background: #000; aspect-ratio: 16/9; border: 1px solid rgba(0, 255, 157, 0.4); margin-bottom: 12px; box-shadow: 0 0 16px rgba(0, 255, 157, 0.15); }
  .unified-video-wrap video { width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
  .unified-video-wrap iframe { width: 100%; height: 100%; border: none; display: block; }
  .yt-embed-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #64748b; padding: 20px; }
  .ph-icon { font-size: 32px; margin-bottom: 6px; }
  .player-mode-badge { font-size: 10px; color: #00ff9d; background: rgba(0, 255, 157, 0.12); border: 1px solid rgba(0, 255, 157, 0.35); padding: 2px 7px; border-radius: 4px; font-weight: 800; font-family: monospace; white-space: nowrap; }
  .mirror-btn-wrap { margin-top: 8px; margin-bottom: 8px; }
  .btn-mirror { width: 100%; padding: 10px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); font-size: 12px; font-weight: 800; font-family: monospace; cursor: pointer; transition: all 0.2s; }
  .btn-mirror:hover { background: rgba(239, 68, 68, 0.25); color: #ffffff; }
  .yt-hint { font-size: 11px; color: #64748b; margin-top: 6px; line-height: 1.4; }
  .player-top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px; }
  .video-title { font-size: 14px; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fps-badge { font-size: 11px; color: #38bdf8; background: rgba(56,189,248,0.1); padding: 3px 8px; border-radius: 6px; font-weight: 700; white-space: nowrap; }
  .subtitle-overlay { position: absolute; bottom: 8px; left: 8px; right: 8px; background: rgba(0,0,0,0.8); color: #fde047; font-size: 13px; font-weight: 700; padding: 6px 12px; border-radius: 6px; text-align: center; line-height: 1.3; border: 1px solid rgba(253, 224, 71, 0.3); }
  .timeline-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .time-label { font-size: 11px; font-weight: 700; color: #94a3b8; font-family: monospace; min-width: 42px; text-align: center; }
  .progress-track { flex: 1; height: 6px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; position: relative; }
  .progress-bar { height: 100%; background: #f43f5e; width: 0%; border-radius: 3px; transition: width 0.25s linear; }
  .playback-controls { display: flex; gap: 6px; flex-wrap: wrap; }
  .btn-ctrl { flex: 1; min-width: 60px; padding: 10px 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #ffffff; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; text-align: center; }
  .btn-ctrl:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.25); }
  .btn-highlight { background: rgba(56, 189, 248, 0.2) !important; border-color: #38bdf8 !important; color: #38bdf8 !important; }
  .mirror-action-row { display: flex; gap: 8px; margin-top: 8px; margin-bottom: 8px; }
  @media (max-width: 480px) { .mirror-action-row { flex-direction: column; } }
  /* Streaming Options Card */
  .options-card, .subtitle-monitor-card, .hud-viewport-card { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
  .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .options-grid { grid-template-columns: 1fr; } }
  .option-item { display: flex; flex-direction: column; gap: 6px; }
  .option-item label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  .option-item select { padding: 9px 10px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #ffffff; font-size: 12px; outline: none; cursor: pointer; }
  .option-item select:focus { border-color: #38bdf8; }
  .subtitle-monitor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .sub-tag { font-size: 12px; font-weight: 700; color: #38bdf8; }
  .sub-lang { font-size: 11px; font-weight: 700; color: #7cff8b; }
  .subtitle-box { padding: 12px; background: rgba(0,0,0,0.5); border: 1px solid rgba(124, 255, 139, 0.3); border-radius: 8px; font-size: 13px; color: #fde047; font-weight: 700; line-height: 1.4; text-align: center; min-height: 48px; display: flex; align-items: center; justify-content: center; }
  .hud-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .hud-tag { font-size: 12px; font-weight: 700; color: #22c55e; }
  .hud-mono-tag { font-size: 10px; color: #64748b; font-family: monospace; }
  .canvas-wrapper { width: 100%; aspect-ratio: 560 / 272; background: #000; border-radius: 10px; overflow: hidden; border: 1px solid rgba(34, 197, 94, 0.4); display: flex; align-items: center; justify-content: center; }
  .canvas-wrapper canvas { width: 100%; height: 100%; object-fit: contain; display: block; image-rendering: pixelated; }
`;

async function show(appId) {
  const allContainers = document.querySelectorAll('.app-screen');
  allContainers.forEach((el) => { el.hidden = true; });

  if (appId === 'home') {
    document.getElementById('homeScreen').hidden = false;
    activate('home');
    if (homeHUD) {
      homeHUD.render();
      const r = getRenderer();
      r.render(homeHUD.ctx).catch(() => {});
    }
    updateMobileStatus('COCKPIT LAUNCHER [DECK-OPS]');
    return;
  }

  // Submodule navigation
  const host = document.getElementById(`${appId}Root`);
  if (!host) {
    console.warn(`[Shell] Module host not found for: ${appId}`);
    show('home');
    return;
  }

  host.hidden = false;
  activate(appId);

  const matched = APPS.find((a) => a.id === appId);
  updateMobileStatus(matched ? `[${matched.code}] ${matched.name}` : appId);

  if (!mounted.has(appId)) {
    try {
      console.log(`[Shell] Dynamically mounting module: ${appId}`);
      const mod = await import(`./modules/${appId}/plugin.js`);
      const tpl = (await import(`./modules/${appId}/template.mjs`)).default;

      // Inject HTML directly into the host div (no Shadow DOM) so that
      // WebView touch events reach all buttons without Shadow DOM interception.
      host.innerHTML = `<style>${SHARED_MODULE_CSS}</style>` + tpl;

      const scopedHub = createScopedPlugin(appId);
      // Wait one animation frame to ensure the DOM is fully painted before
      // mount() tries to querySelector any elements.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await mod.mount(host, scopedHub);
      mounted.add(appId);
    } catch (e) {
      console.error(`[Shell] Failed to mount ${appId}:`, e);
      show('home');
    }
  }
}

function updateMobileStatus(statusName) {
  const lbl = document.getElementById('currentGlassScreen');
  if (lbl) lbl.textContent = statusName;
}

// Global Navigation Listener
window.addEventListener('newtype:navigate', (e) => {
  show(e.detail);
});

// Setup Home Desktop
async function initShell() {
  const canvas = document.getElementById('deviceCanvas');
  homeHUD = new HomeHUD(canvas);

  const homeScoped = createScopedPlugin('home');
  homeScoped.device.onButton((e) => {
    const act = String(e.action || '').toLowerCase();
    const isSingle = act === 'click' || act === 'single' || act === 'singleclick' || act === 'one';
    const isDouble = act === 'double' || act === 'doubleclick' || act === 'two';
    const isTriple = act === 'triple' || act === 'tripleclick' || act === 'three';

    if (isSingle) {
      homeHUD.launchSelected();
    } else if (isDouble) {
      homeHUD.nextApp();
      getRenderer().render(homeHUD.ctx).catch(() => {});
    } else if (isTriple) {
      homeHUD.init();
      getRenderer().render(homeHUD.ctx).catch(() => {});
    }
  });

  homeScoped.device.onGesture((e) => {
    const key = String(e.gesture || '').toLowerCase();
    if (['left', '7'].includes(key)) {
      homeHUD.prevApp();
      getRenderer().render(homeHUD.ctx).catch(() => {});
    } else if (['right', '8'].includes(key)) {
      homeHUD.nextApp();
      getRenderer().render(homeHUD.ctx).catch(() => {});
    }
  });

  // Home Quick Launch Buttons on Phone
  APPS.forEach((app) => {
    const btn = document.getElementById(`quickOpen_${app.id}`);
    if (btn) {
      btn.addEventListener('click', () => show(app.id));
    }
  });

  // Setup Unified Vault Drawer
  setupVaultDrawer();

  // Apply User-configured App Order
  applyAppOrder(vault.get('dashboard.appOrder', DEFAULT_APP_ORDER));

  // Show Home Screen initially
  show('home');

  try {
    await homeScoped.ready();
    await resubscribe();
  } catch (err) {
    console.warn('[Shell] Initial ready or subscribe warning:', err);
  }
}

const DEFAULT_APP_ORDER = [
  'k_way_nav',
  'korea_transit',
  'stock_ticker',
  'fitness_pacer',
  'ai_copilot',
  'open_memory',
  'vision_companion',
  'youtube_streamer'
];

function getAppEmoji(id) {
  const map = {
    k_way_nav: '🧭',
    korea_transit: '🚇',
    stock_ticker: '📈',
    fitness_pacer: '🏃',
    ai_copilot: '🤖',
    open_memory: '📝',
    vision_companion: '👁️',
    youtube_streamer: '📺'
  };
  return map[id] || '📱';
}

function applyAppOrder(order) {
  const currentOrder = order && Array.isArray(order) && order.length ? order : DEFAULT_APP_ORDER;
  const grid = document.querySelector('.app-launcher-grid');
  if (grid) {
    currentOrder.forEach((id) => {
      const card = document.getElementById(`quickOpen_${id}`);
      if (card) grid.appendChild(card);
    });
  }
  if (homeHUD) {
    homeHUD.setAppOrder(currentOrder);
  }
}

function setupVaultDrawer() {
  const drawer = document.getElementById('vaultDrawer');
  const btnOpen = document.getElementById('btnOpenVault');
  const btnClose = document.getElementById('btnCloseVault');
  const btnSave = document.getElementById('btnSaveVault');
  const btnExport = document.getElementById('btnExportVault');
  const btnImport = document.getElementById('btnImportVault');

  // Input Fields
  const inpGemini = document.getElementById('inpGeminiKey');
  const inpOpenAi = document.getElementById('inpOpenAiKey');
  const inpTransit = document.getElementById('inpTransitKey');
  const selHudScale = document.getElementById('selHudScale');
  const chkGestures = document.getElementById('chkGestures');
  const inpYtProxy = document.getElementById('inpYtProxy');

  // App Order Elements
  const appOrderContainer = document.getElementById('vaultAppOrderList');
  const btnResetAppOrder = document.getElementById('btnResetAppOrder');
  const btnOpenReorder = document.getElementById('btnOpenReorder');

  function getAppOrder() {
    return vault.get('dashboard.appOrder', DEFAULT_APP_ORDER);
  }

  function renderAppOrderList() {
    if (!appOrderContainer) return;
    const currentOrder = getAppOrder();
    appOrderContainer.innerHTML = '';

    currentOrder.forEach((appId, index) => {
      const app = APPS.find((a) => a.id === appId);
      if (!app) return;

      const row = document.createElement('div');
      row.className = 'app-order-item';
      row.innerHTML = `
        <div class="app-order-left">
          <span class="app-order-idx">#0${index + 1}</span>
          <span class="app-order-icon">${getAppEmoji(app.id)}</span>
          <div class="app-order-name">
            <span class="app-order-code">[${app.code}]</span>
            <span>${app.name}</span>
          </div>
        </div>
        <div class="app-order-btns">
          <button class="btn-order-move btn-move-up" data-idx="${index}" ${index === 0 ? 'disabled' : ''} title="위로 이동">▲</button>
          <button class="btn-order-move btn-move-down" data-idx="${index}" ${index === currentOrder.length - 1 ? 'disabled' : ''} title="아래로 이동">▼</button>
        </div>
      `;
      appOrderContainer.appendChild(row);
    });

    // Move Up Click
    appOrderContainer.querySelectorAll('.btn-move-up').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (idx > 0) {
          const list = [...getAppOrder()];
          const temp = list[idx - 1];
          list[idx - 1] = list[idx];
          list[idx] = temp;
          vault.set('dashboard.appOrder', list);
          applyAppOrder(list);
          renderAppOrderList();
        }
      });
    });

    // Move Down Click
    appOrderContainer.querySelectorAll('.btn-move-down').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const list = [...getAppOrder()];
        if (idx < list.length - 1) {
          const temp = list[idx + 1];
          list[idx + 1] = list[idx];
          list[idx] = temp;
          vault.set('dashboard.appOrder', list);
          applyAppOrder(list);
          renderAppOrderList();
        }
      });
    });
  }

  btnResetAppOrder?.addEventListener('click', () => {
    vault.set('dashboard.appOrder', DEFAULT_APP_ORDER);
    applyAppOrder(DEFAULT_APP_ORDER);
    renderAppOrderList();
  });

  btnOpenReorder?.addEventListener('click', () => {
    populateInputs();
    renderAppOrderList();
    drawer.classList.add('open');
    setTimeout(() => {
      document.getElementById('vaultSectionAppOrder')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  });

  function populateInputs() {
    inpGemini.value = vault.get('ai.geminiApiKey', '');
    inpOpenAi.value = vault.get('ai.openaiApiKey', '');
    inpTransit.value = vault.get('mobility.transitApiKey', '');
    selHudScale.value = vault.get('glasses.hudScale', 'standard');
    chkGestures.checked = vault.get('glasses.gestureEnabled', true);
    if (inpYtProxy) inpYtProxy.value = vault.get('youtube.proxyServer', '');
  }

  btnOpen.addEventListener('click', () => {
    populateInputs();
    renderAppOrderList();
    drawer.classList.add('open');
  });

  btnClose.addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  btnSave.addEventListener('click', () => {
    vault.set('ai.geminiApiKey', inpGemini.value.trim());
    vault.set('ai.openaiApiKey', inpOpenAi.value.trim());
    vault.set('mobility.transitApiKey', inpTransit.value.trim());
    vault.set('glasses.hudScale', selHudScale.value);
    vault.set('glasses.gestureEnabled', chkGestures.checked);
    if (inpYtProxy) vault.set('youtube.proxyServer', inpYtProxy.value.trim());

    alert('통합 설정 센터(Vault)에 저장되었습니다!\n모든 글래스 앱 모듈에 즉시 적용됩니다.');
    drawer.classList.remove('open');
  });

  btnExport.addEventListener('click', () => {
    const json = vault.exportJson();
    navigator.clipboard.writeText(json).then(() => {
      alert('설정 백업 텍스트가 클립보드에 복사되었습니다!');
    }).catch(() => {
      prompt('설정 백업 텍스트를 복사하세요:', json);
    });
  });

  btnImport.addEventListener('click', () => {
    const json = prompt('백업했던 설정 JSON 텍스트를 붙여넣으세요:');
    if (json && vault.importJson(json)) {
      populateInputs();
      renderAppOrderList();
      applyAppOrder(vault.get('dashboard.appOrder', DEFAULT_APP_ORDER));
      alert('설정이 성공적으로 복원되었습니다!');
    }
  });
}

// Run bootstrap when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShell);
} else {
  initShell();
}

