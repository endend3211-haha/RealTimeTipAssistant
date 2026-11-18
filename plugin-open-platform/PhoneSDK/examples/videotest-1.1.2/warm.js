// 0.9.5 (owner 2026-11-11: "have the phone work on background, do the next channel ... so the switch is instant, at
// least for the next channel and the previous channel"; picked "Always, with switch"): while a Live channel plays, the
// page asks the engine (0.7.31 /warm) to keep the next and the one before running in the background. Only the playing
// one goes to the glasses. Pure helpers here so the tests can pin them down; plugin.js does the wiring.
export const WARM_KEY = 'mmvideo.warm';
export const WARM_EVERY_MS = 10000;   // the engine closes a warm channel nobody touched for 2 minutes

/** The live channels to keep ready: the next and the one before in the line, wrapping round like the TV taps. */
export function warmTargets(q, playing) {
  if (!q || q.from !== 'live' || !Array.isArray(q.items) || !playing || playing.kind !== 'live') return [];
  const n = q.items.length;
  if (n < 2 || q.items[q.index]?.url !== playing.url) return [];
  const out = [];
  for (const d of [1, -1]) {
    const it = q.items[(((q.index + d) % n) + n) % n];
    const u = it && it.kind === 'live' ? String(it.url || '') : '';
    if (u && u !== playing.url && !out.includes(u)) out.push(u);
  }
  return out;
}

/** The urls the engine says already give stills (ready > 0): a switch to one of these is instant. */
export function warmReady(answer) {
  const list = answer && Array.isArray(answer.warm) ? answer.warm : [];
  return list.filter((x) => x && x.url && Number(x.ready) > 0).map((x) => String(x.url));
}

/** True when a switch to src needs no snow: the engine has it running already. */
export const warmHot = (ready, src) => !!src && src.kind === 'live' && Array.isArray(ready) && ready.includes(src.url);

export const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
