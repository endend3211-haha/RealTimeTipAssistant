// 0.8.31 (owner: "everytime I update I have to redo it again" - his favorites): a Studio reinstall empties the app's
// storage, so the page keeps a copy of its favorites, hidden channels and settings on the engine (phone Termux and
// PC, GET/POST /prefs, ytcast 0.7.15) and puts back any of them that are missing at start. A value already on the
// phone is never overwritten. No secrets are kept (only mmvideo.* keys, never the big TV guide cache). Pure: tested
// in node with a fake storage and a fake fetch.
export const GUIDE_CACHE = 'mmvideo.tvguide.cache';
export const keepable = (k) => typeof k === 'string' && k.startsWith('mmvideo.') && k !== GUIDE_CACHE;

export class Keeper {
  /** storage: gm.storage ({ get(k) -> {value}, set(k, v) }); bases(): engine addresses to keep the copy on. */
  constructor({ storage, fetchFn, bases, wait, delayMs = 1500, timeoutMs = 3000, log = () => {} }) {
    this.storage = storage; this.fetchFn = fetchFn; this.bases = bases; this.wait = wait;
    this.delayMs = delayMs; this.timeoutMs = timeoutMs; this.log = log;
    this.copy = {}; this.timer = null; this.dirty = false;
    this.store = {
      get: (k) => this.storage.get(k),
      set: (k, v) => {
        const r = this.storage.set(k, v);
        if (keepable(k)) { this.copy[k] = v; this.schedule(); }
        return r;
      },
    };
  }

  urls(path) {
    const out = [];
    for (const b of this.bases() || []) {
      const u = `${String(b || '').replace(/\/+$/, '')}${path}`;
      if (b && !out.includes(u)) out.push(u);
    }
    return out;
  }

  /** A fetch that gives up after timeoutMs (start-up must not hang on an engine that is off). */
  async timed(url, opts) {
    let late = false;
    const give = this.wait(this.timeoutMs).then(() => { late = true; return null; });
    const r = await Promise.race([this.fetchFn(url, opts).catch(() => null), give]);
    return late ? null : r;
  }

  /** At start: read the kept copies, fill in every key the phone has no value for (newest copy first), then load
   * the phone's own values into the copy. Returns { put: [keys put back], from: [urls that answered] }. */
  async restore(keys) {
    const got = await Promise.all(this.urls('/prefs').map(async (url) => {
      try {
        const r = await this.timed(url, { cache: 'no-store' });
        if (!r || !r.ok) return null;
        const d = await r.json();
        return d && typeof d.prefs === 'object' && d.prefs ? { url, at: Number(d.at) || 0, prefs: d.prefs } : null;
      } catch { return null; }
    }));
    const copies = got.filter(Boolean).sort((a, b) => b.at - a.at);
    const put = [];
    const mine = {};
    for (const k of new Set([...(keys || []), ...copies.flatMap((c) => Object.keys(c.prefs))])) {
      if (!keepable(k)) continue;
      let v;
      try { v = (await this.storage.get(k))?.value; } catch { v = undefined; }
      if (v === undefined || v === null) {
        const c = copies.find((x) => x.prefs[k] !== undefined && x.prefs[k] !== null);
        if (!c) continue;
        v = c.prefs[k];
        try { await this.storage.set(k, v); put.push(k); } catch { continue; }
      }
      mine[k] = v;
    }
    this.copy = { ...mine, ...this.copy };
    return { put, from: copies.map((c) => c.url) };
  }

  schedule() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = this.wait(this.delayMs).then(() => { this.timer = null; return this.push(); });
  }

  /** Send the copy to every engine (text/plain: no CORS preflight). Merged there, so nothing is lost. */
  async push() {
    if (!this.dirty) return 0;
    this.dirty = false;
    const body = JSON.stringify(this.copy);
    let ok = 0;
    await Promise.all(this.urls('/prefs').map(async (url) => {
      const r = await this.timed(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
      if (r && r.ok) ok += 1;
    }));
    if (!ok) this.log('favorites/settings copy: no engine answered (kept on the phone only)');
    return ok;
  }
}
