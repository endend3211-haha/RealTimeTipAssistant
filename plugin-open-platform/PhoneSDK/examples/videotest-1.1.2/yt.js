// YouTube on the glasses. The PC service (pc/ytcast_pc.py, Tailscale /yt) runs yt-dlp + FFmpeg and keeps
// small grey stills of the video; this module asks for "the still at the current sound position" and sends it
// to the glasses as fast as the link allows. Pure: link, fetchFn, clock, pause are passed in (tested in node).
import { STRONG, flashCap } from './brightfix.js';   // 0.9.8 Bright scenes: Strong
import { MAX_W, MAX_H, KEY_EVERY, pictureScale, quantize, pack4, encodePacked, summarize, SkSender, SK_PACKS, steadyLevels, budgetLevels, isSceneCut } from './core.js';

export const DEFAULT_PC = 'http://127.0.0.1:11500';   // share copy: the engine on this phone
export const YT_FPS = 15;      // stills per second of video the PC makes
export const LEAD_S = 0.07;    // a still reaches the glasses ~one send later, so aim slightly ahead
export const LOOKS = ['normal', 'dither', 'manga', 'auto'];
// Desk's picture tone (memomind-desk phone/media.js PICTURE_TONE: contrast, shadows, highlight cut, sharpen; not
// its frame) plus darken: the whole picture x0.7 (about 30% darker), so fewer pixels are lit and less is drawn.
export const TONE = { contrast: 1.35, brightness: -20, highCut: 0.15, sharpen: 1, darken: 0.7, darkLift: 0.07, darkFull: 48, darkNone: 96, brightPull: 0.12, brightFrom: 150, brightFull: 210, knee: 200 }; // highCut 0.1 -> 0.15 on 2026-11-06 (owner: highlights 5% lower)
// 0.8.8 (owner 2026-11-06: "highlight brightness still look washed out on super bright images"): two things, both
// off when 0 (then the math is exactly 0.8.7's). brightPull: a still whose average grey is brightFrom or more is
// pulled down before the contrast, up to 12% of full at brightFull, so a very bright scene lands where the curve
// still has slope instead of piling up on the top greys (the mirror of darkLift). knee: above this value the
// contrast overshoot is folded back softly toward 255 instead of being chopped flat, so the brightest parts keep
// their differences. Settings > Bright scenes: Tame (both on) / Plain (both off) = tameBright().
const TAME = { brightPull: 0.12, knee: 200 };
// 0.9.8: tameBright('strong') = harder pull + lower knee + the flash limit (brightfix.js); true = Tame (0.9.7), false = Plain.
const PULL_RANGE = { brightFrom: 150, brightFull: 210 };
export function tameBright(on) {
  const s = on === 'strong';
  TONE.brightPull = s ? STRONG.brightPull : on ? TAME.brightPull : 0;
  TONE.knee = s ? STRONG.knee : on ? TAME.knee : 0;
  TONE.brightFrom = s ? STRONG.brightFrom : PULL_RANGE.brightFrom;
  TONE.brightFull = s ? STRONG.brightFull : PULL_RANGE.brightFull;
  TONE.flash = s;
  if (!s) resetFlash();
  return on;
}
const FLASH_STATE = {};
export function resetFlash() { FLASH_STATE.m = null; FLASH_STATE.at = null; }
// 0.8.11 "Softer whites" (owner 2026-11-06: "would the crt help with the whites looking so washed out?" — the CRT
// lines on the glasses dim only every scale-th row; the real fix is here). Measured on the tone chain as it stands
// (contrast, knee 200, highCut, darken 0.7): pure white already comes out at 141 = step 8 of 15, and input 190..255 is
// squeezed into steps 7-8 — a sky, a white wall or a lit face is one flat glowing slab. Softer whites adds a shoulder:
// above whiteKnee every grey is pulled toward it by whiteSlope, so white lands at 118 = step 7 (about 16% less light),
// 121 -> 109, 108 -> 104; the order of the greys is kept (no clipping), everything under the knee is untouched.
// It adds no detail: it only takes the glare off. Settings > Softer whites (default On; Off = 0.8.10 exactly).
export const SOFT_WHITES = { whiteKnee: 100, whiteSlope: 0.45 };
export function softWhites(on) { TONE.whiteKnee = on ? SOFT_WHITES.whiteKnee : 0; TONE.whiteSlope = SOFT_WHITES.whiteSlope; return on; }
// darkLift (owner 2026-11-06: "on dark scenes can the brightness be raised a bit like 7%", bright scenes stay at the
// 15% cut): a still whose average grey is darkFull or less gets +7% of full brightness; the lift fades to nothing
// at darkNone, so bright scenes are untouched. True black (bars, raw 16 or less) stays black and is not counted.
// 0.8.36 "Dark scenes" (owner 2026-11-09, his go): the contrast curve crushes dim greys (raw 50 came out black), so a
// dark scene was a few lit specks. SHADOW lifts the dim greys BEFORE the contrast, shaped: nothing at true black (raw
// 16 or less stays black), full lift from raw 40 to 60, fading out by 160 (mids and highlights untouched), and only
// as much as the scene is dark (the darkFull..darkNone average, as darkLift). The strength eases over about a second
// (SHADOW_MS) so a cut from a bright to a dark shot does not jump. Settings > Dark scenes: Off = exactly 0.8.35.
export const SHADOW = { off: 0, normal: 0.12, strong: 0.2 };
export const SHADOW_MS = 350;   // time constant: ~95% of the way in one second
export function shadowLift(level) { TONE.shadow = SHADOW[level] ?? 0; return TONE.shadow; }
const SHADE = { k: null, at: 0 };
export function resetShadow() { SHADE.k = null; SHADE.at = 0; }
/** The dark-scene factor (0..1) eased toward `target`; a first still or a gap over 3 s jumps straight there. */
export function easeShadow(target, now = Date.now()) {
  const dt = now - SHADE.at;
  if (SHADE.k === null || dt > 3000 || dt < 0) SHADE.k = target;
  else SHADE.k += (target - SHADE.k) * (1 - Math.exp(-dt / SHADOW_MS));
  SHADE.at = now;
  return SHADE.k;
}
/** How much of the shadow lift a raw grey gets: 0 at 16 or less, 1 from 40 to 60, 0 again from 160. */
export function shadowShape(v) {
  if (v <= 16) return 0;
  if (v < 40) return (v - 16) / 24;
  if (v <= 60) return 1;
  return Math.max(0, (160 - v) / 100);
}
export const STILL_N = 5;      // auto: after this many stills in a row that held still, send the full-grey still
export const HOLD_REFRESH = 8; // auto: while held, refresh the full-grey still this often (slow drift never freezes)

/** Manga stills from the PC are already on the 16 greys (multiples of 17): map them, no dither. */
export function flatLevels(lum) {
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i += 1) out[i] = Math.min(15, Math.round(lum[i] / 17));
  return out;
}

/** Desk's tone math (desk-core.js toneGray16, same order) + darken, on one 0..255 grey still. */
export function toneLum(lum, w, h, tone = TONE) {
  const { contrast = 1, brightness = 0, highCut = 0, sharpen = 0, darken = 1, darkLift = 0, darkFull = 48, darkNone = 96,
    brightPull = 0, brightFrom = 150, brightFull = 210, knee = 0, whiteKnee = 0, whiteSlope = 1, shadow = 0, flash = false, now } = tone;
  const n = w * h;
  let lift = 0; let pull = 0; let shade = 0;
  if (darkLift > 0 || brightPull > 0 || shadow > 0) {
    let sum = 0; let seen = 0;
    for (let i = 0; i < n; i += 1) if (lum[i] > 16) { sum += lum[i]; seen += 1; }
    if (seen >= n * 0.02) {
      const avg = sum / seen;
      if (darkLift > 0) lift = 255 * darkLift * Math.max(0, Math.min(1, (darkNone - avg) / (darkNone - darkFull)));
      if (brightPull > 0) pull = 255 * brightPull * Math.max(0, Math.min(1, (avg - brightFrom) / (brightFull - brightFrom)));
      if (shadow > 0) shade = Math.max(0, Math.min(1, (darkNone - avg) / (darkNone - darkFull)));
    }
    if (shadow > 0) shade = 255 * shadow * easeShadow(shade, typeof now === 'function' ? now() : Date.now());
  }
  const a = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const raw = shade > 0 ? lum[i] + shade * shadowShape(lum[i]) : lum[i];   // 0.8.36 dark scenes: before the contrast
    a[i] = (raw - (lum[i] > 16 ? pull : 0) - 128) * contrast + 128 + brightness;
    if (lift > 0 && lum[i] > 16) a[i] += lift * Math.min(1, (lum[i] - 16) / 16);
  }
  let b = a;
  if (sharpen > 0) {
    b = new Float32Array(n);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const blur = (a[i] + a[x > 0 ? i - 1 : i] + a[x < w - 1 ? i + 1 : i] + a[y > 0 ? i - w : i] + a[y < h - 1 ? i + w : i]) / 5;
        b[i] = a[i] + sharpen * (a[i] - blur);
      }
    }
  }
  const k = (127 - 255 * highCut) / 127;
  const room = 255 - knee;   // soft knee: v above knee -> knee + room * x / (x + room), never reaching 255
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    let v = b[i];
    if (knee > 0 && v > knee) { const x = v - knee; v = knee + (room * x) / (x + room); }
    v = Math.max(0, Math.min(255, v));
    if (highCut > 0 && v > 128) v = 128 + (v - 128) * k;
    v = Math.round(v * darken);
    if (whiteKnee > 0 && v > whiteKnee) v = Math.round(whiteKnee + (v - whiteKnee) * whiteSlope);   // 0.8.11 Softer whites shoulder
    out[i] = Math.max(0, Math.min(255, v));
  }
  if (flash) flashCap(out, FLASH_STATE, typeof now === 'function' ? now() : Date.now());   // 0.9.8 Strong: flashes rise slowly
  return out;
}

/** One still -> the 16 glasses greys for a look. normal: toned, plain rounding (no dither = fewer lit dots);
 *  dither: toned + 4x4 ordered dither (steady frame to frame, so delta stays small); manga: already 16 greys;
 *  full (auto's held still): toned + dither, sent once, so the extra detail is free. */
export function levelsFor(lum, w, h, look) {
  if (look === 'manga' || look === 'auto') return flatLevels(lum);
  const t = toneLum(lum, w, h);
  return look === 'dither' || look === 'full' ? quantize(t, w, h) : flatLevels(t);
}

export function cleanBase(s) {
  const t = String(s || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(t) ? t : '';
}

// 0.8.25: the MemoMind app's page rules let <audio> load only https:, data: and blob: addresses (media-src), while
// fetch may use http: (connect-src; PluginWebViewNetworkPolicy in the app). The phone engine (Termux) is
// http://127.0.0.1, so its sound is fetched by the page and played from a blob: copy.
export const needsBlobSound = (base) => /^http:\/\//i.test(String(base || ''));

/** Whole sound file -> blob: URL (a video's m4a). Refuses files over maxBytes (the phone keeps it in memory). */
export async function soundBlobUrl(fetchFn, url, { maxBytes = 300e6, makeUrl = (b) => URL.createObjectURL(b) } = {}) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`the engine answered ${res.status}`);
  const n = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(n) && n > maxBytes) throw new Error(`sound too big for the phone (${Math.round(n / 1e6)} MB)`);
  return makeUrl(await res.blob());
}

/** Live: the endless sound stream fed into a MediaSource chunk by chunk. -> { src, stop() } or null (not supported). */
export function liveSoundSource(fetchFn, url, { MS = globalThis.MediaSource, makeUrl = (o) => URL.createObjectURL(o),
  type = 'audio/mpeg', keepS = 60 } = {}) {
  if (!MS || !MS.isTypeSupported?.(type)) return null;
  const ms = new MS();
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let stopped = false;
  const out = { src: makeUrl(ms), fed: 0, error: '', stop() { stopped = true; try { ctl?.abort(); } catch { /* gone */ } } };
  ms.addEventListener('sourceopen', async () => {
    let sb;
    try { sb = ms.addSourceBuffer(type); } catch (e) { out.error = `no sound buffer: ${e?.message ?? e}`; return; }
    try { sb.mode = 'sequence'; } catch { /* keep the default */ }
    const queue = [];
    const pump = () => {
      if (stopped || sb.updating) return;
      const b = sb.buffered;
      if (b?.length && b.end(b.length - 1) - b.start(0) > keepS * 2) {   // an endless stream: drop what was heard long ago
        try { sb.remove(b.start(0), b.end(b.length - 1) - keepS); return; } catch { /* try again later */ }
      }
      if (queue.length) { try { sb.appendBuffer(queue.shift()); out.fed += 1; } catch (e) { out.error = `${e?.message ?? e}`; } }
    };
    sb.addEventListener('updateend', pump);
    try {
      const res = await fetchFn(url, ctl ? { signal: ctl.signal } : {});
      if (!res.ok || !res.body) { out.error = `the engine answered ${res.status}`; return; }
      const rd = res.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done || stopped) break;
        queue.push(value); pump();
      }
    } catch (e) { if (!stopped) out.error = `${e?.message ?? e}`; }
  }, { once: true });
  return out;
}
// 0.8.29 (owner: "Still no audio from the phone engine"): the MemoMind app is Firefox's engine, whose MediaSource
// takes no mp3 and no bare AAC (isTypeSupported says false), so live phone sound never started. ytcast 0.7.11 sends
// the live sound as MP4 pieces on &fmt=mp4; this asks for those first and keeps mp3 for players that take it.
export const MP4_SOUND = 'audio/mp4; codecs="mp4a.40.2"';
export function liveSoundPick(fetchFn, url, opts = {}) {
  const mp4 = liveSoundSource(fetchFn, `${url}${url.includes('?') ? '&' : '?'}fmt=mp4`, { ...opts, type: MP4_SOUND });
  if (mp4) { mp4.kind = 'mp4'; return mp4; }
  const mp3 = liveSoundSource(fetchFn, url, { ...opts, type: 'audio/mpeg' });
  if (mp3) mp3.kind = 'mp3';
  return mp3;
}
/** A TV channel id the PC tunes itself (ytcast 0.7.3): pluto:<id>, tubi:<id>, tunarr:<uuid>. */
// 0.8.19: xc: added (0.8.18 listed IPTV channels but this check refused them: "Could not load: that is not a link").
export const isTvId = (s) => /^(pluto|tubi|tunarr|xc|xcm|xce):[A-Za-z0-9-]{1,40}$/.test(String(s || '').trim());
export function isYoutube(url) {
  return /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(String(url || '').trim());
}
/** Which still belongs to sound position `pos` seconds. */
export function frameIndex(pos, fps, count, lead = LEAD_S) {
  const i = Math.floor((Math.max(0, pos) + lead) * fps);
  return count > 0 ? Math.min(i, count - 1) : i;
}

/** One line of film facts for a Library card: "2008 · 2 h 6 min · 7.7/10 · PG-13 · Action, Science Fiction". Missing facts are left out. */
export function filmFacts(f) {
  const min = Math.round(Number(f?.runtime) || 0);
  const len = min <= 0 ? '' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  const score = Number(f?.rating) > 0 ? `${Number(f.rating).toFixed(1)}/10` : '';
  const genres = Array.isArray(f?.genres) ? f.genres.filter(Boolean).slice(0, 3).join(', ') : '';
  return [String(f?.year || ''), len, score, String(f?.mpaa || ''), genres].filter(Boolean).join(' · ');
}

/** When a news item went up, for its card: "Today 1:53 PM", "Yesterday 6:30 PM", "Nov 4". '' when the date is unreadable. */
export function newsWhen(iso, now = new Date()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  const h = d.getHours(); const m = d.getMinutes();
  const time = `${h % 12 || 12}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'AM' : 'PM'}`;
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`;
}
/** One line of facts for a News card: "PBS NewsHour · Full episode · 56 min · Today 7:02 PM". Missing facts are left out. */
export function newsFacts(item, now = new Date()) {
  const min = Math.round(Number(item?.minutes) || 0);
  return [String(item?.channel || ''), item?.full ? 'Full episode' : '', min > 0 ? `${min} min` : '', newsWhen(item?.published, now)].filter(Boolean).join(' · ');
}

// 0.8.4: the play loop no longer waits for ever. A still the PC never answers, or a send the glasses never
// confirm, froze the picture while the sound went on (owner 2026-11-06, Hulk stuck at 6:48). After STALL_MS the
// loop gives that one up and goes on with the still for "now".
export const STALL_MS = 8000;
// 0.8.17 newest frame: a still that is this many stills behind "now" once the link is free again is dropped and
// the newest one fetched instead (at most STALE_ROW in a row, so a slow PC still gets stills through).
export const STALE_STILLS = 3;
// 0.8.37: how long the page waits before asking a behind-the-times engine for a still again (was a flat 30 ms).
export const POLL_MIN_MS = 30;
export const POLL_MAX_MS = 250;
export const STALE_ROW = 2;
function realTimer(ms) {
  return new Promise((r) => { const t = setTimeout(r, ms); if (t && typeof t === 'object' && t.unref) t.unref(); });
}

export class YtPlayer {
  constructor({ link, fetchFn, clock, pause, base = DEFAULT_PC, timer = realTimer }) {
    this.link = link; this.fetchFn = fetchFn; this.clock = clock; this.pause = pause; this.timer = timer;
    this.onStall = null;   // (what: 'PC' | 'glasses', inARow) -> void; called when a request or a send never answered
    this.base = cleanBase(base) || DEFAULT_PC; this.info = null; this.running = false; this.seq = 0;
  }

  async getJson(path) {
    const res = await this.fetchFn(`${this.base}${path}`);
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) throw new Error(body?.error || `PC answered ${res.status}`);
    return body;
  }

  async load(url, w, h, fps = YT_FPS, look = 'normal') {
    if (!isYoutube(url)) throw new Error('that is not a YouTube link');
    return this.open(`url=${encodeURIComponent(url.trim())}`, w, h, fps, look);
  }

  /** A live channel (any link the PC's yt-dlp can read: YouTube live, cbsnews.com/.../live/, ...). The PC answers
   *  live: true, duration 0, count 0; stills roll on for ever, `afrom` = the newest still whose sound is whole. */
  async loadLive(url, w, h, fps = YT_FPS, look = 'normal') {
    const u = String(url || '').trim();
    if (!/^https?:\/\//.test(u) && !isTvId(u)) throw new Error('that is not a link');
    // 0.8.46: pc=1 = he chose the PC for this IPTV pick (Engine: PC); the PC (ytcast 0.7.27) refuses IPTV without it.
    const pc = this.iptvPc && /^(xc|xcm|xce):/.test(u) ? '&pc=1' : '';
    return this.open(`url=${encodeURIComponent(u)}${pc}`, w, h, fps, look);
  }

  /** 0.9.5 (engine 0.7.31): keep these live channels (next + previous) running in the background on the engine,
   *  so a switch to one is instant. [] = none. Answers { ok, warm: [{ url, key, ready, state }] } or null (old
   *  engine, warm off, engine gone: never an error, the switch just takes the old time). */
  async warm(urls, w, h, fps = YT_FPS, look = 'normal') {
    const list = (urls || []).map((x) => String(x || '').trim()).filter((x) => /^https?:\/\//.test(x) || isTvId(x));
    const pcLook = !look || look === 'dither' ? 'normal' : look;      // the same job key as open() makes
    const q = `urls=${encodeURIComponent(list.join('\n'))}&w=${w}&h=${h}&fps=${fps}${pcLook === 'normal' ? '' : `&look=${encodeURIComponent(pcLook)}`}`;
    try {
      const r = await this.getJson(`/warm?${q}`);
      return r && r.ok ? r : null;
    } catch { return null; }
  }

  /** The PC's TV guide (ytcast 0.7.3): { ok, groups: [{ name, src, channels: [{ id, name, number?, now }] }], notes,
   *  tubi_pending, channels }. A channel id (pluto:/tubi:/tunarr:) goes back through loadLive. */
  async tvGuide() {
    return this.getJson('/tv/guide');
  }

  /** 0.8.40 (ytcast 0.7.25): search the whole IPTV panel by name. kind = live | movie | series.
   *  { kind, q, results: [{ id, name, group }] }; id = xc:/xcm: (plays through loadLive) or xcs: (a show: iptvSeries). */
  async iptvSearch(q, kind = 'live') {
    return this.getJson(`/iptv/search?q=${encodeURIComponent(String(q || '').trim())}&kind=${encodeURIComponent(kind)}`);
  }

  /** A show's seasons: { name, seasons: [{ season, episodes: [{ id: 'xce:..', name, secs, episode }] }] }. */
  async iptvSeries(id) {
    return this.getJson(`/iptv/series?id=${encodeURIComponent(String(id || '').replace(/^xcs:/, ''))}`);
  }

  /** A video file on the NAS. rel = path below the NAS video folder, as /nas listed it (the PC refuses any other). */
  async loadFile(rel, w, h, fps = YT_FPS, look = 'normal') {
    if (!String(rel || '').trim()) throw new Error('pick a file first');
    return this.open(`file=${encodeURIComponent(rel)}`, w, h, fps, look);
  }

  /** One folder of the NAS video folder: { dir, parent, dirs, files: [{name, size}], more }. q = filter words. */
  async nasList(dir = '', q = '') {
    return this.getJson(`/nas?dir=${encodeURIComponent(dir || '')}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  }

  /** The film library the PC keeps ready: { films: [{rel, title, year, runtime, plot, tagline, mpaa, rating, genres, ready}], ready, scanned, night }. */
  async library() {
    return this.getJson('/library');
  }

  /** News from the free YouTube channels: { items: [{id, url, title, channel, published, full, minutes, ready}], ready, channels, stale, refreshing, read }. */
  async news() {
    return this.getJson('/news');
  }

  /** 0.8.24 (ytcast 0.7.7): a show's newest uploads, { key, name, items: [{id, url, title, minutes, published, ready}], read, how, old }. */
  async shows(key) {
    return this.getJson(`/shows?key=${encodeURIComponent(key)}`);
  }

  /** Captions of the loaded video: { state: 'loading' | 'ready' | 'none', cues: [[start, end, text]], lang, note }. */
  async subs(ai = false) {   // 0.8.22: ai = AI captions made on the PC when there are none (ytcast 0.7.6)
    if (!this.info) throw new Error('nothing loaded');
    return this.getJson(`/subs?key=${encodeURIComponent(this.info.key)}${ai ? '&ai=1' : ''}`);
  }

  /** Tell the PC the owner jumped to still i: it makes stills from there instead of finishing what it was on. */
  async seek(i) {
    if (!this.info) throw new Error('nothing loaded');
    const s = await this.getJson(`/seek?key=${encodeURIComponent(this.info.key)}&i=${Math.max(0, Math.floor(i))}`);
    this.info = { ...this.info, ...s, look: this.info.look };
    return this.info;
  }

  /** Jump to t seconds: park the play loop (no stale request may undo the jump), seek, wait for 1 s of stills there. */
  async prepare(t, { onTick = null, timeoutMs = 90000 } = {}) {
    if (!this.info) throw new Error('nothing loaded');
    const { fps } = this.info;
    const idx = frameIndex(t, fps, this.info.count, 0);
    this.hold = true;
    try {
      while (this.running && !this.parked) await this.pause(10);
      await this.seek(idx);
      const t0 = this.clock();
      for (;;) {
        const s = await this.status();
        if (onTick) onTick(s);
        if (s.state === 'error') throw new Error(s.error || 'the PC could not read that video');
        const first = s.first ?? 0;
        if (first <= idx && (s.ready >= Math.min(s.count || Infinity, idx + fps) || (s.done && s.ready > idx))) return s;
        if (this.clock() - t0 > timeoutMs) throw new Error('the PC is taking too long');
        await this.pause(300);
      }
    } finally { this.hold = false; this.parked = false; this.rebase = true; }
  }

  async open(what, w, h, fps, look) {
    if (w > MAX_W || h > MAX_H || w % 2) throw new Error(`size ${w}x${h} not allowed`);
    if (!LOOKS.includes(look)) throw new Error(`look ${look} not known`);
    this.info = null;
    // normal and dither are the same still on the PC; the tone and dither are done here on the phone.
    const pcLook = look === 'dither' ? 'normal' : look;
    const q = `${what}&w=${w}&h=${h}&fps=${fps}${pcLook === 'normal' ? '' : `&look=${pcLook}`}`;
    const info = await this.getJson(`/load?${q}`);
    // An older PC service (0.1.x) ignores look and answers without one: that is a normal still.
    const got = info.look || 'normal';
    this.info = { ...info, look: got === 'normal' ? (look === 'dither' ? 'dither' : 'normal') : got };
    return this.info;
  }

  async status() {
    if (!this.info) throw new Error('nothing loaded');
    const s = await this.getJson(`/status?key=${encodeURIComponent(this.info.key)}`);
    this.info = { ...this.info, ...s };
    return this.info;
  }

  /** Wait until a couple of seconds of stills (and the sound) are on the PC. onTick(info) for the UI. */
  async waitReady({ seconds = 2, timeoutMs = null, soundWaitMs = null, onTick = null } = {}) {
    const t0 = this.clock();
    // A NAS film's sound is copied out of the file in one pass over the network: give it minutes, not seconds.
    const nas = !!this.info?.nas;
    const soundMs = soundWaitMs ?? (nas ? 1200000 : 20000);
    const limit = timeoutMs ?? (nas ? 300000 : 60000);
    for (;;) {
      const s = await this.status();
      if (onTick) onTick(s);
      if (s.state === 'error') throw new Error(s.error || 'the PC could not read that video');
      const enough = s.ready >= Math.min(s.count || Infinity, seconds * s.fps) || s.done;
      const mute = /^sound:/.test(s.error || '');
      if (enough && (s.audio || mute || this.clock() - t0 > soundMs)) return s;
      if (this.clock() - t0 > limit) throw new Error('the PC is taking too long');
      await this.pause(400);
    }
  }

  /** The sound URL. Live: from still `from` (default: the PC's newest whole segment, info.afrom) on, endless. */
  // Live, phone sound: the PC picks where the endless sound stream begins (the newest whole segment) and notes it
  // as `aserved` (and counts the stream in `aseq`). After audio.play() this waits for that note and returns the
  // second the pictures must start at, so they line up with the sound. An older PC (no aseq) -> afrom.
  async audioStart(prevSeq, { tries = 15, waitMs = 200 } = {}) {
    if (!this.info?.live) return 0;
    for (let i = 0; i < tries; i += 1) {
      const s = await this.status();
      if (!Number.isFinite(s.aseq)) break;
      if (s.aseq > prevSeq && Number.isFinite(s.aserved)) return s.aserved / s.fps;
      await this.timer(waitMs);
    }
    return (this.info.afrom || 0) / this.info.fps;
  }

  // Live: `from` = the still the sound starts at; null = the PC picks where the sound is when the stream is asked for.
  audioUrl(from = null) {
    if (!this.info) return '';
    const u = `${this.base}/audio?key=${encodeURIComponent(this.info.key)}`;
    if (!this.info.live) return u;
    return Number.isFinite(from) && from > 0 ? `${u}&from=${Math.floor(from)}` : u;
  }

  /** PC speakers. Live: from still `from` (see audioUrl); the PC's clock then counts from from/fps seconds. */
  async pcSound(t, from = null) {
    const k = encodeURIComponent(this.info.key);
    if (this.info.live) {   // answers {playing, key, pos}: pos = the second the sound began at (the pictures start there)
      return this.getJson(`/pcplay?key=${k}${Number.isFinite(from) && from > 0 ? `&from=${Math.floor(from)}` : ''}`);
    }
    return this.getJson(`/pcplay?key=${k}&t=${t.toFixed(2)}`);
  }
  async pcStop() { try { await this.getJson('/pcstop'); } catch { /* PC gone */ } }

  /** One still -> brightness bytes (+ how long the picture has held still). null when the PC has none yet.
   *  full: the auto look's normal 16-grey still instead of the manga one. */
  async fetchFrame(i, full = false) {
    const { key, w, h } = this.info;
    const res = await this.fetchFn(`${this.base}/frame?key=${encodeURIComponent(key)}&i=${i}${full ? '&full=1' : ''}`);
    if (res.status === 425) return null;
    if (!res.ok) throw new Error(`frame: PC answered ${res.status}`);
    const lum = new Uint8Array(await res.arrayBuffer());
    if (lum.length !== w * h) throw new Error(`frame: wrong size ${lum.length}`);
    const index = Number(res.headers?.get?.('X-Index') ?? i);
    const still = Number(res.headers?.get?.('X-Still') ?? 0) || 0;
    return { lum, index, still };
  }

  stop() { this.running = false; }

  /**
   * position() -> seconds into the video (the sound's clock). Runs until the video ends or stop().
   * Each turn: pick the still for "now", fetch it from the PC while the previous send is still in flight,
   * then send it. If the glasses are slower than the video, stills are skipped, never queued: the picture
   * stays in step with the sound.
   */
  async play({ position, pack = 'lz4', dispW = 600, dispH = 350, onFrame = null, keyEvery = KEY_EVERY, picture = 'big', captions = null, denoise = true, budget = 0, flight = 1, sceneCut = 0 }) {
    // 0.8.41: budget = busy-scene byte cap for a delta (0 = off, core.js budgetLevels); flight = pictures on the link at
    // once (1 = wait for each, the old way; 2 = send the next while the last is still going: +50% fps in the bench, but
    // two sends in flight is the pattern that has crashed the glasses' Bluetooth task before - a setting, off by default).
    if (!this.info) throw new Error('nothing loaded');
    const { w, h, fps } = this.info;
    const look = this.info.look || 'normal';
    const scale = pictureScale(w, h, dispW, dispH, picture);
    const live = !!this.info.live;
    const end = live ? Infinity : Math.max(1, this.info.duration || 0);   // a live channel never ends by itself
    this.running = true; this.parked = false; this.rebase = false;
    const acks = []; let bytes = 0, errors = 0, sent = 0, skipped = 0, last = -1, prev = null, sinceKey = 0;
    let prevLv = null, steadySince = null, steadyHeld = 0, steadyFreed = 0, fetchMs = 0, repeats = 0; // 0.8.37: the greys on show, the grain held, the last fetch time
    let lastShown = null, cuts = 0; // 0.8.42: the greys of the last still sent, before the grain hold (scene cut)
    let stale = 0, staleRow = 0;  // 0.8.17: stills dropped because they went out of date while the link was busy
    let held = -1, heldStills = 0, fullSent = 0, wasFull = false; // auto look: the full-grey still on show
    const pending = []; const lanes = flight >= 2 ? 2 : 1; let busyFrames = 0, busyBlocks = 0;
    const drain = async (n) => { while (pending.length > n) await pending.shift(); };
    // SK: Gray planes suit the smooth normal/dither greys, plain binary planes the flat manga greys (measured on
    // the PC, 2026-11-05). The auto look switches between the two, which starts a new stream (a keyframe).
    const sk = SK_PACKS[pack] ? new SkSender(SK_PACKS[pack]) : null;
    const t0 = this.clock();
    let stalls = 0; const row = { PC: 0, glasses: 0 };
    // guard(p, what): p's answer, or null once STALL_MS passed without one (the late answer is then ignored).
    const guard = (p, what) => {
      let open = true;
      return Promise.race([
        p.then((v) => { if (open) { open = false; row[what] = 0; } return v; }),
        this.timer(STALL_MS).then(() => {
          if (!open || !this.running) return null;
          open = false; stalls += 1; row[what] += 1; prev = null; prevLv = null; if (sk) sk.reset();
          if (this.onStall) this.onStall(what, row[what]);
          return null;
        }),
      ]);
    };
    while (this.running) {
      // A jump is being prepared: ask the PC for nothing until it is ready, then start clean from the new place.
      if (this.hold) { await drain(0); this.parked = true; await this.pause(20); continue; }
      if (this.rebase) { this.rebase = false; last = -1; prev = null; prevLv = null; held = -1; if (sk) sk.reset(); }
      const pos = position();
      if (pos >= end + 0.3) break;
      // Live: count is 0 (no end), the PC clamps a still past its newest and answers the real X-Index; an
      // answer equal to the last one is just waited out below (the picture then follows the PC's pace).
      const idx = frameIndex(pos, fps, live ? 0 : this.info.count);
      if (idx === last) { await this.pause(10); continue; }
      const fs0 = this.clock();
      const fetching = guard(this.fetchFrame(idx).then((v) => { fetchMs = this.clock() - fs0; return v; })
        .catch((e) => { errors += 1; if (errors > 30 && sent === 0) throw e; return null; }), 'PC');
      await drain(lanes - 1);
      if (!this.running) break;
      // The caption for "now" goes before the still; only when it changes (captions.at gives null otherwise).
      const cap = captions ? captions.at(pos) : null;
      if (cap) { try { await this.link.send(cap); } catch { captions.reset(); } }
      const got = await fetching;
      if (!got || got.index === last) {
        // 0.8.37: the engine has nothing newer yet. Asking again every 30 ms (33 requests a second, each one a
        // whole still off the phone engine's disk) is what a 1-still-a-second engine gets hammered with; back off.
        repeats += 1;
        await this.pause(Math.min(POLL_MAX_MS, POLL_MIN_MS * repeats));
        continue;
      }
      repeats = 0;
      // 0.8.17 generation check: the link was busy, so "now" may have moved on while this still waited. If it is
      // out of date, drop it and fetch the newest (the next turn). Live channels follow the PC's own index instead.
      // 0.8.37: only drop a still when a fresh fetch can really catch up: the engine answered what was asked
      // (got.index >= idx - 1) and fetching is cheap next to the age (fetchMs * 2 < age). A still the engine is
      // already behind on is the only one there is: show it instead of throwing it away.
      const ageMs = (frameIndex(position(), fps, this.info.count) - got.index) * 1000 / fps;
      if (!live && staleRow < STALE_ROW && ageMs >= (STALE_STILLS * 1000) / fps && got.index >= idx - 1 && fetchMs * 2 < ageMs) {
        stale += 1; staleRow += 1; continue;
      }
      staleRow = 0;
      if (last >= 0 && got.index > last + 1) skipped += got.index - last - 1;
      last = got.index;
      // Look: manga stills go on as they are (already 16 greys); auto swaps in ONE full-grey still once the
      // shot holds still, then sends nothing until it moves again (or HOLD_REFRESH stills, for slow drift).
      let lum = got.lum, full = false;
      if (look === 'auto' && got.still >= STILL_N) {
        if (held >= 0 && got.index - held < HOLD_REFRESH) { heldStills += 1; continue; }
        const f = await this.fetchFrame(got.index, true).catch(() => null);
        if (!this.running) break;
        if (f) { lum = f.lum; full = true; held = got.index; fullSent += 1; }
      } else if (look === 'auto') held = -1;
      const shown = levelsFor(lum, w, h, full ? 'full' : look);
      // Switching between manga and full grey changes most of the picture: send it whole, not as a delta.
      // 0.8.42: a scene cut (sceneCut share of the greys changed) gets a fresh picture too.
      const cut = sceneCut > 0 && !sk && pack === 'delta' && !!prev && isSceneCut(lastShown, shown, sceneCut);
      if (cut) cuts += 1;
      const key = pack !== 'delta' || !prev || sinceKey >= keyEvery || full || wasFull || cut;
      lastShown = shown;
      wasFull = full;
      // 0.8.37: on a delta run a one-step flicker (grain) keeps the level on show, so the XOR is mostly zeros.
      if (!steadySince || steadySince.length !== shown.length) steadySince = new Float64Array(shown.length);
      const steady = denoise && !key && prevLv ? steadyLevels(prevLv, shown, { since: steadySince, now: this.clock() })
        : (steadySince.fill(0), { levels: shown, held: 0, freed: 0 });
      steadyHeld += steady.held; steadyFreed += steady.freed;
      let lv = steady.levels;
      if (budget > 0 && !key && !sk && prevLv && prevLv.length === lv.length) {
        const b = budgetLevels(prevLv, lv, w, h, { budget });
        if (b.blocks) { busyFrames += 1; busyBlocks += b.blocks; lv = b.levels; }
      }
      const packed = pack4(lv, w, h);
      prevLv = lv;
      const smooth = full || look === 'normal' || look === 'dither';
      const frame = sk ? sk.frame({ seq: this.seq, w, h, scale, levels: lv, gray: smooth, keyEvery })
        : encodePacked({ seq: this.seq, w, h, scale, pack: key ? (pack === 'raw' ? 'raw' : 'lz4') : 'delta', packed, prev });
      sinceKey = key ? 1 : sinceKey + 1;
      prev = packed;
      this.seq = (this.seq + 1) & 0xffff;
      const s = this.clock(); const info = { n: sent + 1, w, h, index: got.index, pos, enc: frame.enc, bytes: frame.message.length, lum, look: full ? 'full' : look };
      pending.push(guard(Promise.resolve(this.link.send(frame.message)).then(
        () => { const ms = this.clock() - s; acks.push(ms); bytes += frame.message.length; sent += 1; if (onFrame) onFrame({ ...info, ack: ms }); },
        (e) => { errors += 1; prev = null; prevLv = null; if (sk) sk.reset(); if (errors >= 5 && acks.length === 0) { this.running = false; this.failure = e; } },
      ), 'glasses'));
    }
    await drain(0);
    this.running = false; this.parked = false;
    const capOff = captions ? captions.off() : null;
    if (capOff) { try { await this.link.send(capOff); } catch { /* glasses gone */ } }
    if (this.failure) { const e = this.failure; this.failure = null; throw e; }
    const r = summarize({ w, h, pattern: 'youtube', lz4: pack === 'lz4' || pack === 'delta', pack, acks, bytes, errors, elapsed: this.clock() - t0 });
    r.skipped = Math.max(0, skipped); r.title = this.info.title; r.look = look; r.held = heldStills; r.fullStills = fullSent; r.stalls = stalls; r.stale = stale; r.steady = steadyHeld; r.steadyFreed = steadyFreed; r.busy = busyFrames; r.busyBlocks = busyBlocks; r.flight = lanes; r.cuts = cuts;
    return r;
  }
}
