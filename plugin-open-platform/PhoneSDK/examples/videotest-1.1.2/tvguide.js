// 0.8.10 The Live tab as a TV. The PC (ytcast 0.7.3 /tv/guide) sends the line-up: the owner's own channels on the
// NAS (Tunarr), Pluto TV and Tubi, by group, with what is on now. This module shapes that for the phone: the phone's
// own 33 channels come first as "My channels", a cached copy paints at once, and needsFetch() says when to ask the
// PC again. Pure: no DOM, no network, no clock of its own, so the tests can pin every rule down.
export const GUIDE_KEY = 'mmvideo.tvguide.cache';   // gm.storage: { at, groups }
export const GROUP_KEY = 'mmvideo.tvgroup';         // gm.storage: the key of the group last looked at
export const HIDDEN_KEY = 'mmvideo.hidden';         // gm.storage: ids of channels the owner turned off (0.8.11)
export const FAV_KEY = 'mmvideo.favs';             // gm.storage: [{ id, name }] the owner starred (0.8.12)
export const FRESH_MS = 10 * 60 * 1000;             // ask the PC again after this
export const FILLING_MS = 2 * 60 * 1000;            // sooner while the PC is still naming Tubi channels

export const groupKey = (g) => `${g.src || ''}:${g.name || ''}`;

/** The phone's own list as the first group (works with no PC at all). */
export function ownGroup(channels) {
  return { name: 'My channels', src: 'phone',
    channels: channels.map((c, i) => ({ id: c.url, name: c.name, number: i + 1, now: c.note || '' })) };
}

/** Trim the PC's guide to what the phone keeps: groups with channels that have an id and a name. */
export function trimGuide(guide) {
  const groups = [];
  for (const g of guide?.groups || []) {
    if (!Array.isArray(g.channels)) continue;
    const channels = g.channels.filter((c) => c && c.id && c.name)
      .map((c) => ({ id: String(c.id), name: String(c.name), number: c.number ?? undefined, now: String(c.now || '') }));
    if (channels.length) groups.push({ name: String(g.name || '?'), src: String(g.src || ''), channels });
  }
  return { groups, pending: Number(guide?.tubi_pending) || 0, notes: Array.isArray(guide?.notes) ? guide.notes.slice(0, 4) : [] };
}

/** 0.8.20: the copy of the guide the phone keeps for next time. The app refuses a bridge message over 128 KB
 *  (PAYLOAD_TOO_LARGE in his 11-07 phone log): with his ~1,800 IPTV channels the guide is ~240 KB, so the save
 *  failed every time. Over `max` bytes the IPTV groups are left out of the saved copy (they only tune through the PC
 *  anyway) and `at` is 0, so the next open still asks the PC at once and gets them back. Still too big: the 'now'
 *  lines go too. */
// 0.8.29: the app also refuses one storage item over 64 KB ("storage item exceeds 64 KB", his log 2026-11-08)
export const CACHE_MAX = 60000;
const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;
export function cacheCopy(cache, max = CACHE_MAX) {
  if (!cache || !Array.isArray(cache.groups) || bytes(cache) <= max) return cache;
  let out = { ...cache, at: 0, groups: cache.groups.filter((g) => g.src !== 'xc') };
  if (bytes(out) > max) out = { ...out, groups: out.groups.map((g) => ({ ...g, channels: g.channels.map((c) => ({ ...c, now: '' })) })) };
  return bytes(out) <= max ? out : null;
}

/** All groups to show: own channels, then the PC's (when the setting is on and a guide is known).
 *  0.8.11 (owner: "Some channels dont work allow me to turn them off in app"): channels whose id is in `hidden`
 *  are left out everywhere (cards, the phone remote, the glasses taps). A group emptied this way goes too,
 *  except the first, so the Live tab always has one group to show.
 *  0.8.18 IPTV (owner: "This is my iptv login can we use this? ... Go build it"): the PC's guide also carries his own
 *  IPTV subscription as groups with src 'xc' (ytcast 0.7.4; the login stays on the PC, the phone only sees
 *  "xc:<id>"); `iptv` false leaves those groups out, the Options switch. */
export function tvGroups(own, cache, on, hidden = [], iptv = true) {
  const all = [ownGroup(own)];
  if (on && cache?.groups) all.push(...(iptv ? cache.groups : cache.groups.filter((g) => g.src !== 'xc')));
  if (!hidden.length) return all;
  const set = new Set(hidden);
  const out = [];
  for (const g of all) {
    const channels = g.channels.filter((c) => !set.has(c.id));
    if (channels.length || !out.length) out.push({ ...g, channels });
  }
  return out;
}

/** The hidden list after turning a channel off (no duplicates, strings only, newest last). */
export function hideId(hidden, id) {
  const s = String(id || ''); if (!s) return hidden.slice();
  return hidden.includes(s) ? hidden.slice() : [...hidden, s];
}

/** 0.8.12 Favorites. isFav / toggleFav keep a small list of { id, name } on the phone (never mutating the old list). */
export const isFav = (favs, id) => favs.some((f) => f.id === id);
export function toggleFav(favs, ch) {
  const id = String(ch?.id || ''); if (!id) return favs.slice();
  return isFav(favs, id) ? favs.filter((f) => f.id !== id) : [...favs, { id, name: String(ch.name || id) }];
}
/** The Favorites line: each starred channel as it stands in the groups now (fresh "now" text), hidden ones left out,
 *  a channel the guide no longer lists keeps its stored name so it can still be tuned. */
export function favGroup(favs, groups, hidden = []) {
  const set = new Set(hidden);
  const live = new Map();
  for (const g of groups) for (const c of g.channels) live.set(c.id, c);
  const channels = favs.filter((f) => f.id && !set.has(f.id)).map((f) => live.get(f.id) || { id: f.id, name: f.name || f.id, number: null, now: '' });
  return { name: 'Favorites', src: 'fav', channels };
}

export function needsFetch(cache, now, on) {
  if (!on) return false;
  if (!cache || !Array.isArray(cache.groups)) return true;
  return now - (cache.at || 0) > (cache.pending > 0 ? FILLING_MS : FRESH_MS);
}

/** 0.9.4: IPTV group names carry tiny raised letters as decoration (a superscript RAW 60fps); the chip shows the plain words. */
export function cleanName(name) {
  const t = String(name || '').replace(/[\u00B2\u00B3\u00B9\u02B0-\u02FF\u1D2C-\u1D6A\u1D9B-\u1DBF\u2070-\u209F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t || String(name || '');
}
/** Chip labels: a name used by two sources (Pluto and Tubi both have "Comedy") gets its source after it. */
export function chipLabels(groups) {
  const seen = new Map();
  for (const g of groups) seen.set(g.name, (seen.get(g.name) || 0) + 1);
  const src = { pluto: 'Pluto', tubi: 'Tubi', tunarr: 'NAS', xc: 'IPTV', phone: 'phone' };
  return groups.map((g) => (seen.get(g.name) > 1 ? `${cleanName(g.name)} · ${src[g.src] || g.src}` : cleanName(g.name)));
}

/** What the player gets for a group: the channel ids are what the PC tunes (pluto:/tubi:/tunarr:/xc: or a plain link). */
export const lineOf = (group) => group.channels.map((c) => ({ kind: 'live', url: c.id, name: c.name }));

/** A TV wraps round: after the last channel comes the first. */
export const wrapIndex = (i, n) => (n ? ((i % n) + n) % n : 0);

/** The one line under the remote. */
export function liveNote({ groups, cache, on, playing, pcDown }) {
  if (playing) return `현재 방송 · ${playing.name}${playing.now ? ` — ${playing.now}` : ''}`;
  const n = groups.reduce((a, g) => a + g.channels.length, 0);
  if (!on) return `실시간 채널 ${n}개. Pluto TV, Tubi, NAS 채널을 보려면 PC 방송 편성표를 켜세요.`;
  if (pcDown && !cache) return `실시간 채널 ${n}개. PC 편성표에 연결할 수 없어 기본 채널 목록을 표시합니다.`;
  if (!cache) return `실시간 채널 ${n}개. PC 편성표를 불러오는 중…`;
  const pend = cache.pending > 0 ? ` Tubi 채널 이름 ${cache.pending}개를 불러오는 중입니다.` : '';
  return `실시간 채널 ${n}개 · 그룹 ${groups.length}개.${pend}`;
}
