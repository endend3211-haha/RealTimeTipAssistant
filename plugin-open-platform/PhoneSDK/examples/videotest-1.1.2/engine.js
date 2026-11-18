// 0.8.26: which engine does the work. Auto = the phone engine (Termux ytcast on this phone) when it answers,
// otherwise the PC. Phone / PC force one. Pure: the page gives it fetch, a clock and a wait.
export const PHONE_ENGINE = 'http://127.0.0.1:11500';
export const ENGINE_MODES = ['auto', 'phone', 'pc'];

export function cleanMode(m) { return ENGINE_MODES.includes(m) ? m : 'auto'; }

/** The PC address to fall back to: the typed one, unless he typed the phone engine there (0.8.25 advice). */
export function pcFallback(typed, defaultPc) {
  const t = String(typed || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(t) || /^http:\/\/(127\.0\.0\.1|localhost):11500$/.test(t)) return defaultPc;
  return t;
}

export function engineFor(mode, phoneUp, pcBase) {
  if (mode === 'phone') return PHONE_ENGINE;
  if (mode === 'pc') return pcBase;
  return phoneUp ? PHONE_ENGINE : pcBase;
}
// 0.8.46 (owner 2026-11-10: "I want it to work of the phone always unless I turn the pc side on"): his IPTV plan allows
// ONE stream. An IPTV pick (xc: / xcm: / xce:) goes to the phone engine unless Engine is PC, or "IPTV may use the PC"
// is On (the old Auto fallback). pcOk tells the PC it was asked on purpose (the PC refuses IPTV otherwise, ytcast 0.7.27).
export const isIptvId = (u) => /^(xc|xcm|xce):/.test(String(u || '').trim());
export function iptvEngine(mode, phoneUp, pcBase, backupOn = false) {
  const m = cleanMode(mode);
  if (m === 'pc') return pcBase;
  if (m === 'auto' && backupOn && !phoneUp) return pcBase;
  return PHONE_ENGINE;
}

export class EngineChooser {
  constructor({ fetchFn, now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    upMs = 10000, downMs = 4000, timeoutMs = 1500 }) {
    Object.assign(this, { fetchFn, now, wait, upMs, downMs, timeoutMs });
    this.up = false; this.info = null; this.until = -Infinity; this.probing = null;
  }

  /** Is the phone engine answering? Cached: 10 s after a yes, 4 s after a no (longer after markDown). */
  async phoneUp() {
    if (this.now() < this.until) return this.up;
    if (!this.probing) {
      this.probing = (async () => {
        let info = null;
        try {
          const ask = (async () => {
            const res = await this.fetchFn(`${PHONE_ENGINE}/health`);
            if (!res || !res.ok) return null;
            const j = await res.json();
            return j && j.ok && j.service === 'ytcast' ? j : null;
          })();
          info = await Promise.race([ask.catch(() => null), this.wait(this.timeoutMs).then(() => null)]);
        } catch { info = null; }
        this.up = !!info; this.info = info; this.until = this.now() + (info ? this.upMs : this.downMs);
        this.probing = null;
        return this.up;
      })();
    }
    return this.probing;
  }

  /**
   * The engine for one job. need = 'nas' asks for NAS videos: in Auto they go to the PC when the phone engine
   * has no NAS (its /health says nas false).
   */
  async choose(mode, pcBase, need = '') {
    const m = cleanMode(mode);
    if (m !== 'auto') return engineFor(m, false, pcBase);
    const up = await this.phoneUp();
    if (up && need && this.info && this.info[need] === false) return pcBase;
    return engineFor('auto', up, pcBase);
  }

  /** The phone engine failed a job: use the PC for holdMs before asking the phone again. */
  markDown(holdMs = 60000) { this.up = false; this.info = null; this.until = this.now() + holdMs; }

  /** Ask again next time instead of trusting the cache. */
  forget() { this.until = -Infinity; }
}
