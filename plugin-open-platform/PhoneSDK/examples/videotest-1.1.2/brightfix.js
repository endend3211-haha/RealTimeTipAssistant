// 0.9.8 (owner 2026-11-11: "Can we tame the bright scenes a bit more"). Settings > Bright scenes gets a third choice,
// Strong (the new default; Tame = 0.9.7 exactly, Plain = off):
// 1. A harder pull on bright scenes: it starts at an average grey of 130 (Tame: 150) and reaches 22% of full by 200
//    (Tame: 12% by 210), and the soft knee starts at 180 (Tame: 200), so a white sky or snow sits lower and keeps
//    its differences.
// 2. A flash limit: the picture's average may not rise more than FLASH.rise greys above its recent average (eased over
//    FLASH.ms). An explosion or a camera flash is held down and a scene that stays bright comes up over about a
//    second. Black stays black (the greys are scaled, not shifted). A big jump also costs a full new picture on the
//    link, so a held-down flash is also a smaller send.
// (ITU-R BT.1702 / Netflix's flash guidance: limit large brightness jumps; here only upward jumps are limited.)
export const BRIGHT_LEVELS = ['strong', 'tame', 'plain'];
export const STRONG = { brightPull: 0.22, brightFrom: 130, brightFull: 200, knee: 180 };
export const FLASH = { rise: 14, ms: 500, gapMs: 3000 };

/** The stored Bright scenes value -> a level. false = plain (0.8.8 storage), 'tame', anything else = strong. */
export function brightLevel(v) {
  if (v === false || v === 'plain') return 'plain';
  if (v === 'tame') return 'tame';
  return 'strong';
}

/** Flash limit on one toned still (0..255 greys, changed in place). state = { m, at } kept between stills (start {}).
 *  -> the scale used (1 = untouched). The eased average follows the real (unlimited) average, so a scene that stays
 *  bright is let through within about 2 * ms; a first still or a gap over gapMs is taken as it is. */
export function flashCap(out, state, now, f = FLASH) {
  const n = out.length;
  if (!n) return 1;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += out[i];
  const mean = sum / n;
  const dt = now - (state.at ?? -Infinity);
  if (state.m == null || !(dt >= 0) || dt > f.gapMs) {
    state.m = mean; state.at = now;
    return 1;
  }
  state.m += (mean - state.m) * (1 - Math.exp(-dt / f.ms));
  state.at = now;
  const cap = state.m + f.rise;
  if (mean <= cap || mean <= 0) return 1;
  const k = cap / mean;
  for (let i = 0; i < n; i += 1) out[i] = Math.round(out[i] * k);
  return k;
}
