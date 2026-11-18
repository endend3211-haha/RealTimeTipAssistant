// MM Video 0.9.3 (owner 2026-11-10: "Give me a YouTube tab for my favorite channels", "Remove dazn but ad msnbc",
// "by covers I meant actual pictures"). Pure helpers, no page or storage access: tested in test/ui093.test.mjs.

export const YTCHANS_KEY = 'mmvideo.ytchans';     // [{ key, name, pic }]: the channel list on the YouTube tab
export const YTCHANS_ON_KEY = 'mmvideo.ytchanson'; // the switch (Settings > Playing and channels)
export const FAVFIX_KEY = 'mmvideo.favfix093';     // the one-time favorites fix ran
export const MAX_CHANS = 30;
export const BUILTIN = ['jre', 'whyfiles'];        // keys every engine since ytcast 0.7.7 knows
export const DEFAULT_CHANS = [{ key: '@NASA', name: 'NASA', pic: '' }];   // share copy: add your own on the YouTube tab

const HANDLE = /^@[\w.-]{3,40}$/;
const UCID = /^UC[\w-]{22}$/;
const validKey = (k) => typeof k === 'string' && (BUILTIN.includes(k) || HANDLE.test(k) || UCID.test(k));

// A channel link, an @name, a bare name or a UC... id -> the key the engine takes ('' = not a channel).
export function chanKey(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (HANDLE.test(t) || UCID.test(t)) return t;
  if (/^[\w.-]{3,40}$/.test(t) && !/^(https?|www)$/i.test(t)) return `@${t}`;
  let u;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return ''; }
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  let first = parts[0] || '';
  try { first = decodeURIComponent(first); } catch { return ''; }
  if (HANDLE.test(first)) return first;
  if (first === 'channel' && UCID.test(parts[1] || '')) return parts[1];
  return '';
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const cleanPic = (p) => (typeof p === 'string' && /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/\w+\.jpg$/.test(p) ? p : '');

// Whatever storage held -> a safe list (no duplicates, known key shapes, pictures only from YouTube's own server).
export function cleanChans(v) {
  if (!Array.isArray(v)) return DEFAULT_CHANS.map((c) => ({ ...c }));
  const out = [];
  for (const x of v) {
    if (!x || !validKey(x.key) || out.some((c) => same(c.key, x.key))) continue;
    out.push({ key: x.key, name: String(x.name || x.key).slice(0, 80), pic: cleanPic(x.pic) });
    if (out.length >= MAX_CHANS) break;
  }
  return out;
}
export const hasChan = (list, key) => list.some((c) => same(c.key, key));
export function addChan(list, key) {
  if (!validKey(key) || hasChan(list, key) || list.length >= MAX_CHANS) return list;
  return [...list, { key, name: key, pic: '' }];
}
export const removeChan = (list, key) => list.filter((c) => !same(c.key, key));
// After the engine answered for a channel: keep its real name and the newest video's picture.
export function chanSeen(list, key, name, pic) {
  return list.map((c) => (same(c.key, key)
    ? { ...c, name: name ? String(name).replace(/\s+-\s+Videos$/i, '').slice(0, 80) : c.name, pic: cleanPic(pic) || c.pic }
    : c));
}

// One time: DAZN favorites go, US: MSNBC HD comes in (owner's IPTV list, id checked 2026-11-10).
export const MSNBC = { id: '', name: '' };   // share copy: no IPTV favorite
export function favFix(favs) {
  const kept = (Array.isArray(favs) ? favs : []).filter((f) => f && !/dazn/i.test(String(f.name || '')));
  // share copy: no IPTV favorite added
  return kept;
}

// Real photos for the Browse tiles (Unsplash, free to use; credits in NOTICE.md). Loaded from Unsplash's image server.
export const TILE_PHOTOS = {
  live: 'photo-1759576981262-95fd51a994a7',
  movies: 'photo-1489599849927-2ee91cede3ba',
  shows: 'photo-1478737270239-2f02b77fc618',
  news: 'photo-1504711434969-e33886168f5c',
  nas: 'photo-1695668548342-c0c1ad479aee',
};
export function tilePhoto(row) {
  const id = TILE_PHOTOS[row];
  return id ? `https://images.unsplash.com/${id}?w=400&q=70&auto=format&fit=crop` : '';
}
