// Newtype Glass OS - Unified Settings & Secret Vault
// All modules share these keys and preferences seamlessly.

const STORAGE_KEY = 'newtype_glass_os_vault_v1';

const DEFAULT_VAULT = {
  // 1. AI APIs
  ai: {
    geminiApiKey: '',
    openaiApiKey: '',
    selectedAiProvider: 'gemini',
    copilotSourceLang: 'auto',
    copilotTargetLang: 'ko',
    summaryPace: 'concise',
  },
  // 2. Mobility & Transit
  mobility: {
    transitApiKey: '',       // 공공데이터포털 버스/지하철 인증키
    kwayCustomClientId: '',  // 개인 지도 Client ID (선택)
    defaultTransitCity: '서울',
    walkingSpeedKmh: 4.0,
    drivingSpeedKmh: 45.0,
  },
  // 3. Finance & Crypto Watchlist
  finance: {
    watchlist: [
      { symbol: '005930', name: '삼성전자', type: 'stock' },
      { symbol: '000660', name: 'SK하이닉스', type: 'stock' },
      { symbol: 'BTC', name: '비트코인', type: 'crypto' },
      { symbol: 'ETH', name: '이더리움', type: 'crypto' },
      { symbol: 'NVDA', name: 'NVIDIA', type: 'us_stock' },
    ],
    refreshIntervalSec: 15,
  },
  // 4. Glass Hardware & Display Ergonomics
  glasses: {
    hudScale: 'standard',       // 'standard' (96px 화살표, 14px 텍스트) or 'large' (시력 보호)
    gestureEnabled: true,       // 고개 회전 IMU 제스처 켜기/끄기
    longPressHomeMs: 1200,      // 길게 누르면 홈으로 복귀하는 딜레이 (ms)
    autoStandbySec: 60,         // 디스플레이 대기 시간
    hapticFeedback: true,       // 폰 진동 피드백
  },
  // 5. Weather & Lifestyle
  weather: {
    autoLocation: true,
    manualCity: '서울',
    latitude: 37.5665,
    longitude: 126.9780,
  },
  // 6. Dashboard Subsystem Order
  dashboard: {
    appOrder: [
      'k_way_nav',
      'korea_transit',
      'stock_ticker',
      'fitness_pacer',
      'ai_copilot',
      'open_memory',
      'vision_companion',
      'youtube_streamer'
    ]
  }
};

class VaultManager {
  constructor() {
    this.data = this.load();
    this.listeners = new Map();
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return JSON.parse(JSON.stringify(DEFAULT_VAULT));
      const parsed = JSON.parse(saved);
      // Deep merge with defaults to ensure new fields are populated
      return {
        ai: { ...DEFAULT_VAULT.ai, ...(parsed.ai || {}) },
        mobility: { ...DEFAULT_VAULT.mobility, ...(parsed.mobility || {}) },
        finance: { ...DEFAULT_VAULT.finance, ...(parsed.finance || {}) },
        glasses: { ...DEFAULT_VAULT.glasses, ...(parsed.glasses || {}) },
        weather: { ...DEFAULT_VAULT.weather, ...(parsed.weather || {}) },
        dashboard: { ...DEFAULT_VAULT.dashboard, ...(parsed.dashboard || {}) },
      };
    } catch (e) {
      console.warn('[Vault] Failed to load from storage, using defaults:', e);
      return JSON.parse(JSON.stringify(DEFAULT_VAULT));
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('[Vault] Failed to save to localStorage:', e);
    }
  }

  get(path, fallback = undefined) {
    const keys = path.split('.');
    let curr = this.data;
    for (const k of keys) {
      if (curr === undefined || curr === null) return fallback;
      curr = curr[k];
    }
    return curr !== undefined ? curr : fallback;
  }

  set(path, value) {
    const keys = path.split('.');
    let curr = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!curr[k] || typeof curr[k] !== 'object') curr[k] = {};
      curr = curr[k];
    }
    const lastKey = keys[keys.length - 1];
    curr[lastKey] = value;
    this.save();
    this.notify(path, value);
  }

  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);
    return () => this.listeners.get(path)?.delete(callback);
  }

  notify(path, value) {
    // Notify exact matches
    const set = this.listeners.get(path);
    if (set) {
      for (const cb of set) {
        try { cb(value); } catch (e) { console.error('[Vault listener err]', e); }
      }
    }
    // Global event for shell UI
    window.dispatchEvent(new CustomEvent('newtype:vault-change', { detail: { path, value } }));
  }

  exportJson() {
    return JSON.stringify(this.data, null, 2);
  }

  importJson(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      this.data = {
        ai: { ...DEFAULT_VAULT.ai, ...(parsed.ai || {}) },
        mobility: { ...DEFAULT_VAULT.mobility, ...(parsed.mobility || {}) },
        finance: { ...DEFAULT_VAULT.finance, ...(parsed.finance || {}) },
        glasses: { ...DEFAULT_VAULT.glasses, ...(parsed.glasses || {}) },
        weather: { ...DEFAULT_VAULT.weather, ...(parsed.weather || {}) },
        dashboard: { ...DEFAULT_VAULT.dashboard, ...(parsed.dashboard || {}) },
      };
      this.save();
      this.notify('*', this.data);
      return true;
    } catch (e) {
      console.error('[Vault] Import failed:', e);
      return false;
    }
  }
}

export const vault = new VaultManager();

