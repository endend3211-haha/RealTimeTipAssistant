// 0.9.7 (owner 2026-11-11: "Sometimes audio don't come through on switch and there shouldn't be a ready screen in
// between the switch doesn't make it feel instant"). Two fixes, one switch (Settings > "Smooth channel switch"):
// 1. A next / previous switch no longer sends CLEAR when the old channel stops, so the glasses keep the last picture
//    (no READY word) until the new channel's first still. A switch that fails still clears.
// 2. Live sound watchdog: when the live sound stream errors or stops moving for a few seconds while the pictures run,
//    the page asks the engine for the sound again and lines the pictures up with it. Pure helpers here (tests).
export const SWITCHFIX_KEY = 'mmvideo.switchfix';
export const SOUND_STALL_MS = 4000;    // live sound that has not moved for this long counts as gone
export const SOUND_START_MS = 8000;    // audio.play() that has not started by then: the pictures go on without it
export const SOUND_TRIES = 4;          // reconnects per channel, then the pictures follow the clock
export const SOUND_EVERY_MS = 1000;    // how often the watchdog looks

/** One watchdog look. prev = { at, ct } from the last look (or null), s = { now, ct, paused, err, held }.
 *  -> { next, stuck, why }. A hold (a jump being prepared) or a paused player never counts as stuck. */
export function soundCheck(prev, s, stallMs = SOUND_STALL_MS) {
  const fresh = { at: s.now, ct: s.ct };
  if (s.err) return { next: fresh, stuck: true, why: String(s.err) };
  if (!prev || s.held || s.paused || s.ct > prev.ct + 0.05 || s.ct < prev.ct) return { next: fresh, stuck: false, why: '' };
  if (s.now - prev.at >= stallMs) return { next: fresh, stuck: true, why: `no sound for ${Math.round((s.now - prev.at) / 1000)} s` };
  return { next: prev, stuck: false, why: '' };
}

/** audio.play()'s promise, but given up on after ms: -> 'ok' | 'late'; a refusal still throws. */
export function playWithin(p, ms = SOUND_START_MS, timer = (f, t) => setTimeout(f, t)) {
  if (!p || typeof p.then !== 'function') return Promise.resolve('ok');
  return new Promise((resolve, reject) => {
    let done = false;
    timer(() => { if (!done) { done = true; resolve('late'); } }, ms);
    p.then(() => { if (!done) { done = true; resolve('ok'); } }, (e) => { if (!done) { done = true; reject(e); } });
  });
}

/** Whether the old channel's stop may skip CLEAR: the switch fix is on and a next / previous switch is running. */
export const keepPicture = (on, stepping) => !!(on && stepping);
