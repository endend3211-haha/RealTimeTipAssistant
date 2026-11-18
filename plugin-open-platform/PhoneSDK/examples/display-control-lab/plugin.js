import { createGMPlugin } from './vendor/gm-plugin-web-sdk.esm.js';
import {
  DISPLAY_CONTROL_COMMAND_CHANNEL,
  decodeDisplayControlState,
  displayControlOperation,
  encodeDisplayControlCommand,
} from './display-control-protocol.js';
import { createI18n } from './i18n.js';

const gm = createGMPlugin();
const i18n = createI18n();
const COMMAND_TIMEOUT_MS = 3500;
const RESTORE_TIMEOUT_MS = 12000;
const element = (id) => document.querySelector(`#${id}`);
const ui = {
  languageToggle: element('language-toggle'),
  hostStatus: element('host-status'),
  deviceStatus: element('device-status'),
  runtimeMode: element('runtime-mode'),
  notice: element('notice'),
  screenValue: element('screen-value'),
  brightness: element('brightness'),
  brightnessValue: element('brightness-value'),
  height: element('height'),
  heightValue: element('height-value'),
  distance: element('distance'),
  distanceValue: element('distance-value'),
  restore: element('restore'),
};

const state = {
  screenOn: true,
  requestedScreenOn: true,
  previewOnly: false,
  restoreInProgress: false,
  autoBrightnessBlocked: false,
  brightness: 6,
  height: 4,
  distance: 4,
};
const pending = new Map();
let bridgeReady = false;
let deviceConnected = false;
let transport = 'unknown';
let browserPreview = false;
let desktopPreview = false;
let commandRunning = false;
let activeOperation = null;
let requestId = 0;
let subscriptionId;
let offPluginMessage;
let offConnection;
let noticeKey = '준비 완료: 호스트 연결 대기 중...';
let noticeTone = '';
let noticeVariables;

// 한글 텍스트 매핑 헬퍼
function getKoreanText(key, variables) {
  const koreanDict = {
    'runtime.connecting': '연결 중...',
    'runtime.connected': '연결됨',
    'runtime.disconnected': '연결 끊김',
    'runtime.browser': '브라우저 시뮬레이터',
    'runtime.desktop': '스튜디오 프리뷰',
    'runtime.physical': '실물 안경 기기',
    'screen.onValue': '켜짐 (ON)',
    'screen.offValue': '꺼짐 (OFF)',
    'action.restore': '초기 설정으로 복원',
    'action.restoring': '복원 진행 중...',
    'notice.initializing': '플러그인 호스트 연결 대기 중...',
    'notice.ready': '스마트 안경 시스템이 정상 준비되었습니다.',
    'notice.sent': '명령이 안경으로 성공적으로 전달되었습니다.',
    'notice.preview': '시뮬레이터 프리뷰 모드로 동작 중입니다.',
    'notice.restoring': '안경 설정을 기본값으로 복원하고 있습니다...',
    'notice.woke': '안경 물리 버튼으로 화면을 켰습니다.',
    'notice.unavailable': '안경 기기가 연결되어 있지 않습니다.',
    'notice.failed': '명령 처리에 실패했습니다.',
  };
  return koreanDict[key] || i18n.t(key, variables);
}

function text(key, variables) {
  return getKoreanText(key, variables);
}

function setNotice(key, tone = '', variables) {
  noticeKey = key;
  noticeTone = tone;
  noticeVariables = variables;
  if (ui.notice) {
    ui.notice.textContent = text(key, variables);
    ui.notice.className = `notice${tone ? ` ${tone}` : ''}`;
  }
}

function runtimeModeKey() {
  if (browserPreview) return 'runtime.browser';
  if (desktopPreview) return 'runtime.desktop';
  return 'runtime.physical';
}

function shownScreenOn() {
  return state.previewOnly ? state.requestedScreenOn : state.screenOn;
}

function renderState() {
  const shownOn = shownScreenOn();
  const value = shownOn ? '켜짐' : '꺼짐';
  if (ui.screenValue) {
    ui.screenValue.textContent = state.previewOnly
      ? `현재 상태(가상): ${value}`
      : `현재 상태: ${value}`;
  }
  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.screen) === Number(shownOn));
  });
  if (ui.brightness) ui.brightness.value = String(state.brightness);
  if (ui.height) ui.height.value = String(state.height);
  if (ui.distance) ui.distance.value = String(state.distance);
  if (ui.brightnessValue) ui.brightnessValue.textContent = String(state.brightness);
  if (ui.heightValue) ui.heightValue.textContent = String(state.height);
  if (ui.distanceValue) ui.distanceValue.textContent = String(state.distance);
}

function updateAvailability() {
  const available = bridgeReady && (browserPreview || deviceConnected) && !commandRunning;
  document.querySelectorAll('[data-screen], input[type="range"]').forEach((control) => {
    control.disabled = !available;
  });
  if (ui.restore) {
    ui.restore.disabled = !available;
    const restoring = commandRunning && activeOperation === displayControlOperation.restore;
    ui.restore.textContent = text(restoring ? 'action.restoring' : 'action.restore');
    ui.restore.setAttribute('aria-busy', String(restoring));
  }
  if (ui.hostStatus) {
    ui.hostStatus.textContent = bridgeReady ? text('runtime.connected') : text('runtime.connecting');
  }
  if (ui.deviceStatus) {
    ui.deviceStatus.textContent = deviceConnected || browserPreview
      ? text('runtime.connected')
      : text('runtime.disconnected');
  }
  if (ui.runtimeMode) {
    ui.runtimeMode.textContent = bridgeReady ? text(runtimeModeKey()) : '—';
  }
}

function renderAll() {
  renderState();
  updateAvailability();
  if (ui.notice) {
    ui.notice.textContent = text(noticeKey, noticeVariables);
    ui.notice.className = `notice${noticeTone ? ` ${noticeTone}` : ''}`;
  }
}

function nextRequestId() {
  requestId = (requestId + 1) >>> 0;
  if (requestId === 0) requestId = 1;
  return requestId;
}

function acceptState(next) {
  Object.assign(state, {
    screenOn: next.screenOn,
    requestedScreenOn: next.requestedScreenOn,
    previewOnly: next.previewOnly,
    restoreInProgress: next.restoreInProgress,
    autoBrightnessBlocked: next.autoBrightnessBlocked,
    brightness: next.brightness,
    height: next.height,
    distance: next.distance,
  });
  renderState();
  const wokeFromGlasses = next.requestId === 0 &&
    next.lastOperation === displayControlOperation.setScreen &&
    (next.previewOnly ? next.requestedScreenOn : next.screenOn);
  if (wokeFromGlasses) setNotice('notice.woke', 'success');
  const waiter = pending.get(next.requestId);
  if (waiter) {
    if (next.restoreInProgress) {
      armWaiter(next.requestId, waiter);
      setNotice('notice.restoring');
      return;
    }
    pending.delete(next.requestId);
    clearTimeout(waiter.timer);
    if (next.statusCode === 0) waiter.resolve(next);
    else waiter.reject(new Error(next.status));
  }
}

function armWaiter(id, waiter) {
  clearTimeout(waiter.timer);
  waiter.timer = setTimeout(() => {
    pending.delete(id);
    waiter.reject(new Error('GLASSES_RESPONSE_TIMEOUT'));
  }, waiter.timeoutMs);
}

function waitForState(id, timeoutMs = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject, timer: undefined, timeoutMs };
    pending.set(id, waiter);
    armWaiter(id, waiter);
  });
}

function simulateCommand(operation, value) {
  state.previewOnly = true;
  if (operation === displayControlOperation.setScreen) {
    state.requestedScreenOn = value === 1;
    state.screenOn = true;
  } else if (operation === displayControlOperation.setBrightness) {
    state.brightness = value;
    state.autoBrightnessBlocked = true;
  } else if (operation === displayControlOperation.setHeight) {
    state.height = value;
  } else if (operation === displayControlOperation.setDistance) {
    state.distance = value;
  } else if (operation === displayControlOperation.restore) {
    Object.assign(state, {
      screenOn: true,
      requestedScreenOn: true,
      brightness: 6,
      height: 4,
      distance: 4,
      autoBrightnessBlocked: false,
    });
  }
  renderState();
  return { ...state, statusCode: 0, status: 'OK', operation };
}

async function sendCommand(operation, value = 0) {
  if (browserPreview) return simulateCommand(operation, value);
  const id = nextRequestId();
  const timeoutMs = operation === displayControlOperation.restore
    ? RESTORE_TIMEOUT_MS : COMMAND_TIMEOUT_MS;
  const response = waitForState(id, timeoutMs);
  try {
    await gm.plugin.sendMessage(DISPLAY_CONTROL_COMMAND_CHANNEL,
      encodeDisplayControlCommand({
        requestId: id,
        operation,
        value,
        previewOnly: desktopPreview && operation === displayControlOperation.setScreen,
      }));
    return await response;
  } catch (error) {
    const waiter = pending.get(id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(id);
    }
    throw error;
  }
}

async function runCommand(operation, value = 0) {
  if (commandRunning) return;
  commandRunning = true;
  activeOperation = operation;
  if (operation === displayControlOperation.restore) {
    setNotice('notice.restoring');
  }
  updateAvailability();
  try {
    const result = await sendCommand(operation, value);
    setNotice(result.previewOnly || browserPreview || desktopPreview
      ? 'notice.preview' : 'notice.sent', 'success');
  } catch (error) {
    setNotice('notice.failed', 'error', { error: error.message });
    if (operation !== displayControlOperation.query && !browserPreview) {
      await sendCommand(displayControlOperation.query).catch(() => undefined);
    }
  } finally {
    commandRunning = false;
    activeOperation = null;
    updateAvailability();
  }
}

function bindRange(input, output, operation) {
  if (!input || !output) return;
  input.addEventListener('input', () => { output.textContent = input.value; });
  input.addEventListener('change', () => void runCommand(operation, Number(input.value)));
}

document.querySelectorAll('[data-screen]').forEach((button) => {
  button.addEventListener('click', () => {
    void runCommand(displayControlOperation.setScreen, Number(button.dataset.screen));
  });
});
if (ui.brightness && ui.brightnessValue) bindRange(ui.brightness, ui.brightnessValue, displayControlOperation.setBrightness);
if (ui.height && ui.heightValue) bindRange(ui.height, ui.heightValue, displayControlOperation.setHeight);
if (ui.distance && ui.distanceValue) bindRange(ui.distance, ui.distanceValue, displayControlOperation.setDistance);
if (ui.restore) ui.restore.addEventListener('click', () => void runCommand(displayControlOperation.restore));

async function refreshFromGlasses() {
  if (browserPreview) {
    simulateCommand(displayControlOperation.query, 0);
    setNotice('notice.preview', 'success');
    return;
  }
  if (!deviceConnected) {
    setNotice('notice.unavailable', 'error');
    return;
  }
  await runCommand(displayControlOperation.query);
}

async function initialize() {
  renderAll();
  try {
    await gm.ready();
    offPluginMessage = gm.plugin.onMessage((message) => {
      const next = decodeDisplayControlState(message);
      if (next) acceptState(next);
    });
    offConnection = gm.device.onConnection((event) => {
      deviceConnected = event.connected === true;
      updateAvailability();
      if (!bridgeReady) return;
      if (deviceConnected) void refreshFromGlasses();
      else setNotice('notice.unavailable', 'error');
    });
    subscriptionId = (await gm.device.subscribeEvents(['connection'])).subscriptionId;
    const info = await gm.device.getInfo();
    transport = String(info.transport ?? 'unknown').toLowerCase();
    browserPreview = transport === 'studio';
    desktopPreview = transport === 'desktop-simulator' || transport.includes('simulator');
    deviceConnected = info.connected === true;
    bridgeReady = true;
    updateAvailability();
    setNotice('notice.ready', 'success');
    await refreshFromGlasses();
  } catch (error) {
    bridgeReady = false;
    updateAvailability();
    setNotice('notice.failed', 'error', { error: error.message });
  }
}

window.addEventListener('pagehide', () => {
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('RUNTIME_CLOSED'));
  }
  pending.clear();
  offPluginMessage?.();
  offConnection?.();
  if (subscriptionId) void gm.device.unsubscribeEvents(subscriptionId).catch(() => undefined);
  gm.close();
});

void initialize();