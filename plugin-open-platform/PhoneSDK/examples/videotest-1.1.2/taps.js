// 0.8.5: touch control from the glasses (owner 2026-11-06: "tap for play pause, double tap for next, and 3 for tap
// for prior", "hold for captions").
// The glasses half (version 9) passes on what the Host reports for the touch bar: SINGLE, DOUBLE or LONG. The SDK
// has no triple tap (sdk/GlassSDK/include/gm_plugin.h, GM_PLUGIN_BUTTON_ACTION_*), so taps are counted here:
// everything that comes within WINDOW ms of the one before belongs to the same gesture.
// It is not known how the real glasses report a double tap: as DOUBLE alone, or as SINGLE and then DOUBLE.
// Both are read as two taps (a DOUBLE right after a SINGLE adds one, not two). The raw order is handed to onGesture
// so the first real test shows in the log what the Host sends.
export const TAP_WINDOW_MS = 700;
export const TAP_SINGLE = 1;
export const TAP_DOUBLE = 2;
export const TAP_LONG = 3;

export class TapCounter {
  /** onGesture(name, seq): name is 'tap' | 'double' | 'triple' | 'hold'; seq is the raw order, e.g. ['S', 'D']. */
  constructor({ onGesture, windowMs = TAP_WINDOW_MS, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) }) {
    this.onGesture = onGesture; this.windowMs = windowMs; this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.count = 0; this.seq = []; this.timer = null;
  }

  feed(action) {
    if (action === TAP_LONG) {             // a hold acts at once and drops any taps still being counted
      this.drop();
      this.onGesture('hold', ['L']);
      return;
    }
    if (action !== TAP_SINGLE && action !== TAP_DOUBLE) return;
    const afterSingle = this.seq[this.seq.length - 1] === 'S';
    this.count += action === TAP_SINGLE ? 1 : afterSingle ? 1 : 2;
    this.seq.push(action === TAP_SINGLE ? 'S' : 'D');
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => { this.fire(); }, this.windowMs);
  }

  fire() {
    const n = this.count; const seq = this.seq;
    this.timer = null; this.count = 0; this.seq = [];
    if (n > 0) this.onGesture(n === 1 ? 'tap' : n === 2 ? 'double' : 'triple', seq);
  }

  drop() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null; this.count = 0; this.seq = [];
  }
}
