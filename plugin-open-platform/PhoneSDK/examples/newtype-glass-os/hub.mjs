// Newtype Glass OS - Central Hub & Event Router
import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import { DirtyRenderer } from './core/dirty_renderer.mjs';
import { vault } from './core/vault.mjs';

let gmInstance = null;
let renderer = null;
let activeAppId = 'home';
let running = true;
let subscription = null;
const clients = new Map();

// Battery state received from Glass native companion via channel 18256 (0x4750)
const batteryState = {
  percent: null,
  isCharging: false,
  updatedAt: 0,
};

export function getGlassBattery() {
  const isStale = Date.now() - batteryState.updatedAt > 35000;
  return isStale ? null : batteryState;
}

export function getGM() {
  if (!gmInstance) {
    gmInstance = createGMPlugin();
    renderer = new DirtyRenderer(gmInstance);

    // Listen to device messaging on 18256 (Glow / MemoMind native battery protocol)
    if (gmInstance.device?.onMessage) {
      gmInstance.device.onMessage(({ channel, data }) => {
        if (channel === 0x4750 && data && data.length >= 2) {
          batteryState.percent = data[0] <= 100 ? data[0] : null;
          batteryState.isCharging = data[1] === 1;
          batteryState.updatedAt = Date.now();
          window.dispatchEvent(new CustomEvent('newtype:battery-update', { detail: batteryState }));
        }
      });
    }

    gmInstance.on('runtime.lifecycleChanged', (e) => {
      running = e.state === 'running';
      notifyLifecycle();
    });
  }
  return gmInstance;
}

export function getRenderer() {
  getGM();
  return renderer;
}

function notifyLifecycle() {
  for (const [id, client] of clients) {
    const isAppRunning = running && id === activeAppId;
    for (const fn of client.lifecycle) {
      try {
        fn({ state: isAppRunning ? 'running' : 'suspended' });
      } catch (err) {
        console.error(`[Hub Lifecycle Error in ${id}]`, err);
      }
    }
  }
}

export function activate(id) {
  if (activeAppId === id) return;
  console.log(`[Hub] Switching active app: ${activeAppId} -> ${id}`);
  activeAppId = id;
  // Glass framebuffer may have been overwritten by the previous app (e.g. direct LZ4 video frames).
  // Invalidate the dirty-tile cache so the next render repaints every tile instead of being skipped.
  if (renderer) renderer.reset();
  notifyLifecycle();
  window.dispatchEvent(new CustomEvent('newtype:active-changed', { detail: id }));
}

export function getActiveAppId() {
  return activeAppId;
}

export function navigate(targetAppId) {
  window.dispatchEvent(new CustomEvent('newtype:navigate', { detail: targetAppId }));
}

export async function resubscribe() {
  const gm = getGM();
  if (subscription) {
    const old = await subscription;
    await gm.device.unsubscribeEvents(old.subscriptionId).catch(() => {});
  }
  subscription = gm.device.subscribeEvents(['button', 'imuGesture', 'connection']);
  return subscription;
}

export function createScopedPlugin(id) {
  const gm = getGM();
  const client = { lifecycle: [] };
  clients.set(id, client);

  const device = { ...gm.device };

  // Scoped Button Handler with Global Long-Press Home Invariant!
  device.onButton = (handler) => {
    return gm.device.onButton((e) => {
      const act = String(e.action || '').toLowerCase();
      const isLong = act === 'long' || act === 'longpress' || act === 'very_long' || act === 'hold';

      // 🚨 Global UX Invariant: Long press always returns to Home Desktop!
      if (isLong && activeAppId !== 'home') {
        console.log('[Hub] Global Long-Press detected! Returning to Home.');
        navigate('home');
        return;
      }

      // Route button event only to currently active app
      if (activeAppId === id && running) {
        handler(e);
      }
    });
  };

  // Scoped Gesture Handler (checked against vault.glasses.gestureEnabled)
  device.onGesture = (handler) => {
    return gm.device.onGesture((e) => {
      const gesturesAllowed = vault.get('glasses.gestureEnabled', true);
      if (!gesturesAllowed) return;

      if (activeAppId === id && running) {
        handler(e);
      }
    });
  };

  device.onConnection = (handler) => {
    return gm.device.onConnection((e) => {
      if (!e.connected) {
        batteryState.percent = null;
        batteryState.updatedAt = 0;
      }
      if (activeAppId === id && running) {
        handler(e);
      }
    });
  };

  device.subscribeEvents = async () => {
    subscription ??= resubscribe();
    return subscription;
  };

  device.unsubscribeEvents = async () => ({ released: true });

  return {
    ...gm,
    device,
    display: gm.display,
    ready: () => gm.ready(),
    on(name, fn) {
      if (name === 'runtime.lifecycleChanged') {
        client.lifecycle.push(fn);
        return () => {
          client.lifecycle = client.lifecycle.filter((f) => f !== fn);
        };
      }
      return gm.on(name, fn);
    },
  };
}

window.addEventListener('pagehide', () => {
  if (gmInstance) gmInstance.close();
});

