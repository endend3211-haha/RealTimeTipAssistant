// Captions on the glasses: the PC gives cues [[start, end, text]] (YouTube transcript or a movie's subtitle
// track); this module turns them into pages of at most 2 lines x 50 letters in the glasses font, and into the
// CAPTION message (56 04 + ASCII, lines split by a line feed, empty = off). Pure: tested in node.
export const CAP_COLS = 50;
export const CAP_LINES = 2;
export const CAP_MIN_S = 1.2;   // a page of a split cue stays at least this long when the cue allows it
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.-:#!?',()&\"%+ ";
const SMALL = 'abcdefghijklmnopqrstuvwxyz';   // 0.8.22: glasses v14 also draw lower case (owner: "the glasses do display lower cases")
const SWAP = { '‘': "'", '’': "'", '‚': "'", '′': "'", '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '−': '-', '…': '...', 'ß': 'SS', 'Æ': 'AE', 'æ': 'AE', 'Ø': 'O', 'ø': 'O',
  'Œ': 'OE', 'œ': 'OE', ';': ',', '[': '(', ']': ')', '{': '(', '}': ')', '*': ' ', '_': ' ', '♪': '#', '♫': '#', '=': '-' };

/** Any text -> one line of letters the glasses font has (accents dropped, tags removed). lower = keep lower case
 * (glasses v14); otherwise all capitals, the only letters older glasses have. */
export function fold(text, lower = false) {
  let s = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ');
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const ch of s) {
    const c = lower ? (SWAP[ch] ?? ch) : (SWAP[ch] ?? ch).toUpperCase();
    for (const one of c) out += GLYPHS.includes(one) || (lower && SMALL.includes(one)) ? one : ' ';
  }
  return out.replace(/ +/g, ' ').trim();
}

/** Word wrap to `cols` letters a line; a word longer than a line is cut. */
export function wrap(text, cols = CAP_COLS) {
  const lines = []; let line = '';
  for (let word of text.split(' ').filter(Boolean)) {
    while (word.length > cols) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, cols)); word = word.slice(cols);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Cues -> pages {start, end, text}, sorted; a cue that needs more than 2 lines is split over its own time. */
export function pagesFor(cues, cols = CAP_COLS, rows = CAP_LINES, lower = false) {
  const pages = [];
  for (const cue of Array.isArray(cues) ? cues : []) {
    const start = Number(cue?.[0]), end = Number(cue?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const lines = wrap(fold(cue[2], lower), cols);
    if (!lines.length) continue;
    const n = Math.ceil(lines.length / rows);
    const each = (end - start) / n;
    for (let i = 0; i < n; i += 1) {
      pages.push({ start: start + i * each, end: start + (i + 1) * each, text: lines.slice(i * rows, (i + 1) * rows).join('\n') });
    }
  }
  pages.sort((a, b) => a.start - b.start);
  // YouTube's automatic transcript overlaps cues: a page ends where the next one starts.
  for (let i = 0; i + 1 < pages.length; i += 1) if (pages[i].end > pages[i + 1].start) pages[i].end = pages[i + 1].start;
  return pages.filter((p) => p.end > p.start);
}

/** The text on show at `pos` seconds ('' = none). Binary search: a film has thousands of pages. */
export function cueAt(pages, pos) {
  let lo = 0, hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1; const p = pages[mid];
    if (pos < p.start) hi = mid - 1; else if (pos >= p.end) lo = mid + 1; else return p.text;
  }
  return '';
}

/** CAPTION message for the glasses (version 5 and up; older glasses ignore it). */
export function captionMessage(text) {
  const t = String(text || '');
  const out = new Uint8Array(2 + t.length);
  out[0] = 0x56; out[1] = 0x04;
  for (let i = 0; i < t.length; i += 1) { const c = t.charCodeAt(i); out[2 + i] = c === 10 || (c >= 32 && c < 127) ? c : 32; }
  return out;
}

/** 0.8.43 (owner 2026-11-10: "the phone would get the video and the PC would handle the subtitle track"): the PC
 * makes the captions while the phone engine plays the video. Not for IPTV (xc:/xcm:/xce:/xcs: and IPTV films):
 * the IPTV plan allows ONE stream at a time, so a second one on the PC would cut the phone off. Not for NAS films
 * (they already play on the PC). Pure. */
export function pcCaptions(on, base, phoneBase, src) {
  if (!on || !src || !base || base !== phoneBase) return false;
  if (src.kind !== 'youtube' && src.kind !== 'live') return false;
  const url = String(src.url || '').trim();
  return !!url && !/^xc[a-z]*:/i.test(url);
}
export const LIVE_LAG_MAX = 30;
/** 0.8.30 (owner: "Captions are being fetched but not displayed on the glasses"): on live TV a line is written a
 * few seconds after its sound played, so it reaches the page with its time already past and cueAt() never shows
 * it. When new cues arrive at sound position `pos`, the lag is how late the first new one is (+0.5 s). It rises at
 * once (no line lost) and falls back half-way per batch (0.8.35, was 20 %). Pure. */
export function liveLag(prev, pos, oldCues, cues) {
  prev = Number.isFinite(prev) ? prev : 0;
  let seen = -Infinity;
  for (const c of Array.isArray(oldCues) ? oldCues : []) { const s = Number(c?.[0]); if (s > seen) seen = s; }
  let first = Infinity;
  for (const c of Array.isArray(cues) ? cues : []) { const s = Number(c?.[0]); if (s > seen && s < first) first = s; }
  if (!Number.isFinite(first) || !Number.isFinite(pos)) return prev;
  const want = Math.min(LIVE_LAG_MAX, Math.max(0, pos - first + 0.5));
  return want >= prev ? want : prev * 0.5 + want * 0.5;   // 0.8.35: falls twice as fast (owner: subtitles falling behind)
}

/** Keeps what the glasses show: at(pos) gives a message only when the caption must change. */
export class CaptionTrack {
  constructor(cues = []) { this.enabled = true; this.shown = ''; this.lower = false; this.cols = CAP_COLS; this.lag = 0; this.setCues(cues); }
  setCues(cues) { this.cues = cues; this.pages = pagesFor(cues, this.cols, CAP_LINES, this.lower); }
  /** Glasses v14 said HELLO: keep lower case (the next at() sends the new page because its text differs). */
  setLower(on) { on = !!on; if (on === this.lower) return; this.lower = on; this.setCues(this.cues); }
  // 0.8.23: letters per line for the caption font on the glasses (Classic 50, Clean 72, Large 50; v15 glasses)
  setCols(n) { n = Math.trunc(Number(n)); if (!(n >= 10 && n <= 75) || n === this.cols) return; this.cols = n; this.setCues(this.cues); }
  get size() { return this.pages.length; }
  /** lag: live only, seconds the captions are shown after their sound (0 for videos). */
  textAt(pos) { return this.enabled ? cueAt(this.pages, pos - (this.lag || 0)) : ''; }
  at(pos) {
    const text = this.textAt(pos);
    if (text === this.shown) return null;
    this.shown = text;
    return captionMessage(text);
  }
  /** The send failed or the glasses were cleared: nothing is on show any more. */
  reset() { this.shown = ''; }
  off() { if (!this.shown) return null; this.shown = ''; return captionMessage(''); }
}
