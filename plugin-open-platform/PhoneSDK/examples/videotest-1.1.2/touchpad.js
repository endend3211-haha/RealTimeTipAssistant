// 0.8.13 Touchpad remote: the phone screen acts like the glasses touch bar (copied from Desk's touchpad.js, without
// the zoom / page-move parts Desk needs for Comics). Pure logic: the timers come in as arguments so tests never wait.
// tap = single, two quick taps = double, press and hold = long, swipe = left / right / up / down.

export const TAP_SLOP_PX = 12;   // a finger may wobble this far and still be a tap
export const SWIPE_PX = 40;      // a move this long (on its main axis) is a swipe
export const DOUBLE_MS = 300;    // second tap within this time = double tap
export const LONG_MS = 550;      // held this long without moving = long press

export function swipeOf(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// What each gesture means on the MM Video remote (the same words the glasses taps use, see onGesture in plugin.js).
export const PAD_ACTIONS = {
  single: 'tap', double: 'double', long: 'hold', right: 'tap', left: 'double', down: 'stop', up: null,
};
export const PAD_WORDS = {
  single: 'Next channel', double: 'Previous channel', long: 'Captions', right: 'Next channel', left: 'Previous channel', down: 'Stop', up: 'Swipe down stops',
};

export function createTouchpad({ setTimer, clearTimer, onAction }) {
  let touch = null;       // { x, y, moved, swiped, longFired, longTimer }
  let pendingTap = null;  // timer id of a single tap that may still become a double

  const emit = (a) => { try { onAction(a); } catch { /* the page handles its own errors */ } };
  const flushTap = () => {
    if (pendingTap == null) return;
    clearTimer(pendingTap);
    pendingTap = null;
    emit('single');
  };
  const stopLong = () => {
    if (touch && touch.longTimer != null) { clearTimer(touch.longTimer); touch.longTimer = null; }
  };

  return {
    down(x, y) {
      stopLong();
      touch = { x, y, moved: false, swiped: false, longFired: false, longTimer: null };
      const t = touch;
      t.longTimer = setTimer(() => {
        if (touch !== t || t.moved) return;
        t.longTimer = null;
        t.longFired = true;
        flushTap();
        emit('long');
      }, LONG_MS);
    },
    move(x, y) {
      const t = touch;
      if (!t || t.longFired || t.swiped) return;
      if (!t.moved && Math.hypot(x - t.x, y - t.y) > TAP_SLOP_PX) { t.moved = true; stopLong(); }
      if (!t.moved) return;
      const dir = swipeOf(t.x, t.y, x, y);
      if (dir) { t.swiped = true; flushTap(); emit(dir); }
    },
    up(x, y) {
      const t = touch;
      if (!t) return;
      stopLong();
      touch = null;
      if (t.longFired || t.swiped) return;
      if (t.moved || Math.hypot(x - t.x, y - t.y) > TAP_SLOP_PX) {
        const dir = swipeOf(t.x, t.y, x, y);
        if (dir) { flushTap(); emit(dir); }
        return; // a short drag that is not a swipe does nothing
      }
      if (pendingTap != null) {
        clearTimer(pendingTap);
        pendingTap = null;
        emit('double');
        return;
      }
      pendingTap = setTimer(() => { pendingTap = null; emit('single'); }, DOUBLE_MS);
    },
    cancel() {
      stopLong();
      touch = null;
    },
  };
}

// Fingers use touch events with preventDefault on every move: otherwise the phone starts panning the page on an
// up / down swipe and cancels it. Mouse and pen keep the pointer events. A second finger is ignored.
export function bindPadArea(padArea, touchpad) {
  let padTouchId = null;
  const padTouch = (e) => [...e.changedTouches].find((t) => t.identifier === padTouchId);
  padArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (padTouchId !== null) return;
    const t = e.changedTouches[0];
    padTouchId = t.identifier;
    touchpad.down(t.clientX, t.clientY);
  }, { passive: false });
  padArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = padTouch(e);
    if (t) touchpad.move(t.clientX, t.clientY);
  }, { passive: false });
  padArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    const t = padTouch(e);
    if (!t) return;
    padTouchId = null;
    touchpad.up(t.clientX, t.clientY);
  }, { passive: false });
  padArea.addEventListener('touchcancel', () => { padTouchId = null; touchpad.cancel(); });
  const padMouse = (e) => e.isPrimary && e.pointerType !== 'touch';
  padArea.addEventListener('pointerdown', (e) => {
    if (!padMouse(e)) return;
    e.preventDefault();
    try { padArea.setPointerCapture(e.pointerId); } catch { /* old webview */ }
    touchpad.down(e.clientX, e.clientY);
  });
  padArea.addEventListener('pointermove', (e) => { if (padMouse(e)) touchpad.move(e.clientX, e.clientY); });
  padArea.addEventListener('pointerup', (e) => { if (padMouse(e)) touchpad.up(e.clientX, e.clientY); });
  padArea.addEventListener('pointercancel', (e) => { if (padMouse(e)) touchpad.cancel(); });
  padArea.addEventListener('contextmenu', (e) => e.preventDefault());
}
