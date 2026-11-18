// Newtype Glass OS - Starship Tactical HUD (600x350 Micro-OLED Waveguide)
import { fetchLiveWeather, getWeatherDesc } from '../core/weather.mjs';
import { getGlassBattery, navigate } from '../hub.mjs';
import { vault } from '../core/vault.mjs';

const W = 600;
const H = 350;

export const APPS = [
  { id: 'k_way_nav', name: 'K-Way 내비', code: 'NAV-01', icon: 'nav', tag: 'ORBITAL TBT', desc: '도보·차량 퀀텀유도' },
  { id: 'korea_transit', name: 'K-Transit', code: 'TRN-02', icon: 'transit', tag: 'MAGLEV TRN', desc: '지하철·버스 환승' },
  { id: 'stock_ticker', name: 'K-Stock', code: 'MKT-03', icon: 'stock', tag: 'ASSET TEL', desc: '국내장·가상자산' },
  { id: 'fitness_pacer', name: '피트니스', code: 'BIO-04', icon: 'fitness', tag: 'BIO SENSOR', desc: '생체 페이스·심박' },
  { id: 'ai_copilot', name: 'AI 통역', code: 'AI-05', icon: 'copilot', tag: 'NEURAL TRN', desc: '양방향 성간 번역' },
  { id: 'open_memory', name: '오픈메모리', code: 'LOG-06', icon: 'memory', tag: 'NEURO LOG', desc: '음성 메모 블랙박스' },
  { id: 'vision_companion', name: '비전 스캔', code: 'OPT-07', icon: 'vision', tag: 'OPTIC SCAN', desc: '사물·문서 HUD분석' },
  { id: 'youtube_streamer', name: '유튜브 HUD', code: 'MED-08', icon: 'youtube', tag: 'HOLO MEDIA', desc: '오디오·자막 글래스' },
];

function drawChamferBox(ctx, x, y, w, h, c = 8) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

export class HomeHUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.weatherData = null;
    this.clockTimer = null;
    this.apps = this.getOrderedApps();
    this.init();
  }

  getOrderedApps() {
    const order = vault.get('dashboard.appOrder', null);
    if (!order || !Array.isArray(order) || order.length === 0) return [...APPS];
    const map = new Map(APPS.map(a => [a.id, a]));
    const result = [];
    for (const id of order) {
      if (map.has(id)) {
        result.push(map.get(id));
        map.delete(id);
      }
    }
    for (const app of map.values()) {
      result.push(app);
    }
    return result;
  }

  setAppOrder(newOrder) {
    this.apps = this.getOrderedApps();
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.apps.length - 1));
    this.ensureVisible();
    this.render();
  }

  async init() {
    this.weatherData = await fetchLiveWeather();
    this.render();
  }

  nextApp() {
    this.selectedIndex = (this.selectedIndex + 1) % this.apps.length;
    this.ensureVisible();
    this.render();
  }

  prevApp() {
    this.selectedIndex = (this.selectedIndex - 1 + this.apps.length) % this.apps.length;
    this.ensureVisible();
    this.render();
  }

  ensureVisible() {
    const VISIBLE = 4;
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + VISIBLE) {
      this.scrollOffset = this.selectedIndex - VISIBLE + 1;
    }
  }

  launchSelected() {
    const selected = this.apps[this.selectedIndex];
    if (selected) {
      navigate(selected.id);
    }
  }

  drawIcon(type, cx, cy, size, isSelected) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = isSelected ? 2.5 : 1.8;
    ctx.strokeStyle = isSelected ? '#ffffff' : '#64748b';
    ctx.fillStyle = isSelected ? '#ffffff' : '#64748b';

    const hs = size / 2;

    // Tactical Reticle Target Box for Selected Icons
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - hs - 6, cy - hs - 6, size + 12, size + 12);
      // Small crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - hs - 9, cy); ctx.lineTo(cx - hs - 3, cy);
      ctx.moveTo(cx + hs + 3, cy); ctx.lineTo(cx + hs + 9, cy);
      ctx.moveTo(cx, cy - hs - 9); ctx.lineTo(cx, cy - hs - 3);
      ctx.moveTo(cx, cy + hs + 3); ctx.lineTo(cx, cy + hs + 9);
      ctx.stroke();
      ctx.restore();
    }

    if (type === 'nav') {
      // 🧭 Tactical Quantum Navigation Compass
      ctx.beginPath();
      ctx.moveTo(cx, cy - hs);
      ctx.lineTo(cx + hs * 0.85, cy + hs * 0.85);
      ctx.lineTo(cx, cy + hs * 0.35);
      ctx.lineTo(cx - hs * 0.85, cy + hs * 0.85);
      ctx.closePath();
      if (isSelected) ctx.fill(); else ctx.stroke();

      // North Star Reticle
      ctx.beginPath();
      ctx.arc(cx, cy - hs - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'transit') {
      // 🚇 High-Speed Maglev Pod Front
      ctx.strokeRect(cx - hs * 0.75, cy - hs * 0.9, hs * 1.5, hs * 1.8);
      ctx.strokeRect(cx - hs * 0.55, cy - hs * 0.65, hs * 1.1, hs * 0.7);
      ctx.beginPath();
      // Dual Maglev Headlights
      ctx.arc(cx - hs * 0.4, cy + hs * 0.5, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + hs * 0.4, cy + hs * 0.5, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Orbit Rail Guideline
      ctx.beginPath();
      ctx.moveTo(cx - hs, cy + hs * 0.9);
      ctx.lineTo(cx + hs, cy + hs * 0.9);
      ctx.stroke();
    } else if (type === 'stock') {
      // 📈 Quantum Asset Pulse / Candlestick Waveform
      ctx.beginPath();
      ctx.moveTo(cx - hs, cy + hs * 0.5);
      ctx.lineTo(cx - hs * 0.35, cy);
      ctx.lineTo(cx + hs * 0.15, cy + hs * 0.35);
      ctx.lineTo(cx + hs * 0.85, cy - hs * 0.65);
      ctx.stroke();
      // Bullish Arrowhead
      ctx.beginPath();
      ctx.moveTo(cx + hs * 0.85, cy - hs * 0.65);
      ctx.lineTo(cx + hs * 0.45, cy - hs * 0.65);
      ctx.moveTo(cx + hs * 0.85, cy - hs * 0.65);
      ctx.lineTo(cx + hs * 0.85, cy - hs * 0.25);
      ctx.stroke();
    } else if (type === 'fitness') {
      // 🏃 Biometric Runner & Pulse Nodes
      ctx.beginPath();
      ctx.arc(cx, cy - hs * 0.65, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - hs * 0.2);
      ctx.lineTo(cx - hs * 0.3, cy + hs * 0.3);
      ctx.lineTo(cx - hs * 0.65, cy + hs * 0.9);
      ctx.moveTo(cx, cy - hs * 0.2);
      ctx.lineTo(cx + hs * 0.45, cy + hs * 0.35);
      ctx.lineTo(cx + hs * 0.85, cy + hs * 0.9);
      ctx.stroke();
    } else if (type === 'copilot') {
      // 🤖 AI Neural Core / Cyber Comms
      ctx.strokeRect(cx - hs * 0.85, cy - hs * 0.75, hs * 1.7, hs * 1.3);
      ctx.beginPath();
      ctx.moveTo(cx - hs * 0.35, cy + hs * 0.55);
      ctx.lineTo(cx - hs * 0.55, cy + hs * 0.95);
      ctx.lineTo(cx - hs * 0.15, cy + hs * 0.55);
      ctx.stroke();
      // Waveform bars
      ctx.beginPath();
      ctx.moveTo(cx - hs * 0.4, cy - hs * 0.1); ctx.lineTo(cx - hs * 0.4, cy + hs * 0.15);
      ctx.moveTo(cx, cy - hs * 0.35); ctx.lineTo(cx, cy + hs * 0.35);
      ctx.moveTo(cx + hs * 0.4, cy - hs * 0.1); ctx.lineTo(cx + hs * 0.4, cy + hs * 0.15);
      ctx.stroke();
    } else if (type === 'memory') {
      // 📝 Hexagonal Neuro-Vault Datapad
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const hx = cx + Math.cos(ang) * (hs * 0.85);
        const hy = cy + Math.sin(ang) * (hs * 0.85);
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      // Center memory core
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'vision') {
      // 👁️ Targeting Aperture / Optical Scanner
      ctx.beginPath();
      ctx.arc(cx, cy, hs * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, hs * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Reticle Ticks
      ctx.beginPath();
      ctx.moveTo(cx - hs, cy); ctx.lineTo(cx - hs * 0.5, cy);
      ctx.moveTo(cx + hs * 0.5, cy); ctx.lineTo(cx + hs, cy);
      ctx.moveTo(cx, cy - hs); ctx.lineTo(cx, cy - hs * 0.5);
      ctx.moveTo(cx, cy + hs * 0.5); ctx.lineTo(cx, cy + hs);
      ctx.stroke();
    } else if (type === 'youtube') {
      // 📺 Holo-Media Laser Display
      ctx.strokeRect(cx - hs * 0.85, cy - hs * 0.65, hs * 1.7, hs * 1.3);
      ctx.beginPath();
      ctx.moveTo(cx - hs * 0.25, cy - hs * 0.35);
      ctx.lineTo(cx + hs * 0.35, cy);
      ctx.lineTo(cx - hs * 0.25, cy + hs * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  render() {
    const ctx = this.ctx;
    const now = new Date();

    // 1. 100% Pure Black Void (Micro-OLED Transparent Optical Waveguide)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    // 2. Cockpit Outer HUD Reticles & Corner Brackets
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // 4 Corner Angle Reticles
    ctx.beginPath();
    // Top-Left
    ctx.moveTo(10, 24); ctx.lineTo(10, 10); ctx.lineTo(24, 10);
    // Top-Right
    ctx.moveTo(W - 24, 10); ctx.lineTo(W - 10, 10); ctx.lineTo(W - 10, 24);
    // Bottom-Left
    ctx.moveTo(10, H - 24); ctx.lineTo(10, H - 10); ctx.lineTo(24, H - 10);
    // Bottom-Right
    ctx.moveTo(W - 24, H - 10); ctx.lineTo(W - 10, H - 10); ctx.lineTo(W - 10, H - 24);
    ctx.stroke();

    // Pitch Ladder Ticks on Left & Right
    ctx.beginPath();
    for (let y = 120; y <= 220; y += 25) {
      ctx.moveTo(6, y); ctx.lineTo(12, y);
      ctx.moveTo(W - 12, y); ctx.lineTo(W - 6, y);
    }
    ctx.stroke();

    // 3. Top Telemetry Header
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const secStr = String(now.getSeconds()).padStart(2, '0');
    const dateStr = now.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });

    // Left: Cockpit Time & Tactical Mode
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('BRIDGE //', 24, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(timeStr, 94, 29);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`:${secStr}`, 150, 29);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(dateStr, 180, 28);

    // Center: Meteorology Telemetry
    if (this.weatherData?.current) {
      const cur = this.weatherData.current;
      const [desc] = getWeatherDesc(cur.weather_code);
      const temp = Math.round(cur.temperature_2m);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`MET: ${this.weatherData.city} ${temp}°C ${desc}`, W / 2 + 35, 28);
      ctx.textAlign = 'left';
    }

    // Right: Power Cell & Quantum Link
    const batt = getGlassBattery();
    const battText = batt && batt.percent !== null ? `${batt.percent}%` : '--%';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`PWR ${battText}`, W - 44, 28);

    // Pulsing Plasma Link Beacon
    ctx.beginPath();
    ctx.arc(W - 24, 24, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W - 24, 24, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
    ctx.stroke();
    ctx.textAlign = 'left';

    // Header Separator Line with Chamfer Accent
    ctx.strokeStyle = '#223247';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 42);
    ctx.lineTo(W / 2 - 120, 42);
    ctx.lineTo(W / 2 - 110, 46);
    ctx.lineTo(W / 2 + 110, 46);
    ctx.lineTo(W / 2 + 120, 42);
    ctx.lineTo(W - 24, 42);
    ctx.stroke();

    // 4. Middle Area: Carousel Subsystem Dock (4 visible pods)
    const VISIBLE = 4;
    const cardW = 126;
    const cardH = 224;
    const gap = 16;
    const startX = 24;
    const startY = 56;

    for (let slot = 0; slot < VISIBLE; slot++) {
      const appIdx = this.scrollOffset + slot;
      if (appIdx >= this.apps.length) break;

      const app = this.apps[appIdx];
      const isSelected = appIdx === this.selectedIndex;
      const x = startX + slot * (cardW + gap);
      const y = startY;

      // Card Chamfer Frame
      if (isSelected) {
        // High-contrast Chamfered Cockpit Frame
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        drawChamferBox(ctx, x, y, cardW, cardH, 10);
        ctx.stroke();

        // Corner Tech Brackets (L-brackets around selected card)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // TL
        ctx.moveTo(x - 3, y + 14); ctx.lineTo(x - 3, y - 3); ctx.lineTo(x + 14, y - 3);
        // TR
        ctx.moveTo(x + cardW - 14, y - 3); ctx.lineTo(x + cardW + 3, y - 3); ctx.lineTo(x + cardW + 3, y + 14);
        // BL
        ctx.moveTo(x - 3, y + cardH - 14); ctx.lineTo(x - 3, y + cardH + 3); ctx.lineTo(x + 14, y + cardH + 3);
        // BR
        ctx.moveTo(x + cardW - 14, y + cardH + 3); ctx.lineTo(x + cardW + 3, y + cardH + 3); ctx.lineTo(x + cardW + 3, y + cardH - 14);
        ctx.stroke();

        // Top Serial Code centered
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[${app.code}]`, x + cardW / 2, y + 18);

        // Subsystem Tag centered under serial code
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(app.tag, x + cardW / 2, y + 31);
        ctx.textAlign = 'left';

        // Icon (centered)
        this.drawIcon(app.icon, x + cardW / 2, y + 84, 44, true);

        // App Name (Bold White)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(app.name, x + cardW / 2, y + 150);

        // App Desc
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px sans-serif';
        ctx.fillText(app.desc, x + cardW / 2, y + 174);

        // Active Neon Power Beam at bottom
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 24, y + cardH - 12);
        ctx.lineTo(x + cardW - 24, y + cardH - 12);
        ctx.stroke();

        // Center Laser Pip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + cardW / 2, y + cardH - 12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'left';
      } else {
        // Dim Subsystem Frame
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        drawChamferBox(ctx, x, y, cardW, cardH, 10);
        ctx.stroke();

        // Top Serial Code centered
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[${app.code}]`, x + cardW / 2, y + 18);

        // Subsystem Tag centered under serial code
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText(app.tag, x + cardW / 2, y + 31);
        ctx.textAlign = 'left';

        // Icon
        this.drawIcon(app.icon, x + cardW / 2, y + 84, 42, false);

        // App Name
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(app.name, x + cardW / 2, y + 150);

        // App Desc
        ctx.fillStyle = '#475569';
        ctx.font = '11px sans-serif';
        ctx.fillText(app.desc, x + cardW / 2, y + 174);
        ctx.textAlign = 'left';
      }
    }

    // Scroll Indicator Wings
    if (this.scrollOffset > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('◄', 6, startY + cardH / 2 + 5);
    }
    if (this.scrollOffset + VISIBLE < this.apps.length) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('►', W - 18, startY + cardH / 2 + 5);
    }

    // 5. Bottom HUD Flight Guide
    ctx.strokeStyle = '#223247';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 298);
    ctx.lineTo(W - 24, 298);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◄ TILT/2-CLK: DECK CYCLE  ·  1-CLK: ENGAGE  ·  3-CLK: SENSOR SYNC  ·  HOLD: WARP HOME ►', W / 2, 324);
    ctx.textAlign = 'left';
  }
}
