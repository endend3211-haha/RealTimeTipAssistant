// MMHUD v1 - phone-side codec and link. Spec: docs/PROTOCOL.md.
// Kept byte-identical in every kit plugin until a plugin has run on hardware.

export const VERSION = 1;
export const MAX_ROWS = 10;
export const MAX_SCREEN_BYTES = 1024;
export const SEP = ' · '; // footer separator; glyph coverage is a device bench item

export const MSG = Object.freeze({ SCREEN: 0x01, EXIT: 0x03, HELLO: 0x81, INPUT: 0x82 });

export const IN = Object.freeze({
  TAP_SINGLE: 1 << 0,
  TAP_DOUBLE: 1 << 1,
  TAP_LONG: 1 << 2,
  NOD: 1 << 3,
  SHAKE: 1 << 4,
  LEFT: 1 << 5,
  RIGHT: 1 << 6,
  RAISE: 1 << 7,
  LOWER: 1 << 8,
  NAV: 1 << 9,
});

export const FLAG = Object.freeze({ HEADER_LARGE: 0x01 });

// Numeric values mirror gm_plugin.h (buttons, actions, gestures).
const BUTTON = Object.freeze({
  PRIMARY: 1, UP: 2, DOWN: 3, LEFT: 4, RIGHT: 5, PAGE_UP: 6, PAGE_DOWN: 7,
  SCROLL_UP: 8, SCROLL_DOWN: 9, BACK: 10, HOME: 11,
});
const ACTION = Object.freeze({ SINGLE: 1, DOUBLE: 2, LONG: 3, VERY_LONG: 4, RELEASE: 5, TRIGGER: 6 });
const GESTURE = Object.freeze({ NOD: 1, HEAD_RAISE: 2, HEAD_LOWER: 3, SHAKE: 4, LEFT: 7, RIGHT: 8 });

const BUTTON_NAMES = Object.freeze({
  [BUTTON.UP]: 'UP', [BUTTON.DOWN]: 'DOWN', [BUTTON.LEFT]: 'LEFT', [BUTTON.RIGHT]: 'RIGHT',
  [BUTTON.PAGE_UP]: 'PAGE_UP', [BUTTON.PAGE_DOWN]: 'PAGE_DOWN',
  [BUTTON.SCROLL_UP]: 'SCROLL_UP', [BUTTON.SCROLL_DOWN]: 'SCROLL_DOWN',
  [BUTTON.BACK]: 'BACK', [BUTTON.HOME]: 'HOME',
});
const GESTURE_NAMES = Object.freeze({
  [GESTURE.NOD]: 'NOD', [GESTURE.SHAKE]: 'SHAKE', [GESTURE.LEFT]: 'HEAD_LEFT',
  [GESTURE.RIGHT]: 'HEAD_RIGHT', [GESTURE.HEAD_RAISE]: 'HEAD_RAISE', [GESTURE.HEAD_LOWER]: 'HEAD_LOWER',
});

const encoder = new TextEncoder();

// Failures worth sending a screen again for (the glasses side is not up yet, or the link dropped): never permission or argument errors.
const RETRY_CODES = new Set(['CAPABILITY_UNAVAILABLE', 'DEVICE_DISCONNECTED', 'TIMEOUT']);
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/** Clip text to at most maxBytes of UTF-8 without splitting a character. */
export function clipUtf8(text, maxBytes) {
  let used = 0;
  let out = '';
  for (const ch of String(text)) {
    const size = encoder.encode(ch).length;
    if (used + size > maxBytes) break;
    out += ch;
    used += size;
  }
  return out;
}

/** Greedy word wrap by code point count. Hard-splits words longer than cols. */
export function wrapText(text, cols) {
  if (!Number.isInteger(cols) || cols < 1) throw new RangeError('cols must be a positive integer');
  const lines = [];
  for (const paragraph of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    if (words.length === 0) { lines.push(''); continue; }
    let line = [];
    let width = 0;
    const flush = () => { lines.push(line.join(' ')); line = []; width = 0; };
    for (const word of words) {
      let chars = Array.from(word);
      while (chars.length > cols) {
        if (width > 0) flush();
        lines.push(chars.slice(0, cols).join(''));
        chars = chars.slice(cols);
      }
      const need = chars.length + (width > 0 ? 1 : 0);
      if (width + need > cols) flush();
      line.push(chars.join(''));
      width += chars.length + (width > 0 ? 1 : 0);
    }
    if (width > 0) flush();
  }
  return lines;
}

/** Truncate one line to cols code points, ending with an ellipsis when cut. */
export function ellipsize(text, cols) {
  const chars = Array.from(String(text));
  if (chars.length <= cols) return chars.join('');
  return chars.slice(0, Math.max(0, cols - 1)).join('') + '…';
}

export function encodeScreen({ seq = 0, state = 0, mask = 0, flags = 0, header = '', rows = [], footer = '' }) {
  if (rows.length > MAX_ROWS) throw new RangeError(`at most ${MAX_ROWS} rows (got ${rows.length})`);
  const parts = [header, ...rows, footer].map((value) => {
    const text = String(value);
    if (text.includes('\0')) throw new RangeError('screen text must not contain NUL');
    return encoder.encode(text);
  });
  const total = 8 + parts.reduce((sum, part) => sum + part.length + 1, 0);
  if (total > MAX_SCREEN_BYTES) throw new RangeError(`screen is ${total} bytes (max ${MAX_SCREEN_BYTES})`);
  const out = new Uint8Array(total);
  out[0] = VERSION;
  out[1] = MSG.SCREEN;
  out[2] = seq & 0xff;
  out[3] = state & 0xff;
  out[4] = mask & 0xff;
  out[5] = (mask >> 8) & 0xff;
  out[6] = flags & 0xff;
  out[7] = rows.length;
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
    out[at++] = 0;
  }
  return out;
}

export function encodeExit() {
  return Uint8Array.of(VERSION, MSG.EXIT);
}

export function decodeGlassMessage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2 || bytes[0] !== VERSION) {
    throw new Error('not an MMHUD v1 message');
  }
  if (bytes[1] === MSG.HELLO && bytes.length === 10) {
    return {
      type: 'hello',
      rows: bytes[2],
      cols: bytes[3],
      width: (bytes[4] << 8) | bytes[5],
      height: (bytes[6] << 8) | bytes[7],
      lineHeight: bytes[8],
      hasImu: bytes[9] !== 0,
    };
  }
  if (bytes[1] === MSG.INPUT && bytes.length === 6) {
    const [, , seq, kind, code, aux] = bytes;
    let name = null;
    if (kind === 1) {
      if (aux === BUTTON.PRIMARY) {
        name = code === ACTION.SINGLE ? 'TAP' : code === ACTION.DOUBLE ? 'DOUBLE_TAP'
          : code === ACTION.LONG ? 'LONG_TAP' : null;
      } else if (aux === BUTTON.BACK || aux === BUTTON.HOME) {
        name = BUTTON_NAMES[aux];
      } else if (code === ACTION.TRIGGER) {
        name = BUTTON_NAMES[aux] ?? null;
      }
    } else if (kind === 2) {
      name = GESTURE_NAMES[code] ?? null;
    }
    if (name === null) throw new Error(`unknown input kind=${kind} code=${code} aux=${aux}`);
    return { type: 'input', seq, source: kind === 1 ? 'button' : 'gesture', name };
  }
  throw new Error(`unknown or malformed glasses message type 0x${bytes[1].toString(16)}`);
}

/**
 * Phone end of the link. `gm` is the PhoneSDK object (gm.plugin.sendMessage /
 * gm.plugin.onMessage). Resends the current screen when the glasses say HELLO,
 * drops inputs aimed at a screen that is no longer current, and applies the
 * same 350 ms gesture refractory as the glasses (taps always win).
 */
export class HudLink {
  constructor({ gm, channel, now = () => Date.now(), refractoryMs = 350, log = () => {}, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle) } }) {
    this.gm = gm;
    this.channel = channel;
    this.now = now;
    this.refractoryMs = refractoryMs;
    this.log = log;
    this.timers = timers;         // injectable for tests; wrappers, because the phone app's page throws if a bare clearTimeout is called as timers.clear(...)
    this.retries = 0;             // retries used for the current screen
    this.retryPending = false;
    this.retryHandle = null;
    this.seq = 0;
    this.last = null;
    this.glass = null;
    this.lastAcceptAt = null;
    this.off = null;
    this.onHello = () => {};
    this.onInput = () => {};
  }

  start({ onHello, onInput } = {}) {
    if (onHello) this.onHello = onHello;
    if (onInput) this.onInput = onInput;
    this.off?.();
    this.off = this.gm.plugin.onMessage((message) => this.#receive(message));
  }

  stop() {
    this.off?.();
    this.off = null;
    this.#cancelRetry();
  }

  /** Returns true when sent, false when the transport refused (e.g. disconnected). */
  async show(screen) {
    this.seq = (this.seq + 1) & 0xff;
    this.last = { ...screen, seq: this.seq };
    this.#cancelRetry();
    this.retries = 0;
    return this.#send(encodeScreen(this.last), true);
  }

  async resend() {
    return this.last ? this.#send(encodeScreen(this.last), true) : false;
  }

  async exit() {
    this.#cancelRetry();
    return this.#send(encodeExit());
  }

  /**
   * A screen the host refused because the glasses side is not ready yet is sent again a few times (1, 2, 4, 8 s), then left to the glasses'
   * HELLO. The phone app's diagnostics (2026-10-18) show the first sends after the page starts failing with CAPABILITY_UNAVAILABLE "device
   * plugin is not ready for this runtime generation" for about 5 s, and later sends being accepted; nothing re-sent the first screen.
   */
  async #send(bytes, screen = false) {
    try {
      await this.gm.plugin.sendMessage(this.channel, bytes);
      if (screen) this.retries = 0;
      return true;
    } catch (error) {
      this.log(`send failed: ${[error?.code, error?.message].filter(Boolean).join(' ') || error}`);
      if (screen && RETRY_CODES.has(error?.code)) this.#scheduleRetry();
      return false;
    }
  }

  #scheduleRetry() {
    if (this.retryPending || this.retries >= RETRY_DELAYS_MS.length) return;
    const delay = RETRY_DELAYS_MS[this.retries];
    this.retries += 1;
    this.retryPending = true;
    this.retryHandle = this.timers.set(() => { this.retryPending = false; void this.resend(); }, delay);
    this.retryHandle?.unref?.(); // never keep a Node process alive for it (tests)
  }

  #cancelRetry() {
    if (this.retryPending) this.timers.clear(this.retryHandle);
    this.retryPending = false;
    this.retryHandle = null;
  }

  #receive({ channel, data }) {
    if (channel !== this.channel) return;
    let message;
    try {
      message = decodeGlassMessage(data);
    } catch (error) {
      this.log(`ignored: ${error.message}`);
      return;
    }
    if (message.type === 'hello') {
      this.glass = message;
      this.onHello(message);
      void this.resend();
      return;
    }
    if (message.seq !== this.seq) {
      this.log(`dropped stale ${message.name} (seq ${message.seq}, current ${this.seq})`);
      return;
    }
    const at = this.now();
    if (message.source === 'gesture' && this.lastAcceptAt !== null && at - this.lastAcceptAt < this.refractoryMs) {
      this.log(`dropped ${message.name} inside refractory window`);
      return;
    }
    this.lastAcceptAt = at;
    this.onInput(message);
  }
}
