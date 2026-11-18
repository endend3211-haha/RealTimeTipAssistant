// MM Video Test, phone side logic (pure: no DOM, no SDK). The page (plugin.js) passes in the link and the clock.
// Protocol: see glass/videotest.c. One whole frame per message, one message in flight, the next one goes as soon as
// the transport confirms the last one (sendMessage resolves when the glasses got it).
import { lz4Compress } from './lz4.js';
import { SkStream, skLevel } from './skvideo.js';

export const CHANNEL = 21015;
export const MAX_W = 320;
export const MAX_H = 180;
export const SIZES = Object.freeze([[80, 45], [120, 68], [160, 90], [200, 112], [240, 135], [320, 180]]);
export const PATTERNS = Object.freeze(['simple', 'busy', 'cartoon']);
export const KEY_EVERY = 15; // delta keyframe cadence: a full frame this often repairs any drift
const IMG_Y = 8, TEXT_H = 14, TEXT_GAP = 6, MAX_SCALE = 8;

/** Biggest whole-number zoom that fits the glasses screen above the stats line (same rule as videotest.c). */
export function scaleFor(w, h, dispW = 600, dispH = 350) {
  const room = dispH - TEXT_H - TEXT_GAP - IMG_Y - 4;
  return Math.max(1, Math.min(MAX_SCALE, Math.floor(dispW / w), Math.floor(room / h)));
}

/** Zoom for the "Picture on glasses" setting: 'big' = scaleFor; 'medium' = about 2/3 of that (160x90: x3 -> x2 =
 * 44% of the area to draw). The zoom travels in every FRAME header, so old glasses draw it too.
 * 'full' = the biggest zoom that fits the whole screen (200x112: x3 = 600x336); only glasses that say so in
 * HELLO (flags bit4, version 7) draw it, older ones refuse the frame: the page falls back to 'big' for them. */
export const PICTURES = Object.freeze(['big', 'medium', 'full']);
export function pictureScale(w, h, dispW = 600, dispH = 350, picture = 'big') {
  const big = scaleFor(w, h, dispW, dispH);
  if (picture === 'full') return Math.max(1, Math.min(MAX_SCALE, Math.floor(dispW / w), Math.floor(dispH / h)));
  return picture === 'medium' ? Math.max(1, Math.round((big * 2) / 3)) : big;
}

/** Brightness 0..255 for one test frame. 'simple' compresses well (flat areas); 'busy' is a moving plasma, close to real video. */
export function renderPattern(kind, w, h, n) {
  const out = new Uint8Array(w * h);
  if (kind === 'busy') {
    const t = n * 0.15;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const u = x / w * 12, v = y / h * 12;
        const s = Math.sin(u + t) + Math.sin(v * 0.8 - t * 1.3) + Math.sin((u + v) * 0.6 + t * 0.7) + Math.sin(Math.hypot(u - 6, v - 6) - t);
        out[y * w + x] = Math.max(0, Math.min(255, Math.round((s + 4) * 32)));
      }
    }
    return out;
  }
  if (kind === 'cartoon') {
    // A bold face on a flat background: mostly static (good for delta), with a slow bounce and a blinking mouth.
    const R = Math.round(h * 0.38), cy = Math.round(h * 0.5);
    const amp = Math.max(0, w / 2 - R - 2), cx = Math.round(w / 2 + amp * Math.sin(n * 0.12));
    const er = Math.max(1, Math.round(R * 0.18)), ey = cy - Math.round(R * 0.2);
    const elx = cx - Math.round(R * 0.4), erx = cx + Math.round(R * 0.4);
    const open = 0.5 + 0.5 * Math.abs(Math.sin(n * 0.25)); // mouth opens and closes
    const my = cy + Math.round(R * 0.15), mr = Math.round(R * 0.5), mth = Math.max(1, Math.round(R * 0.22 * open));
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let v = 30;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) v = 225;                                    // face
        if ((x - elx) ** 2 + (y - ey) ** 2 <= er * er) v = 10;                                  // left eye
        if ((x - erx) ** 2 + (y - ey) ** 2 <= er * er) v = 10;                                  // right eye
        const dm = Math.round(Math.hypot(x - cx, y - my));                                       // smile arc
        if (y > my && dm >= mr - mth && dm <= mr && Math.abs(x - cx) <= mr) v = 10;
        out[y * w + x] = v;
      }
    }
    return out;
  }
  const r = Math.max(3, Math.round(h / 8));
  const span = (len) => { const p = n % (2 * (len - 2 * r)); return r + (p < len - 2 * r ? p : 2 * (len - 2 * r) - p); };
  const bx = span(w), by = span(h);
  const barX = (n * 2) % w;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 20;
      if (y >= h - 4) v = Math.floor(x * 16 / w) * 16;            // grey ramp
      if (Math.abs(x - barX) < 2) v = 160;                       // moving bar
      if ((x - bx) ** 2 + (y - by) ** 2 <= r * r) v = 255;      // bouncing ball
      if (x === 0 || y === 0 || x === w - 1) v = 120;            // frame
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 0.8.35 (owner: "darken the ads 30%"): 0..255 grey or 0..15 levels, scaled by f (0.7 = 30 % darker). New array. */
export const AD_DIM = 0.7;
export function dimLum(lum, f = AD_DIM) {
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i += 1) out[i] = Math.round(lum[i] * f);
  return out;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 0..255 -> 0..15 with 4x4 ordered dither (16 grey levels on the glasses). */
export function quantize(lum, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const q = Math.floor(lum[i] * 15 / 255 + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16);
      out[i] = Math.max(0, Math.min(15, q));
    }
  }
  return out;
}

/** 0..15 levels -> 4-bit packed rows, left pixel in the high nibble. w must be even. */
export function pack4(levels, w, h) {
  if (w % 2) throw new Error('width must be even');
  const out = new Uint8Array(w / 2 * h);
  for (let i = 0, o = 0; o < out.length; i += 2, o += 1) out[o] = ((levels[i] & 15) << 4) | (levels[i + 1] & 15);
  return out;
}

/** FRAME message: 56 01 seq w h scale enc + data. */
export function encodeFrame(seq, w, h, scale, enc, payload) {
  const m = new Uint8Array(10 + payload.length);
  m[0] = 0x56; m[1] = 0x01; m[2] = (seq >> 8) & 255; m[3] = seq & 255;
  m[4] = w >> 8; m[5] = w & 255; m[6] = h >> 8; m[7] = h & 255; m[8] = scale; m[9] = enc;
  m.set(payload, 10);
  return m;
}
export const CLEAR = Uint8Array.of(0x56, 0x02);
// 0.8.6 / glasses v10, TUNE: an old TV between channels while a video loads. ch = place in the list (0 = no number),
// title = plain ASCII, at most 50 letters. Glasses before v10 ignore it. It ends at the first FRAME or at CLEAR.
export function tuneBytes(ch, title = '') {
  const t = String(title ?? '').normalize('NFKD').replace(/\s+/g, ' ').replace(/[^\x20-\x7e]/g, '').replace(/ +/g, ' ').trim().slice(0, 50);
  const m = new Uint8Array(3 + t.length);
  m[0] = 0x56; m[1] = 0x05; m[2] = Math.max(0, Math.min(255, Math.trunc(Number(ch)) || 0));
  for (let i = 0; i < t.length; i += 1) m[3 + i] = t.charCodeAt(i);
  return m;
}
// 0.8.9 / glasses v11, SAVER: whether the glasses bounce the small MM TV badge when idle (on) or write READY (off).
// Glasses before v11 ignore it (on_event returns true for unknown types); they never set the saver bit in HELLO.
export function saverBytes(on) { return Uint8Array.of(0x56, 0x06, on ? 1 : 0); }
// 0.8.11 / glasses v12, CRT: the last of the `scale` screen rows per source row is drawn dimmer (TV scanlines) instead of
// square blocks. The HELLO flags byte is full, so this one is gated on the HELLO version (12 or newer); older glasses
// ignore the message. Cosmetic: it hides blockiness as lines, adds no detail, dims the picture a little.
export function crtBytes(on) { return Uint8Array.of(0x56, 0x07, on ? 1 : 0); }
// 0.8.36 / glasses v16, SMOOTH (owner 2026-11-09: "make my 200x112 look amazing on all modes"): the glasses blow a
// picture up with in-between greys (on) instead of square blocks (off). Default on in the glasses; gated on HELLO
// version 16 like CRT. Older glasses ignore the message and keep blocks.
export function smoothBytes(on) { return Uint8Array.of(0x56, 0x0a, on ? 1 : 0); }
// 0.8.41 (owner 2026-11-09: "240x135 on full screen ... people like bigger images if possible"): glasses v17 draw a Full
// picture as big as the screen allows with its shape kept (240x135 x2 = 480x270 -> 600x337). 56 0B on:u8, on by default.
export function fitBytes(on) { return Uint8Array.of(0x56, 0x0b, on ? 1 : 0); }
// 0.8.21 / glasses v13, BRIGHT (owner: "Anyway to give me brightness control from within the app?"): the glasses
// display brightness while MM Video runs. 1..10 = fixed level (auto-brightness held off), 0 = Auto (the level from
// before comes back). Gated on HELLO version 13 like CRT; the glasses answer with BRIGHTOK (parseGlass 'bright').
export const GLOW_LEVELS = 10;
export function brightBytes(level) {
  const n = Math.trunc(Number(level));
  return Uint8Array.of(0x56, 0x08, Number.isFinite(n) && n >= 0 && n <= GLOW_LEVELS ? n : 0);
}
// 0.8.23 / glasses v15, FONT (owner: "Can we add other fonts?"): the caption letters. 0 = Classic (as before),
// 1 = Clean (Spleen 8x16, 72 letters a line), 2 = Large (Spleen 12x24). Gated on HELLO version 15; older glasses ignore it.
export const CAP_FONTS = ['Classic', 'Clean', 'Large'];
export const CAP_FONT_COLS = [50, 72, 50];
// 0.8.44 "Captions fit the picture" (owner 2026-11-10: "sometimes the screen is too small with giant subtitles"):
// the glasses centre each caption line on the screen, and the picture is centred too, so a line no wider than the
// picture sits under it. CAP_ADV = pixels per letter of each font (videotest.c f_adv: Classic 12, Clean 8, Large 12).
export const CAP_ADV = [12, 8, 12];
export const CAP_SMALL_PIC = 400;   // a picture narrower than this on the glasses gets the Clean (smaller) letters
export const CAP_MIN_COLS = 16;
/** Width in pixels of the picture on the glasses (videotest.c set_layout): w x zoom, or the fill width (v17 Full). */
export function picWidth(w, h, scale, dispW = 600, dispH = 350, fill = false) {
  let ow = w * scale;
  if (fill && scale >= 2) {
    const fw = (dispW * h <= dispH * w ? dispW : Math.floor((w * dispH) / h)) & ~1;
    const fh = dispW * h <= dispH * w ? Math.floor((h * dispW) / w) : dispH;
    if (fw <= 640 && fw <= dispW && fh <= dispH && fw >= ow && fh >= h * scale) ow = fw;
  }
  return Math.min(ow, dispW);
}
/** Caption font + letters a line. fit off = as 0.8.43 (the picked font, lines as wide as the screen). fit on = lines
 * no wider than the picture, and a small picture gets Clean letters (only glasses v15+ can change font). */
export function capFit({ font = 0, picW = 600, glassFont = false, fit = true } = {}) {
  const max = (f) => (glassFont ? CAP_FONT_COLS[f] : 50);
  if (!fit) return { font, cols: max(font) };
  const f = glassFont && picW < CAP_SMALL_PIC ? 1 : font;
  const adv = glassFont ? CAP_ADV[f] : 12;
  return { font: f, cols: Math.max(CAP_MIN_COLS, Math.min(max(f), Math.floor(picW / adv))) };
}
export function fontBytes(f) {
  const n = Math.trunc(Number(f));
  return Uint8Array.of(0x56, 0x09, n >= 0 && n <= 2 ? n : 0);
}
export const ASK = Uint8Array.of(0x56, 0x03);

// Keep asking for HELLO until the glasses answer. The first ASK goes out ~10 ms after the page is ready and the
// phone app refuses it (CAPABILITY_UNAVAILABLE) while the glasses half is still starting (diagnostics 2026-11-06),
// and the HELLO the glasses send at their own start is often lost. One ASK = SK stays off for the whole session.
export class HelloAsker {
  constructor(send, pause, { everyMs = 1000, tries = 90, onTry = () => {} } = {}) {
    this.send = send; this.pause = pause; this.everyMs = everyMs; this.tries = tries; this.onTry = onTry;
    this.answered = false; this.running = false;
  }
  answer() { this.answered = true; }
  /** Start (or restart after a resume) asking; a second call while it runs does nothing. Resolves when it stops. */
  async start() {
    if (this.running || this.answered) return;
    this.running = true;
    try {
      for (let i = 0; i < this.tries && !this.answered; i += 1) {
        let err = null;
        try { await this.send(ASK); } catch (e) { err = e; }
        this.onTry(i + 1, err);
        if (this.answered) break;
        await this.pause(this.everyMs);
      }
    } finally { this.running = false; }
  }
}

const u16 = (d, i) => (d[i] << 8) | d[i + 1];
const u32 = (d, i) => ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3];
/** Glasses -> phone. Returns null for anything that is not ours. */
export function parseGlass(data) {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data || []);
  if (d.length < 2 || d[0] !== 0x56) return null;
  if (d[1] === 0x80 && d.length >= 12) {
    return { type: 'hello', version: d[2], lz4: (d[3] & 1) === 1, delta: (d[3] & 2) === 2, sk: (d[3] & 4) === 4, captions: (d[3] & 8) === 8, full: (d[3] & 16) === 16, taps: (d[3] & 32) === 32, tune: (d[3] & 64) === 64, saver: (d[3] & 128) === 128, crt: d[2] >= 12, glow: d[2] >= 13, lower: d[2] >= 14, font: d[2] >= 15, smooth: d[2] >= 16, fit: d[2] >= 17, maxW: u16(d, 4), maxH: u16(d, 6), dispW: u16(d, 8), dispH: u16(d, 10) };
  }
  if (d[1] === 0x81 && d.length >= 20) {
    return { type: 'stats', received: u32(d, 2), drawn: u32(d, 6), refused: u32(d, 10), lastSeq: u16(d, 14), drawMs: u16(d, 16), fps: u16(d, 18) / 10 };
  }
  // version 9: one report of the touch bar. action: 1 single, 2 double, 3 long (hold); n counts them (0..255)
  if (d[1] === 0x82 && d.length >= 3) return { type: 'tap', action: d[2], n: d.length >= 4 ? d[3] : 0 };
  // version 13: BRIGHT done. result 0 = set, 1 = the glasses refused, 2 = no display control; before = level found first
  if (d[1] === 0x83 && d.length >= 5) return { type: 'bright', level: d[2], result: d[3], before: d[4] };
  return null;
}

/** Build one ready-to-send frame. */
export function makeFrame({ w, h, pattern, lz4, n, seq, dispW, dispH, picture = 'big' }) {
  const packed = pack4(quantize(renderPattern(pattern, w, h, n), w, h), w, h);
  const payload = lz4 ? lz4Compress(packed) : packed;
  return { message: encodeFrame(seq & 0xffff, w, h, pictureScale(w, h, dispW, dispH, picture), lz4 ? 1 : 0, payload), packedBytes: packed.length };
}

/** Encode already-packed bytes. 'delta' (enc 2) needs the previous packed frame; without it, caller sends a keyframe.
 *  0.8.37 (from Freebuff's MM Video FB 0.9.0): every choice sends the SMALLEST of delta / LZ4 / raw. The owner's phone showed "last send 351 ms,
 *  11838 B, enc 2" for a 200x112 frame on 2026-11-09 while a raw frame there is 11,200 B: the delta was bigger
 *  than the picture it replaced (grain repainted every pixel every frame), so the link carried ~12 KB a frame and
 *  no fps. A delta or an LZ4 block that does not shrink the frame is never sent now, and the enc byte says what
 *  really went out. */
export function encodePacked({ seq, w, h, scale, pack, packed, prev }) {
  const raw = { enc: 0, payload: packed };
  if (pack === 'raw') return { message: encodeFrame(seq & 0xffff, w, h, scale, 0, packed), enc: 0, payloadBytes: packed.length };
  const lz4 = { enc: 1, payload: lz4Compress(packed) };
  let best = lz4.payload.length < raw.payload.length ? lz4 : raw;
  if (pack === 'delta' && prev && prev.length === packed.length) {
    const xor = new Uint8Array(packed.length);
    for (let k = 0; k < packed.length; k += 1) xor[k] = packed[k] ^ prev[k];
    const delta = { enc: 2, payload: lz4Compress(xor) };
    if (delta.payload.length < best.payload.length) best = delta;
  }
  return { message: encodeFrame(seq & 0xffff, w, h, scale, best.enc, best.payload), enc: best.enc, payloadBytes: best.payload.length };
}

// 0.8.37 grain filter (from Freebuff's MM Video FB 0.9.0; owner 2026-11-09: "seems snappier than ours"):
// a pixel that moved by one grey step keeps the level already on the glasses, so sensor grain and the noise the
// Dark scenes lift adds to dim greys stop repainting the picture every frame. A real change (2 steps or more) goes
// straight through. Owner's fix the same day ("the gray frame do stay behind sometimes until it updates"): a held
// pixel is let go after STEADY_HOLD_MS, so a one-step leftover clears in about half a second instead of waiting
// for the next keyframe. `since` (one number per pixel, kept by the caller) remembers when each hold started.
// Pure: returns the levels to send, how many pixels were held and how many were let go.
export const STEADY_STEP = 1;
export const STEADY_HOLD_MS = 200;   // 0.8.38 (owner: "drop even faster"): was 400; ~one glasses picture
export function steadyLevels(prev, next, opts = {}) {
  const o = typeof opts === 'number' ? { dead: opts } : opts;
  const dead = o.dead ?? STEADY_STEP, since = o.since || null, now = o.now ?? 0, maxMs = o.maxMs ?? STEADY_HOLD_MS;
  if (!prev || prev.length !== next.length || dead <= 0) { if (since) since.fill(0); return { levels: next, held: 0, freed: 0 }; }
  const out = new Uint8Array(next.length);
  let held = 0, freed = 0;
  for (let i = 0; i < next.length; i += 1) {
    const d = next[i] - prev[i];
    if (d === 0 || d > dead || d < -dead) { out[i] = next[i]; if (since) since[i] = 0; continue; }
    if (since && since[i] && now + 1 - since[i] >= maxMs) { out[i] = next[i]; since[i] = 0; freed += 1; continue; }
    if (since && !since[i]) since[i] = now + 1;
    out[i] = prev[i]; held += 1;
  }
  return { levels: out, held, freed };
}

// 0.8.41 busy scenes (owner 2026-11-09: "consider busy scenes how to handle them better"). A busy delta (a pan, a crowd,
// a cut that is not a new shot) can be 8-12 KB: one picture then takes 3-4 link messages (~65 ms each) and the fps
// halves just when the picture moves most. budgetLevels keeps the delta under `budget` bytes: 8x8 blocks that barely
// changed keep what the glasses already show, gentlest step first, so the parts that really move still go out
// whole. The held blocks catch up on the next keyframe (BUSY_KEY_EVERY) or as soon as they change more. Measured on
// six 30 s 240x135 clips with the glasses' link and draw times (tools/bench.mjs): busiest clip 4.2 -> 5.4 fps, all
// clips 8.5 -> 9.0 fps and 2681 -> 1882 B a picture, quality 32.3 -> 31.9 dB.
export const BUSY_BUDGET = 4000;
export const BUSY_KEY_EVERY = 30;
export const BUSY_STEPS = [[0.25, 2], [0.5, 3], [1, 4], [2, 6]];   // [mean grey change per pixel, biggest change] a block may have to be held
/** Copy prev's 8x8 blocks into next where the block changed little (mean |d| <= meanMax and no pixel more than peakMax). */
export function blockHold(prev, next, w, h, meanMax, peakMax, B = 8) {
  const out = next.slice();
  let blocks = 0;
  for (let by = 0; by < h; by += B) {
    for (let bx = 0; bx < w; bx += B) {
      const ye = Math.min(h, by + B), xe = Math.min(w, bx + B);
      let s = 0, pk = 0;
      for (let y = by; y < ye; y += 1) for (let x = bx; x < xe; x += 1) { const i = y * w + x, d = Math.abs(next[i] - prev[i]); s += d; if (d > pk) pk = d; }
      if (s > 0 && s / ((ye - by) * (xe - bx)) <= meanMax && pk <= peakMax) {
        blocks += 1;
        for (let y = by; y < ye; y += 1) for (let x = bx; x < xe; x += 1) out[y * w + x] = prev[y * w + x];
      }
    }
  }
  return { levels: out, blocks };
}
// 0.8.42 scene cut (owner 2026-11-09 "Yes" to the bench of ideas 1-3): when more than SCENE_CUT of the pixels show a
// different grey than the last still sent, the shot changed (a cut): a delta would be nearly as big as a whole
// picture and the grain hold would keep old greys on the new shot, so a fresh picture goes instead.
// Bench (5 clips, Busy = Speed): 32.40 -> 32.69 dB at the same 9.1 fps; 35% was worse, so 50%.
export const SCENE_CUT = 0.5;
export function isSceneCut(prev, next, share = SCENE_CUT) {
  if (!prev || !next || prev.length !== next.length || !(share > 0)) return false;
  const limit = share * next.length; let n = 0;
  for (let i = 0; i < next.length; i += 1) if (prev[i] !== next[i] && (n += 1) > limit) return true;
  return false;
}
/** The levels to send so the delta against prev stays under budget bytes (or as close as the gentlest steps allow). */
export function budgetLevels(prev, next, w, h, { budget = BUSY_BUDGET, steps = BUSY_STEPS } = {}) {
  const prevPacked = pack4(prev, w, h);
  const size = (lv) => encodePacked({ seq: 0, w, h, scale: 1, pack: 'delta', packed: pack4(lv, w, h), prev: prevPacked }).payloadBytes;
  let lv = next, blocks = 0, step = 0;
  for (const [m, p] of steps) {
    if (size(lv) <= budget) return { levels: lv, blocks, step };
    const r = blockHold(prev, next, w, h, m, p); lv = r.levels; blocks = r.blocks; step += 1;
  }
  return { levels: lv, blocks, step };
}

// enc 3 = ScouterKit bit planes (phone/skvideo.js). 'sk' = all 16 greys (4 planes, lossless), 'sk2' = 4 greys
// (2 planes, about half the bytes). Each plane is coded against the last picture the glasses got, so a lost or
// refused frame spoils the picture until the next keyframe: a new stream every keyEvery frames, after a send
// error (reset()), and on any size or plane-order change. A frame that would be bigger than raw goes raw instead
// (the glasses then want a keyframe again, and the next SK frame is one).
export const SK_PACKS = Object.freeze({ sk: 4, sk2: 2 });
export class SkSender {
  constructor(planes = 4) { this.planes = planes; this.s = null; this.since = 0; }
  reset() { this.s = null; }
  /** levels: 0..15 per pixel. gray: Gray-code the levels (smooth tones) or plain binary (flat manga greys). */
  frame({ seq, w, h, scale, levels, gray = true, keyEvery = 15 }) {
    const s0 = this.s;
    if (!s0 || s0.w !== w || s0.h !== h || s0.gray !== !!gray || this.since >= keyEvery) {
      this.s = new SkStream(w, h, { planes: this.planes, gray }); this.since = 0;
    }
    const key = this.since === 0;
    const payload = this.s.encode(levels); this.since += 1;
    if (payload.length >= w / 2 * h) {
      this.s = null;
      const cut = this.planes === 4 ? levels : Uint8Array.from(levels, (l) => skLevel(l, this.planes));
      const packed = pack4(cut, w, h);
      return { message: encodeFrame(seq & 0xffff, w, h, scale, 0, packed), enc: 0, payloadBytes: packed.length, key: true };
    }
    return { message: encodeFrame(seq & 0xffff, w, h, scale, 3, payload), enc: 3, payloadBytes: payload.length, key };
  }
}

/**
 * Sends frames back to back for `durationMs` and measures the round trip of each send.
 * link.send(Uint8Array) -> Promise (resolves when delivered). clock() -> ms. onFrame(info) optional, for the preview.
 */
export class Streamer {
  // pause(): lets the page breathe when a send comes back at once (no real link, or a queue that resolves early);
  // without it the loop never gives the page a turn and the Stop button cannot be pressed.
  constructor(link, clock, pause = null) { this.link = link; this.clock = clock; this.pause = pause; this.running = false; this.seq = 0; }
  stop() { this.running = false; }
  // source(n) -> Uint8Array(w*h) brightness, or null when exhausted (a video clip; null = generated pattern).
  async run({ w, h, pattern = 'simple', lz4 = false, pack = null, keyEvery = KEY_EVERY,
    durationMs = 10000, dispW = 600, dispH = 350, source = null, replay = true, onFrame = null, levels = false, picture = 'big' }) {
    if (w > MAX_W || h > MAX_H || w % 2) throw new Error(`size ${w}x${h} not allowed`);
    const mode = pack || (lz4 ? 'lz4' : 'raw'); // 'raw' | 'lz4' | 'delta' | 'sk' | 'sk2'
    const sk = SK_PACKS[mode] ? new SkSender(SK_PACKS[mode]) : null;
    const scale = pictureScale(w, h, dispW, dispH, picture);
    this.running = true;
    const acks = []; let bytes = 0, errors = 0, n = 0, prev = null;
    const t0 = this.clock();
    while (this.running && this.clock() - t0 < durationMs) {
      const lum = source ? source(n) : renderPattern(pattern, w, h, n);
      if (!lum) { if (replay && n > 0) { n = 0; prev = null; continue; } break; } // clip ran out
      // levels=true (a ver-2 .mmv) means lum is already 0..15 dithered on the PC: pack it straight, don't
      // re-dither. Otherwise lum is 0..255 brightness and we Bayer-dither it here like a generated pattern.
      const lv = levels ? lum : quantize(lum, w, h);
      const packed = pack4(lv, w, h);
      const keyframe = mode !== 'delta' || !prev || (n % keyEvery === 0);
      const frame = sk ? sk.frame({ seq: this.seq, w, h, scale, levels: lv, gray: true, keyEvery }) : encodePacked({ seq: this.seq, w, h, scale, pack: keyframe ? (mode === 'raw' ? 'raw' : 'lz4') : 'delta', packed, prev });
      const s = this.clock();
      try {
        await this.link.send(frame.message);
        acks.push(this.clock() - s); bytes += frame.message.length;
      } catch (error) {
        errors += 1; if (sk) sk.reset(); // the glasses may not have it: the next SK frame starts again
        if (errors >= 5 && acks.length === 0) { this.running = false; throw error; }
      }
      prev = packed;
      this.seq = (this.seq + 1) & 0xffff; n += 1;
      if (onFrame) onFrame({ n, w, h, pattern, enc: frame.enc, ack: acks[acks.length - 1], bytes: frame.message.length });
      if (this.pause && this.clock() - s < 4) await this.pause();
    }
    const elapsed = Math.max(1, this.clock() - t0);
    this.running = false;
    return summarize({ w, h, pattern, lz4: mode !== 'raw', pack: mode, acks, bytes, errors, elapsed });
  }
}

export function summarize({ w, h, pattern, lz4, pack, acks, bytes, errors, elapsed: rawElapsed }) {
  const elapsed = Math.max(1, rawElapsed);
  const sorted = [...acks].sort((a, b) => a - b);
  const pick = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
  return {
    size: `${w}x${h}`, pattern, lz4, pack: pack || (lz4 ? 'lz4' : 'raw'), frames: acks.length, errors,
    fps: Math.round(acks.length * 10000 / elapsed) / 10,
    ackAvg: acks.length ? Math.round(acks.reduce((a, b) => a + b, 0) / acks.length) : 0,
    ackMin: Math.round(sorted[0] || 0), ackMed: Math.round(pick(0.5)), ackMax: Math.round(sorted[sorted.length - 1] || 0),
    bytesAvg: acks.length ? Math.round(bytes / acks.length) : 0,
    kbps: Math.round(bytes / elapsed * 10) / 10, // KB/s (bytes per ms = KB per s)
  };
}

/** Every size x {raw, lz4, delta, sk, sk2} for one pattern: the "Run all" plan. */
export function plan(pattern, lz4Available, deltaAvailable = lz4Available, skAvailable = false) {
  const steps = [];
  for (const [w, h] of SIZES) {
    steps.push({ w, h, pattern, pack: 'raw', lz4: false });
    if (lz4Available) steps.push({ w, h, pattern, pack: 'lz4', lz4: true });
    if (deltaAvailable) steps.push({ w, h, pattern, pack: 'delta', lz4: true });
    if (skAvailable) { steps.push({ w, h, pattern, pack: 'sk', lz4: false }); steps.push({ w, h, pattern, pack: 'sk2', lz4: false }); }
  }
  return steps;
}

// .mmv = a clip PRECONVERTED on the PC (tools/clip2frames.py) into the same grey frames the generated
// patterns make, so the phone never decodes video (its WebView can't read video into a canvas, and it has
// no WebCodecs). Header is big-endian: "MMV1" ver:u8 w:u16 h:u16 fps:u8 count:u32, then count*(w*h)
// brightness bytes (0..255), row-major. parseMMV is pure; the page turns it into a Streamer source below.
export const MMV_MAGIC = 'MMV1';
export function parseMMV(buf) {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  if (d.length < 14 || d[0] !== 0x4d || d[1] !== 0x4d || d[2] !== 0x56 || d[3] !== 0x31) throw new Error('not an .mmv file (bad header)');
  const ver = d[4];
  // ver 1 = brightness 0..255 (the phone Bayer-dithers at send time). ver 2 = already dithered on the PC
  // to 0..15 levels (better error-diffusion dither, see tools/clip2frames.py --dither); the phone must send
  // those bytes straight through (clip.levels tells Streamer/preview to SKIP quantize so it isn't re-dithered).
  if (ver !== 1 && ver !== 2) throw new Error(`.mmv version ${ver} not supported`);
  const w = (d[5] << 8) | d[6], h = (d[7] << 8) | d[8], fps = d[9];
  const count = ((d[10] << 24) >>> 0) + (d[11] << 16) + (d[12] << 8) + d[13];
  if (w < 2 || w % 2 || w > MAX_W || h < 1 || h > MAX_H) throw new Error(`.mmv size ${w}x${h} out of range`);
  const need = 14 + count * w * h;
  if (d.length < need) throw new Error(`.mmv truncated: need ${need} bytes, have ${d.length}`);
  const frames = d.subarray(14, need);
  return { w, h, fps, count, levels: ver === 2, frame(i) { return frames.subarray(i * w * h, (i + 1) * w * h); } };
}

// Turn a parsed .mmv into a Streamer source(n): the baked frame at index n, nearest-resampled to the size
// being tested (so the size picker still works on one baked file). null past the last frame -> Streamer
// replays it, so a short clip loops for the whole run.
export function mmvSource(clip, w, h) {
  return (n) => {
    if (!clip || n >= clip.count) return null;
    const src = clip.frame(n);
    if (w === clip.w && h === clip.h) return src;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const sy = Math.min(clip.h - 1, Math.floor(y * clip.h / h));
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(clip.w - 1, Math.floor(x * clip.w / w));
        out[y * w + x] = src[sy * clip.w + sx];
      }
    }
    return out;
  };
}

// gm.files.list() returns the plugin's imported files (fileId, name, importedAt, ...). Pick the newest so
// reopening the plugin can restore the last Clip without the user re-importing. Returns null for an empty list.
export function newestFile(files) {
  if (!Array.isArray(files) || files.length === 0) return null;
  let best = null;
  for (const f of files) {
    if (!f) continue;
    if (!best) { best = f; continue; }
    const a = Date.parse(f.importedAt ?? '') || 0;
    const b = Date.parse(best.importedAt ?? '') || 0;
    if (a >= b) best = f;
  }
  return best;
}
