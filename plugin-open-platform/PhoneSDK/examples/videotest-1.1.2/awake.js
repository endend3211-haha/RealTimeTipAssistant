// MM Video 0.8.45 "Keep the screen on" (owner 2026-11-10, picked option 1: Desk keeps updating in the background but
// a video stops). The app throttles a hidden page and stops its sound, so the page must stay on screen while it plays.
// A screen wake lock (navigator.wakeLock, the HUD 0.31.0 / CodecCast 2.38.2 pattern) keeps the phone from locking.
// The phone drops the lock when the page is hidden, so it is asked for again when the page comes back.
// Unknown on the phone until the log shows it: whether the app's GeckoView gives the lock at all.

export function makeAwake({ nav, doc, log }) {
  let lock = null;
  let want = false;
  let on = true;
  let told = '';
  const tell = (t) => { if (t !== told) { told = t; log(t); } };

  async function take() {
    if (!want || !on || doc.hidden || (lock && !lock.released)) return;
    if (!nav?.wakeLock?.request) { tell('Keep screen on: not supported in this app (the phone may still lock)'); return; }
    try {
      const l = await nav.wakeLock.request('screen');
      if (!want || !on) { try { await l.release(); } catch { /* gone */ } return; }
      lock = l;
      l.addEventListener?.('release', () => { if (lock === l) lock = null; });
      tell('Keep screen on: on while playing');
    } catch (e) {
      lock = null;
      tell(`Keep screen on: refused (${e?.name ?? ''} ${e?.message ?? e})`.trim());
    }
  }

  async function drop() {
    const l = lock; lock = null;
    if (l) { try { await l.release(); } catch { /* gone already */ } }
  }

  return {
    playing(p) { want = !!p; return want ? take() : drop(); },
    setOn(v) { on = !!v; return on ? take() : drop(); },
    shown() { return take(); },          // call on visibilitychange: re-taken on return
    get held() { return !!(lock && !lock.released); },
  };
}
