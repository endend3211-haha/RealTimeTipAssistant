// 0.9.2 (owner 2026-11-10: "Can we show covers on those files" -> channel logos, film / show posters, Browse tiles).
// Pure helpers, no page state. A cover is a rounded box with the name's initials on a colour picked from the name;
// a picture, when there is one, is laid over it and falls back to the initials if it fails to load.
// Pictures: YouTube thumbnails (https, built from the video id) and IPTV logos / posters by id from the engine's
// /iptv/logo (engine 0.7.28+; the panel's picture address never reaches the page). The app's CSP allows https: and
// blob: images, not http:, so engine pictures are fetched (connect-src) and shown from a blob: URL.

export const COVERS_KEY = 'mmvideo.covers';
export const TILEPICS_KEY = 'mmvideo.tilepics';
export const COVER_HUES = 8;

export function ytId(url) {
  const m = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(String(url || ''));
  return m ? m[1] : '';
}
export function ytThumb(url) { const id = ytId(url); return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : ''; }

const SKIP = new Set(['THE', 'A', 'AN', 'OF', 'AND', 'TV', 'HD', 'FHD', 'UHD', '4K', 'US', 'USA', 'UK', 'EN']);
export function initials(name) {
  const words = String(name || '').replace(/^[A-Z]{2,3}\s*[:|]\s*/, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
  const keep = words.filter((w) => !SKIP.has(w.toUpperCase()));
  const use = keep.length ? keep : words;
  if (!use.length) return '?';
  // 0.9.4: a short all-caps name is the logo itself (CBS News = CBS, not CN; CNN = CNN)
  if (/^[A-Z0-9]{2,3}$/.test(use[0]) && /[A-Z]/.test(use[0])) return use[0];
  if (use.length === 1) return [...use[0]].slice(0, 2).join('').toUpperCase();
  return ([...use[0]][0] + [...use[1]][0]).toUpperCase();
}
export function hueClass(name) {
  let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `cv${h % COVER_HUES}`;
}
export const hasLogoId = (id) => /^(xc|xcm|xcs):\d+$/.test(String(id || ''));

// One cover element. pic: a URL string, a Promise of one ('' = none), or ''. wide: 16:9 (thumbnails) else square.
export function coverEl(doc, { name, pic = '', wide = false, cls = '' }) {
  const box = doc.createElement('span');
  box.className = `cover ${hueClass(name)}${wide ? ' wide' : ''}${cls ? ` ${cls}` : ''}`;
  box.setAttribute('aria-hidden', 'true');
  const ini = doc.createElement('span'); ini.className = 'ini'; ini.textContent = initials(name);
  box.append(ini);
  const put = (src) => {
    if (!src) return;
    const img = doc.createElement('img'); img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    img.addEventListener('load', () => { box.classList.add('pic'); });
    img.addEventListener('error', () => { img.remove(); box.classList.remove('pic'); });
    img.src = src; box.append(img);
  };
  if (pic && typeof pic.then === 'function') pic.then(put, () => {}); else put(pic);
  return box;
}

// Engine logos by id: one fetch per id, kept as a blob: URL; a miss (404, not a picture, engine down) is remembered
// for a while so a repaint does not ask again. Only xc ids are asked (the others have no logo on the engine).
export class LogoCache {
  constructor({ fetchFn, base, makeUrl = (b) => URL.createObjectURL(b), now = () => Date.now(), max = 300, missMs = 10 * 60_000 }) {
    this.fetchFn = fetchFn; this.base = base; this.makeUrl = makeUrl; this.now = now; this.max = max; this.missMs = missMs;
    this.got = new Map(); this.miss = new Map(); this.wait = new Map();
  }
  logo(id) {
    if (!hasLogoId(id)) return Promise.resolve('');
    if (this.got.has(id)) return Promise.resolve(this.got.get(id));
    const m = this.miss.get(id); if (m !== undefined && this.now() - m < this.missMs) return Promise.resolve('');
    if (this.wait.has(id)) return this.wait.get(id);
    const base = String(this.base() || '').replace(/\/+$/, '');
    if (!base) return Promise.resolve('');
    const p = (async () => {
      try {
        const r = await this.fetchFn(`${base}/iptv/logo?id=${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error(String(r.status));
        const type = (r.headers?.get?.('content-type') || '').toLowerCase();
        if (!type.startsWith('image/') || type.includes('svg')) throw new Error('not a picture');
        const url = this.makeUrl(await r.blob());
        if (this.got.size >= this.max) this.got.delete(this.got.keys().next().value);
        this.got.set(id, url); return url;
      } catch { this.miss.set(id, this.now()); return ''; } finally { this.wait.delete(id); }
    })();
    this.wait.set(id, p); return p;
  }
}

// The Browse tiles show the last thing picked in that row: { live|movies|shows|news: { yt?: url, id?: xc id, name } }.
export function tilePick(pics, view, item) {
  const out = { ...(pics && typeof pics === 'object' ? pics : {}) };
  if (!['live', 'movies', 'shows', 'news'].includes(view) || !item) return out;
  const yt = ytThumb(item.url) ? item.url : '';
  const id = hasLogoId(item.id || item.url) ? (item.id || item.url) : '';
  if (!yt && !id && !item.name) return out;
  out[view] = { ...(yt ? { yt } : {}), ...(id ? { id } : {}), name: String(item.name || '').slice(0, 80) };
  return out;
}
