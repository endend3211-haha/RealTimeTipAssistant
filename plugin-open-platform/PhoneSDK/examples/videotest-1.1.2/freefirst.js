// 0.9.9 Free first (owner 2026-11-11: "Is there a way to get the same channels I've favorited for free, so I can turn
// off IPTV while I'm using my phone? It keeps messing up my IPTV home screen").
// In the Favorites line an IPTV favorite that has a free twin on Pluto or Tubi plays the free one instead, so the
// phone does not take the IPTV stream from the home box. With "IPTV channels" off, an IPTV favorite with no twin is
// left out of the line, so nothing on the phone tunes IPTV. Free first off = the 0.9.8 line exactly.
// The twins come from matching his favorites against the 657 free channels on 2026-11-11 (same channel where one
// exists, else the closest free channel). A twin the guide does not list right now is skipped.
export const FREEFIRST_KEY = 'mmvideo.freefirst';
export const TWINS = [
  [/\bufc\b/i, ['UFC']],
  [/\bafv\b|funniest home videos/i, ["America's Funniest Home Videos"]],
  [/\bbet jams\b/i, ['BET Throwbacks', 'BET Pluto TV']],
  [/\bmsnbc\b|\bnbc news\b/i, ['NBC News NOW']],
  [/telemundo/i, ['Telemundo Noticias Florida']],
  [/\bwplg\b|local 10\b/i, ['ABC News Live', 'CBS News Miami']],
  [/music choice|hip.?hop and r&b/i, ['Vevo R&B', 'Vevo True School Hip-Hop']],
  [/love kills|forensic/i, ['Forensic Files', 'A&E Crime 360']],
  [/nat(ional)? ?geo(graphic)? wild|animal planet/i, ['Love Nature', 'PBS Nature']],
  [/\bsyfy\b/i, ['Pluto TV Sci-Fi']],
  [/\bfxx\b/i, ['Comedy Central Pluto TV']],
];

export const isIptv = (id) => String(id || '').startsWith('xc:');
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The free channel (from the non-IPTV groups) standing in for this IPTV channel name, or null. skip = ids already
 *  in the line (the next twin is tried, so Animal Planet and Nat Geo Wild get one each). */
export function freeTwin(name, groups, skip = new Set()) {
  const row = TWINS.find(([re]) => re.test(String(name || '')));
  if (!row) return null;
  const free = new Map();
  for (const g of groups || []) {
    if (g.src === 'xc' || g.src === 'fav') continue;
    for (const c of g.channels || []) if (!isIptv(c.id) && !free.has(norm(c.name))) free.set(norm(c.name), c);
  }
  for (const want of row[1]) { const c = free.get(norm(want)); if (c && !skip.has(c.id)) return c; }
  return null;
}

/** The Favorites group with Free first applied. on = the switch, iptv = the "IPTV channels" switch. A swapped channel
 *  keeps the favorite it stands for in favOf / favName (so holding it edits the real favorite). Never mutates. */
export function freeFirst(fg, groups, { on = true, iptv = true } = {}) {
  if (!on && iptv) return fg;
  const seen = new Set();
  const channels = [];
  for (const c of fg.channels) {
    if (!isIptv(c.id)) { if (!seen.has(c.id)) { seen.add(c.id); channels.push(c); } continue; }
    const t = on ? freeTwin(c.name, groups, seen) : null;
    if (t) {
      seen.add(t.id);
      channels.push({ ...t, name: `${t.name} (free)`, favOf: c.id, favName: c.name });
    } else if (iptv) { seen.add(c.id); channels.push(c); }
  }
  return { ...fg, channels };
}
