// MM Eloquentia phone logic, kept pure (no SDK, no DOM, no clock of its own) so every rule has a plain test.
// The heavy work is in Media Link on the phone (0.9.0): Kroko speech to text + the cue model calls.
import { IN, SEP, MAX_ROWS, MAX_SCREEN_BYTES, wrapText, ellipsize } from './mmhud.js';
import { wrapPx, textWidth, glassMatchesTables } from './glyphs.js';
import { PET_SIDE } from './pet_side.js';

export const VERSION = '0.15.5';
export const CHANNEL = 21021;
/** 0.6.1: status prefix for a Media Link mic problem (Android muted the mic, read failed). */
export const MIC_PREFIX = 'Media Link: ';
/**
 * 0.6.1: the status line while listening with the phone mic. Media Link 0.9.7 reports a muted mic in
 * micError (Android 14+ hands a background-started service silence); show it, and clear it once it is gone.
 */
export function micStatus(status, s, micMode) {
  if (!micMode || !s) return status;
  if (s.micError) return MIC_PREFIX + s.micError;
  return String(status || '').startsWith(MIC_PREFIX) ? '' : status;
}
export const STATE_IDLE = 1;
export const STATE_LIVE = 2;
export const BATCH_MS = 200;             // audio goes to Media Link every ~200 ms: speed matters most
export const MAX_FRAMES = 500;           // Media Link limits (EloqCore.parseChunk)
export const MAX_BODY = 64 * 1024;
export const MAX_FRAME = 1275;           // Opus max frame bytes
export const MODES = Object.freeze(['fast', 'careful']);
export const PICKUP_MODES = Object.freeze(['meetingAuto', 'nonWearerFocus', 'frontBalanced', 'frontFocus']);
export const MODE_LABEL = Object.freeze({ fast: 'FAST', careful: 'CAREFUL' });
// 0.6.0: how often cues come (Media Link 0.9.6 rate: calm 20 s, normal 8 s, max 4 s between cues)
export const RATES = Object.freeze(['calm', 'normal', 'max']);
export const cleanRate = (r) => (RATES.includes(String(r || '').toLowerCase()) ? String(r).toLowerCase() : 'normal');
// 0.6.3: cue style (Media Link 0.9.8). Character = a witty friend talking to you (default); Plain = the 0.6.2 cues.
export const STYLES = Object.freeze(['character', 'plain']);
export const cleanStyle = (s) => (String(s || '').trim().toLowerCase() === 'plain' ? 'plain' : 'character');
export const RECENT_CUES = 3;

const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const cleanMode = (m) => (MODES.includes(String(m || '').toLowerCase()) ? String(m).toLowerCase() : 'fast');

/** 32 characters from 64 safe ones (Media Link accepts 16..128 of [A-Za-z0-9-_.]). randomBytes: Uint8Array(32). */
export function makeToken(randomBytes) {
  if (!(randomBytes instanceof Uint8Array) || randomBytes.length < 32) throw new Error('need 32 random bytes');
  let t = '';
  for (let i = 0; i < 32; i++) t += TOKEN_CHARS[randomBytes[i] & 63];
  return t;
}

export const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9._-]{16,128}$/.test(t);

/** Media Link body: [u16 LE count][count x u16 LE length][frames back to back]. frames: Uint8Array[]. */
export function packFrames(frames) {
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_FRAMES) throw new Error('bad frame count');
  let bytes = 0;
  for (const f of frames) {
    if (!(f instanceof Uint8Array) || f.length === 0 || f.length > MAX_FRAME) throw new Error('bad frame');
    bytes += f.length;
  }
  const head = 2 + frames.length * 2;
  if (head + bytes > MAX_BODY) throw new Error('body too big');
  const out = new Uint8Array(head + bytes);
  out[0] = frames.length & 0xff;
  out[1] = frames.length >> 8;
  let at = head;
  frames.forEach((f, i) => {
    out[2 + i * 2] = f.length & 0xff;
    out[3 + i * 2] = f.length >> 8;
    out.set(f, at);
    at += f.length;
  });
  return out;
}

/** Splits one capture chunk ({data, frameLengths}) back into its Opus frames. Bad chunks give []. */
export function splitChunk(chunk) {
  if (!(chunk?.data instanceof Uint8Array) || !Array.isArray(chunk.frameLengths)) return [];
  const frames = [];
  let at = 0;
  for (const len of chunk.frameLengths) {
    const n = Number(len) || 0;
    if (n <= 0 || at + n > chunk.data.length) return [];
    frames.push(chunk.data.subarray(at, at + n));
    at += n;
  }
  return frames;
}

/**
 * Collects capture chunks and hands back ready-to-POST bodies once ~BATCH_MS of audio is in.
 * A batch never breaks the Media Link limits: it is cut early at MAX_FRAMES frames or MAX_BODY bytes.
 * Frames larger than an Opus frame can be are dropped (counted in `skipped`).
 */
export class FrameBatcher {
  constructor(batchMs = BATCH_MS) { this.batchMs = batchMs; this.skipped = 0; this.#clear(); }

  #clear() { this.frames = []; this.bytes = 2; this.ms = 0; }

  /** Returns an array of bodies (often empty). */
  push(chunk) {
    const frames = splitChunk(chunk);
    if (frames.length === 0) return [];
    const perFrameMs = (Number(chunk.durationMs) || frames.length * 20) / frames.length;
    const out = [];
    for (const f of frames) {
      if (f.length > MAX_FRAME) { this.skipped += 1; continue; }
      if (this.frames.length >= MAX_FRAMES || this.bytes + 2 + f.length > MAX_BODY) out.push(this.#take());
      this.frames.push(f);
      this.bytes += 2 + f.length;
      this.ms += perFrameMs;
    }
    if (this.ms >= this.batchMs && this.frames.length) out.push(this.#take());
    return out;
  }

  flush() { return this.frames.length ? this.#take() : null; }

  #take() {
    const body = packFrames(this.frames);
    this.#clear();
    return body;
  }
}

/**
 * The page's copy of the Media Link session: transcript lines and cues share one sequence counter.
 * merge() takes a /eloq/state reply; reset() runs on Start. A seq that goes backwards means Media Link
 * restarted, so the old copy is dropped.
 */
export class SessionView {
  constructor(keep = 60) { this.keep = keep; this.reset(); }

  reset() { this.lines = []; this.cues = []; this.since = 0; this.partial = ''; this.hiddenCueSeq = 0; this.restarted = false; }

  merge(state) {
    if (!state || typeof state !== 'object') return { lines: 0, cues: 0 };
    const seq = Number(state.seq) || 0;
    this.restarted = false;
    if (seq < this.since) { this.reset(); this.restarted = true; }
    this.partial = String(state.partial || '');
    let lines = 0; let cues = 0;
    for (const l of Array.isArray(state.lines) ? state.lines : []) {
      const s = Number(l?.seq) || 0;
      if (s <= this.since || this.lines.some((x) => x.seq === s)) continue;
      this.lines.push({ seq: s, text: String(l.text || '') });
      lines += 1;
    }
    for (const c of Array.isArray(state.cues) ? state.cues : []) {
      const s = Number(c?.seq) || 0;
      if (s <= this.since || this.cues.some((x) => x.seq === s)) continue;
      this.cues.push({ seq: s, text: cueText(c.text, c.kind), via: String(c.via || ''), ms: Number(c.ms) || 0, kind: cueKind(c.kind), src: cueSrc(c.src) });
      cues += 1;
    }
    this.lines.sort((a, b) => a.seq - b.seq);
    this.cues.sort((a, b) => a.seq - b.seq);
    if (this.lines.length > this.keep) this.lines = this.lines.slice(-this.keep);
    if (this.cues.length > this.keep) this.cues = this.cues.slice(-this.keep);
    this.since = Math.max(this.since, seq);
    return { lines, cues };
  }

  /** The newest cue still on show (TAP hides it until a newer one comes). */
  get cue() {
    const c = this.cues[this.cues.length - 1];
    return c && c.seq > this.hiddenCueSeq ? c : null;
  }

  hideCue() { const c = this.cue; if (c) this.hiddenCueSeq = c.seq; return c; }

  /** 0.6.0: the last n cues still on show, newest last (TAP CLEAR hides them all until a newer one comes). */
  recent(n = RECENT_CUES) {
    const shown = this.cues.filter((c) => c.seq > this.hiddenCueSeq);
    return n > 0 ? shown.slice(-n) : [];
  }

  /** Last words heard, newest last, the partial (still being spoken) at the end. */
  transcript(maxChars = 400) {
    const text = [...this.lines.map((l) => l.text), this.partial].filter(Boolean).join(' ');
    return text.length > maxChars ? text.slice(-maxChars).replace(/^\S*\s/, '') : text;
  }
}

/** Look C (0.2.0): the cue alone, centred at the top; status on the bottom line; middle left clear. */
export const FLAG_ROWS_CENTER = 0x02;
export const CUE_LINES = 4;             // 0.6.0 cap, unused since 0.6.2 (the newest cue uses every free row, then pages)

/** First candidate that fits the columns, else the last one cut to fit. */
export function fitLine(candidates, cols) {
  for (const c of candidates) if (c.length <= cols) return c;
  return ellipsize(candidates[candidates.length - 1], cols);
}

/** 0.6.2: usable row width in px on the 600 px lens (600 - 2 x 12 margin - 2), as in Chatty's hudtext.js. */
export const ROW_PX = 574;
/** 0.6.2: marks a row with more of the cue on the next page. An arrow the glasses font has (U+2193). */
export const MORE = ' \u2193';

function cueLine(c) { return `${GLASS_PREFIX[cueKind(c.kind)]}${c.text}`.replace(/\s+/g, ' ').trim(); }

/**
 * 0.6.2: line breaks. With a glass object whose HELLO matches the measured lens (or no HELLO at all), break by
 * real pixel width (glyphs.js, proven on his glasses by Text Probe 2026-11-07); otherwise by the column estimate.
 * narrow = leave room for the MORE arrow at the end of the line.
 */
export function wrapCue(text, cols, glass = null, narrow = false, indent = 0) {
  if (glass && glassMatchesTables(glass)) return wrapPx(text, ROW_PX - cleanIndent(indent) - (narrow ? textWidth(MORE) : 0));
  return wrapText(text, Math.max(1, rowCols(cols, indent) - (narrow ? MORE.length : 0)));
}

/** 0.8.0: the rows never get narrower than this beside her (the glasses plugin has the same number). */
export const MIN_ROW_PX = 240;
/** 0.8.0: px the rows lose while her portrait is shown left of them: a whole number, 0..(ROW_PX - MIN_ROW_PX). */
export function cleanIndent(indent) {
  const n = Math.floor(Number(indent) || 0);
  return Math.min(Math.max(0, n), ROW_PX - MIN_ROW_PX);
}
/** 0.8.0: the column estimate for a row that is `indent` px narrower. */
export function rowCols(cols, indent = 0) {
  const i = cleanIndent(indent);
  return i ? Math.max(8, Math.floor(cols * (ROW_PX - i) / ROW_PX)) : cols;
}

/** 0.6.2: split one cue into pages of `per` rows; every page but the last ends its last row with MORE. */
export function cuePages(text, per, cols, glass = null, indent = 0) {
  per = Math.max(1, per);
  const pages = [];
  let rest = String(text || '').trim();
  while (rest) {
    const lines = wrapCue(rest, cols, glass, false, indent);
    if (lines.length <= per) { pages.push(lines); break; }
    const head = lines.slice(0, per - 1);
    const narrow = wrapCue(lines.slice(per - 1).join(' '), cols, glass, true, indent);
    head.push(narrow[0] + MORE);
    pages.push(head);
    rest = narrow.slice(1).join(' ');
  }
  return pages.length ? pages : [[]];
}

function screenBytes(rows, footer) {
  return 8 + 1 + rows.reduce((n, r) => n + utf8.encode(r).length + 1, 0) + utf8.encode(footer).length + 1;
}
const utf8 = new TextEncoder();

/**
 * What the glasses show. rows/cols come from the glasses HELLO (defaults fit the G1 HUD).
 * 0.6.2: the newest cue uses every free row; if it is still longer, it is split into pages (MORE arrow on the
 * last row, footer "n/m TAP MORE", tap = next page, tap on the last page = clear). Older cues are shown whole
 * or not at all, above the newest. The heard line sits right under the cues. glass = the HELLO (width,
 * lineHeight) switches on exact pixel line breaks; page = which page of the newest cue.
 * 0.9.0: indent = px the rows lose inside her speech bubble (she stands under it): lines break narrower and start
 * at the left (not centred), so the cue reads as her line. The footer is only the tap hints now: no mode word and
 * no running clock (owner's call).
 * 0.13.0: no footer at all while listening: only her words in the bubble (the idle screen keeps DOUBLE START).
 */
// ---------- 0.14.0: newest reply bright, older ones fade (glasses v8; old glasses ignore the message) ----------
export const SHADES_MSG = 0x07;
export const SHADE_ROW = 0xE0;         // the plain row shade (what every row had before)
export const SHADE_NEW = 0xFF;         // the newest reply
export const SHADE_OLD = 0xA0;         // the reply before it
export const SHADE_OLDER = 0x70;       // anything older

/** [version, 0x07, seq, n, shade x n]: the shade of each row of the screen with that seq. */
export function encodeShades(seq, shades) {
  const list = (Array.isArray(shades) ? shades : []).slice(0, MAX_ROWS);
  return Uint8Array.from([1, SHADES_MSG, seq & 0xff, list.length, ...list.map((v) => Math.max(0, Math.min(255, Math.floor(Number(v) || 0))))]);
}

export function buildScreen({ running, mode = 'fast', cue = null, cues = null, transcript = '', showTranscript = false, status = '', wallMs = 0, rows = 6, cols = 30, glass = null, page = 0, indent = 0 }) {
  // 0.6.0: cues = the last few on show, newest last
  const list = Array.isArray(cues) ? cues.filter(Boolean).slice(-RECENT_CUES) : (cue ? [cue] : []);
  cue = list.length ? list[list.length - 1] : null;
  indent = cleanIndent(indent);
  const rc = rowCols(cols, indent);
  const flags = indent ? 0 : FLAG_ROWS_CENTER;
  if (!running) {
    return {
      state: STATE_IDLE, mask: IN.TAP_DOUBLE, flags, header: '',
      rows: ['Not listening', ellipsize(status || 'Double-tap to start', rc)],
      footer: 'DOUBLE START', shades: [SHADE_ROW, SHADE_ROW],
      pages: 1, page: 0,
    };
  }
  const room = Math.max(1, Math.min(MAX_ROWS, rows));
  const heard = () => {
    const tail = wrapCue(transcript || '...', cols, glass, false, indent);
    return tail[tail.length - 1] || '...';
  };
  if (!cue) {
    const body = status ? [ellipsize(status, rc)] : [];
    if (showTranscript && body.length < room) body.push(heard());
    return {
      state: STATE_LIVE, mask: IN.TAP_DOUBLE, flags, header: '', rows: body,
      footer: '', shades: body.map(() => SHADE_ROW),
      pages: 1, page: 0,
    };
  }
  const tx = showTranscript && room > 1 ? 1 : 0;
  let per = room - tx;
  let older = true;
  for (;;) {
    const pages = cuePages(cueLine(cue), per, cols, glass, indent);
    const n = pages.length;
    const at = Math.min(Math.max(0, Math.floor(Number(page) || 0)), n - 1);
    const body = [...pages[at]];
    const shades = body.map(() => SHADE_NEW);
    if (n === 1 && older) {
      // whole older cues only, newest of them first, while they fit in the spare rows
      let spare = per - body.length;
      for (let i = list.length - 2; i >= 0 && spare > 0; i--) {
        const lines = wrapCue(cueLine(list[i]), cols, glass, false, indent);
        if (lines.length > spare) break;
        body.unshift(...lines);
        shades.unshift(...lines.map(() => (i === list.length - 2 ? SHADE_OLD : SHADE_OLDER)));
        spare -= lines.length;
      }
    }
    if (tx) { body.push(heard()); shades.push(SHADE_ROW); }
    // 0.13.0: no tap hints while she talks (owner: "just my girl speaking her mind"); taps still work the same
    const footer = '';
    // a screen must fit one MMHUD message: drop the older cues first, then use fewer rows per page
    if (screenBytes(body, footer) > MAX_SCREEN_BYTES && (older || per > 1)) {
      if (older) older = false; else per -= 1;
      continue;
    }
    return { state: STATE_LIVE, mask: IN.TAP_SINGLE | IN.TAP_DOUBLE, flags, header: '', rows: body, footer, shades, pages: n, page: at };
  }
}

// ---------- 0.3.0: prep notes + end summary (Media Link 0.9.2) ----------
export const MAX_NOTES = 2000;           // Media Link EloqCore.MAX_NOTES

/** Same rule as Media Link's cleanNotes: tidy each line, drop blank lines, cap the length. */
export function cleanNotes(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  return lines.join('\n').slice(0, MAX_NOTES);
}

// 0.6.3: About me, a few lines about the wearer sent with every cue request (Media Link EloqCore.MAX_ABOUT)
export const MAX_ABOUT = 600;
/** Same rule as Media Link's cleanAbout: cleanNotes, then cut to 600 characters. */
export const cleanAbout = (text) => cleanNotes(text).slice(0, MAX_ABOUT);

/** The text shown under the summary: "Claude Haiku · 2.1 s" or "Cerebras Qwen · 900 ms". */
export function summaryVia(r) {
  if (!r || !r.ok) return '';
  const who = r.via === 'haiku' ? 'Claude Haiku' : r.via === 'qwen' ? 'Cerebras Qwen' : String(r.via || '?');
  const ms = Number(r.ms) || 0;
  return `${who} · ${ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`}`;
}

/** What is kept on the phone when "Keep summary" is on: the last few, newest first. */
export const MAX_KEPT = 10;
export function keepSummary(list, summary, at) {
  const kept = Array.isArray(list) ? list.filter((x) => x && typeof x.text === 'string') : [];
  if (!summary) return kept.slice(0, MAX_KEPT);
  return [{ at, text: String(summary) }, ...kept].slice(0, MAX_KEPT);
}

// ---------- 0.4.0: cue kinds, fact check, word finder, OpenClaw memory (Media Link 0.9.3) ----------
export const KINDS = Object.freeze(['say', 'ask', 'fix', 'word', 'check', 'note', 'tip', 'unsure']);   // 0.5.0: note + tip (Media Link 0.9.5); 0.15.0: unsure (Media Link 0.11.0)
/** Unknown or missing kind = say (Media Link 0.9.2 sends no kind). */
export const cueKind = (k) => (KINDS.includes(String(k || '').toLowerCase()) ? String(k).toLowerCase() : 'say');
export const cueSrc = (s) => (s === 'memory' || s === 'web' ? s : '');

/** On the glasses only a fact fix and a word get a short tag: Say/Ask cues read as they are. */
export const GLASS_PREFIX = Object.freeze({ say: '', ask: '', fix: 'FIX: ', word: 'WORD: ', check: 'CHECK: ', note: 'NOTE: ', tip: 'TIP: ', unsure: '' });

/** 0.12.0: an Ask cue is a question, so it ends with "?" on the phone and on the glasses (his wish). A trailing
 * ".", "..." or "!" becomes "?"; one that already ends with "?" (even before a closing quote) is left alone.
 * Other kinds keep their text as it came. */
export function cueText(text, kind) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (cueKind(kind) !== 'ask' || !t || /\?["'”’)]*$/.test(t)) return t;
  const bare = t.replace(/[\s.…!,;:]+$/, '');
  return bare ? `${bare}?` : t;
}

/** Label on the phone: "Say", "Ask", "Fix · memory", "Fix · web", "Word". */
export function cueLabel(c) {
  const k = cueKind(c?.kind);
  const name = { say: 'Say', ask: 'Ask', fix: 'Fix', word: 'Word', check: 'Check', note: 'Note', tip: 'Tip', unsure: 'Nothing solid' }[k];
  const src = cueSrc(c?.src);
  return k === 'fix' && src ? `${name} · ${src}` : name;
}

/** The "From memory" line for state.recall. */
export function recallText(r) {
  const v = String(r ?? '');
  if (v === '' || v === 'off') return 'Memory recall is off';
  if (v === 'no-token') return 'No OpenClaw token in Media Link yet';
  if (v === 'busy') return 'Asking OpenClaw…';
  if (v === 'ok') return 'From OpenClaw memory';
  if (v === 'none') return 'OpenClaw had nothing on this';
  if (v.startsWith('error')) return `OpenClaw did not answer (${v.replace(/^error:?\s*/, '') || 'error'})`;
  return v;
}

/** The line under the summary for the save status (r.saved, later state.save). */
export function saveText(v) {
  const s = String(v ?? '');
  if (s === '' || s === 'off' || s === 'idle') return '';
  if (s === 'no-token') return 'Not saved: no OpenClaw token in Media Link';
  if (s === 'busy') return 'Not saved: OpenClaw was busy';
  if (s === 'pending') return 'Saving to OpenClaw memory…';
  if (s === 'saved') return 'Saved to OpenClaw memory';
  if (s.startsWith('error')) return `Not saved: ${s.replace(/^error:?\s*/, '') || 'error'}`;
  return s;
}

// ---------- 0.7.0: speed + relevance switches (Media Link 0.10.0) and the pet ----------
/** The 0.10.0 switches, all on by default. An older Media Link ignores them. */
export const FAST_SWITCHES = Object.freeze(['stream', 'race', 'spec', 'speak', 'factcheck', 'verify', 'runsum', 'turn']);
export const PET_STATES = Object.freeze(['idle', 'listening', 'thinking', 'cue', 'none']);
export const PET_CUE_MS = 4000;     // the pet shows a new cue this long
export const PET_NONE_MS = 2500;    // and a "nothing to say" this long
export const PET_THINK_MS = 4000;   // after a new sentence, until a cue or a NONE comes (or this runs out)

/**
 * The pet's state from what the page knows. Times are Date.now() values, 0 = never.
 * lineAt: a new finished sentence came in (Media Link then asks the model); cueAt: a new cue; noneAt: the model said NONE.
 */
export function petState({ running = false, busy = false, now = 0, lineAt = 0, cueAt = 0, noneAt = 0 } = {}) {
  if (busy) return 'thinking';
  if (!running) return 'idle';
  if (cueAt && now - cueAt < PET_CUE_MS && cueAt >= noneAt) return 'cue';
  if (noneAt && now - noneAt < PET_NONE_MS && noneAt > cueAt) return 'none';
  if (lineAt && now - lineAt < PET_THINK_MS && lineAt > Math.max(cueAt, noneAt)) return 'thinking';
  return 'listening';
}

/** 0.8.0: what her speech bubble holds: the cue on show (she says it), else what she is doing. */
export function petSay(state, cue = null) {
  const text = cue && cue.text ? String(cue.text).replace(/\s+/g, ' ').trim() : '';
  return text || PET_LABEL[state] || PET_LABEL.idle;
}

/** What she is doing, for screen readers and the bubble when there is no cue. */
/** 0.10.0: the side she stands on in the phone's copy of the glasses, like the glasses: her lean decides
 * (pet_side.js, made from the art); an upright mood ('keep') or an unknown one keeps the last side. The
 * glasses start on the left, so the copy does too. */
export function petSide(state, last = 'left') {
  const side = PET_SIDE[state];
  return side === 'left' || side === 'right' ? side : last === 'right' ? 'right' : 'left';
}

export const PET_LABEL = Object.freeze({ idle: 'Resting', listening: 'Listening', thinking: 'Thinking', cue: 'New cue', none: 'Nothing to add' });

/** The Media Link line for the 0.10.0 fields: Groq key + who won the race. Empty for an older Media Link. */
export function fastText(h) {
  if (!h || typeof h.hasGroqKey !== 'boolean') return '';
  const g = Number(h.groqWins) || 0, q = Number(h.qwenWins) || 0, s = Number(h.specHits) || 0, v = Number(h.verifyDrops) || 0;
  return `Groq key ${h.hasGroqKey ? 'saved' : 'NOT SET'} · race Groq ${g} / Cerebras ${q} · early cues ${s} · wrong fixes held back ${v}`;
}

// ---------- 0.8.0: the pet on the glasses (glasses plugin 2) ----------
// The frames live in the glasses plugin, which animates them on its own clock. The phone sends only the mood.
export const PET_MSG = 0x04;    // phone -> glasses: [1, 0x04, mood]; mood = index in PET_STATES, 0xFF = hide
export const CAPS_MSG = 0x83;   // glasses -> phone: [1, 0x83, width, height, moods, indent, rows]; only a plugin with the pet sends it
export const PET_HIDE = 0xff;

/** The 3-byte mood message. show false, or a state the page does not know, hides the pet. */
export function encodePet(state, show = true) {
  const i = PET_STATES.indexOf(state);
  return new Uint8Array([1, PET_MSG, show && i >= 0 ? i : PET_HIDE]);
}

/**
 * { width, height, moods, indent, rows } from a CAPS message, or null for anything else (a HELLO, an input, junk).
 * indent = px the cue rows lose while she is shown (inside her bubble); rows = how many rows her bubble holds.
 * Both are 0 when a shorter form leaves them out (0 rows = no limit).
 */
export function decodeCaps(bytes) {
  if (!(bytes instanceof Uint8Array) || (bytes.length < 5 || bytes.length > 7) || bytes[0] !== 1 || bytes[1] !== CAPS_MSG) return null;
  if (!bytes[2] || !bytes[3] || !bytes[4]) return null;
  return { width: bytes[2], height: bytes[3], moods: bytes[4], indent: bytes.length >= 6 ? bytes[5] : 0, rows: bytes.length >= 7 ? bytes[6] : 0 };
}

/** What to send for the pet now, or null when nothing should go (old glasses plugin, or nothing changed). */
export function petSend({ caps = null, show = true, state = 'idle', last = -1 } = {}) {
  if (!caps) return null;
  const bytes = encodePet(state, show && PET_STATES.indexOf(state) < caps.moods);
  return bytes[2] === last ? null : bytes;
}

// ---------- 0.13.0: make sure the pet shows (glasses plugin 6) ----------
// A HELLO or CAPS can be lost at start (the app drops early messages). The page now asks again with ASK until
// the glasses answer with CAPS, or with a "no pet" CAPS that says why she cannot be drawn.
export const ASK_MSG = 0x05;        // phone -> glasses: [1, 0x05] = "say HELLO and CAPS again"; an old plugin ignores it
export const ASK_EVERY_MS = 5000;
export const ASK_TRIES = 6;
export const PET_NO_REASON = Object.freeze({
  1: 'the glasses have no picture support', 2: 'not enough room on the glasses', 3: 'the screen is too narrow',
  4: 'her pictures are missing', 5: 'her bubble could not be made', 6: 'her picture could not be made',
});

export const encodeAsk = () => new Uint8Array([1, ASK_MSG]);

/** The reason number of a "no pet" CAPS [1, 0x83, 0, reason, 0, 0, 0], or null for anything else. */
export function decodeCapsNo(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 7 || bytes[0] !== 1 || bytes[1] !== CAPS_MSG) return null;
  if (bytes[2] !== 0 || !bytes[3]) return null;
  return bytes[3];
}

/** Text for a no-pet reason, for the phone log. */
export const petNoText = (r) => PET_NO_REASON[r] || `reason ${r}`;

/** Should the page send an ASK now? Not once CAPS (or a no-pet answer) came, nor after ASK_TRIES, nor too soon. */
export function shouldAsk({ caps = null, no = null, tries = 0, lastAt = -Infinity, now = 0 } = {}) {
  if (caps || no) return false;
  if (tries >= ASK_TRIES) return false;
  return now - lastAt >= ASK_EVERY_MS;
}

// 0.13.0: while she listens the phone says "still here" every 5 s. Glasses plugin 7 shows PHONE PAUSED when these
// stop for 20 s on a live screen (the phone app paused the page); an older plugin ignores the message.
export const BEAT_MSG = 0x06;
export const BEAT_EVERY_MS = 5000;
export const encodeBeat = () => new Uint8Array([1, BEAT_MSG]);

/** Should the page send a heartbeat now? Only while listening, at most every BEAT_EVERY_MS. */
export function shouldBeat({ running = false, lastAt = -Infinity, now = 0 } = {}) {
  return Boolean(running) && now - lastAt >= BEAT_EVERY_MS;
}

/** 0.13.0: a 1 s silent WAV (8 kHz, 8-bit mono, every sample at the 128 midpoint) for the keep-awake loop. */
export function silentWav(rate = 8000) {
  const n = rate, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return b;
}

// ---------- 0.15.0: spoken "stop listening" and call mode (owner "Do 1 2 3 4", 2026-11-13) ----------
const STOP_WORDS = /\b(stop|pause) listening\b/i;
/** True when one of these heard lines says "stop listening" or "pause listening". */
export function heardStop(lines) {
  return (Array.isArray(lines) ? lines : []).some((l) => STOP_WORDS.test(String(l?.text ?? l ?? '')));
}
/** True only on the edge: the last state was not in a call and this one is (Media Link 0.11.0 sends inCall). */
export function callStarted(prevInCall, s) {
  return !prevInCall && s?.inCall === true;
}

