// 0.9.10 Phone sound player (owner 2026-11-11: "there was a crash too" = Android killed the MemoMind app for low
// memory while MM Video copied a whole film's sound into the page; the app's page plays only https/blob, the phone
// engine is http). Media Link 0.8.0 (127.0.0.1:8795) can play the phone engine's sound itself: no copy in the page.
// NativeSound looks like the bits of <audio> plugin.js uses (src, currentTime, paused, play, pause,
// addEventListener) so the player code stays the same. Off: Settings > "Phone sound player" (then the 0.9.9 copy).
// Memory guard: before the old copy is made, Media Link is asked how much memory is left; "critical" = no copy
// (pictures only) instead of a crash.
export const NATIVESOUND_KEY = 'mmvideo.nativesound';
export const LINK = 'http://127.0.0.1:8795';
export const ENGINE_SOUND = /^http:\/\/(127\.0\.0\.1|localhost):11500\/audio\?/i;   // all Media Link will play
export const READY_MS = 20000;     // load: Media Link must have the sound ready by then, or the page copies it as before
export const PLAY_MS = 15000;      // play(): must be playing by then
export const POLL_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET json with a time limit; null on any failure. */
export async function getJson(fetchFn, url, ms = 2500) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const r = await fetchFn(url, ctl ? { signal: ctl.signal } : {});
    if (!r || !r.ok) return null;
    return await r.json();
  } catch { return null; } finally { if (t) clearTimeout(t); }
}

/** Media Link is there and its sound player is on (0.8.0+, not switched off). */
export async function linkHasSound(fetchFn, link = LINK) {
  const h = await getJson(fetchFn, `${link}/health`, 1500);
  return !!(h && h.sound === true);
}

/** 'ok' | 'low' | 'critical' | '' (unknown: no Media Link 0.8.0). */
export async function memoryLevel(fetchFn, link = LINK) {
  const m = await getJson(fetchFn, `${link}/sensor/memory`, 1500);
  return m && typeof m.level === 'string' ? m.level : '';
}

/** The old way (a copy of the whole sound in the page) is allowed unless memory is already critical. */
export const copyAllowed = (level) => level !== 'critical';

/** When the native player is used: switch on, phone engine sound (not live), Media Link says sound:true. */
export const useNative = ({ on, live, url, linkOk }) => !!(on && !live && linkOk && ENGINE_SOUND.test(String(url || '')));

export class NativeSound {
  constructor({ fetchFn, link = LINK, clock = () => Date.now(), wait = sleep, pollMs = POLL_MS, background = true } = {}) {
    this.fetchFn = fetchFn; this.link = link; this.clock = clock; this.wait = wait; this.pollMs = pollMs;
    this.background = background;   // false in tests: no endless state poll while playing
    this.url = ''; this.preload = 'auto'; this.native = true;
    this.state = 'idle'; this.pos = 0; this.at = clock(); this.loaded = false; this.err = '';
    this.q = Promise.resolve(); this.on = { playing: [], error: [] }; this.polling = false; this.gone = false;
  }
  set src(u) { this.url = String(u || ''); this.loaded = false; this.pos = 0; this.at = this.clock(); this.state = 'idle'; }
  get src() { return this.url; }
  get paused() { return this.state !== 'playing'; }
  get currentTime() { return this.state === 'playing' ? this.pos + Math.max(0, this.clock() - this.at) / 1000 : this.pos; }
  set currentTime(t) {
    const v = Math.max(0, Number(t) || 0);
    this.pos = v; this.at = this.clock();
    if (this.loaded) void this.send(`/sound/seek?at=${v.toFixed(2)}`);
  }
  addEventListener(type, fn) { if (this.on[type]) this.on[type].push(fn); }
  fire(type) { for (const f of this.on[type] || []) { try { f(); } catch { /* a listener's problem */ } } }

  /** Commands go one after another (a seek must land before the resume that follows it). */
  send(path) {
    const p = this.q.then(() => getJson(this.fetchFn, `${this.link}${path}`, 4000));
    this.q = p.catch(() => null);
    return p;
  }
  take(s) {   // a /sound/state answer
    if (!s || s.ok !== true) return;
    if (typeof s.state === 'string') {
      const was = this.state;
      if (s.state === 'error') { this.err = s.error || 'player error'; if (was !== 'error') { this.state = 'error'; this.fire('error'); } return; }
      if (s.state === 'playing' || s.state === 'paused' || s.state === 'ready' || s.state === 'ended' || s.state === 'preparing') this.state = s.state;
      if (s.state === 'playing' && was !== 'playing') this.fire('playing');
    }
    if (Number.isFinite(s.posMs) && this.state !== 'preparing') { this.pos = s.posMs / 1000; this.at = this.clock(); }
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      while (!this.gone && this.loaded && this.state !== 'idle') {
        this.take(await this.send('/sound/state'));
        await this.wait(this.pollMs);
      }
    } finally { this.polling = false; }
  }
  /** Ask Media Link to get the sound ready (not playing). -> true when ready within READY_MS. */
  async load(ms = READY_MS) {
    if (!ENGINE_SOUND.test(this.url)) return false;
    const r = await this.send(`/sound/play?url=${encodeURIComponent(this.url)}&at=${this.pos.toFixed(2)}&start=0`);
    if (!r || r.ok !== true) return false;
    this.loaded = true; this.state = 'preparing';
    const end = this.clock() + ms;
    while (this.clock() < end && !this.gone) {
      const s = await this.send('/sound/state');
      if (s && s.ok === true && (s.state === 'ready' || s.state === 'paused')) { this.state = 'ready'; this.pos = (s.posMs || 0) / 1000; this.at = this.clock(); return true; }
      if (s && s.state === 'error') { this.err = s.error || 'player error'; this.loaded = false; this.state = 'idle'; return false; }
      await this.wait(this.pollMs);
    }
    this.loaded = false; this.state = 'idle';
    void this.send('/sound/stop');
    return false;
  }
  /** Like audio.play(): resolves once Media Link plays, rejects on an error or after PLAY_MS. */
  async play(ms = PLAY_MS) {
    if (!this.loaded) {
      if (!ENGINE_SOUND.test(this.url)) throw new Error('not the phone engine sound');
      const r = await this.send(`/sound/play?url=${encodeURIComponent(this.url)}&at=${this.pos.toFixed(2)}&start=1`);
      if (!r || r.ok !== true) throw new Error('Media Link refused the sound');
      this.loaded = true; this.state = 'preparing';
    } else {
      const r = await this.send('/sound/resume');
      if (!r || r.ok !== true) throw new Error('Media Link did not answer');
    }
    const end = this.clock() + ms;
    while (this.clock() < end && !this.gone) {
      const s = await this.send('/sound/state');
      this.take(s);
      if (this.state === 'playing') { if (this.background) void this.poll(); return; }
      if (this.state === 'error') throw new Error(`Media Link sound: ${this.err}`);
      await this.wait(this.pollMs);
    }
    throw new Error('Media Link sound did not start');
  }
  pause() {
    if (this.state === 'playing') { this.pos = this.currentTime; this.at = this.clock(); }
    if (this.loaded) { this.state = this.state === 'error' ? 'error' : 'paused'; void this.send('/sound/pause'); }
  }
  /** Stop and let Media Link drop the player (a new load, Stop for good, the page going away). */
  stop() {
    this.gone = true; const was = this.loaded; this.loaded = false; this.state = 'idle';
    if (was) void this.send('/sound/stop');
  }
}
