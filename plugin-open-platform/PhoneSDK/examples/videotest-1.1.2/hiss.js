// 0.8.6: old-TV static, very quiet, while the snow is on the glasses (owner: "a subtle snow noise too but very
// lightly"). Pure: the audio context comes from outside, so the tests use a fake one. One context is kept for the
// whole session: it is made inside the first tap, so a later start without a tap (autoplay) is still allowed.
export const HISS_GAIN = 0.02;      // of full scale: under speech, a faint hiss
export const HISS_IN_S = 0.25;      // fade in
export const HISS_OUT_S = 0.08;     // fade out: gone before the video sound starts

export class Hiss {
  constructor({ makeContext, gain = HISS_GAIN, random = Math.random } = {}) {
    this.makeContext = makeContext; this.gain = gain; this.random = random;
    this.ctx = null; this.buffer = null; this.node = null; this.amp = null;
  }

  get on() { return this.node !== null; }

  // true = the hiss is on (or already was). false = this phone gives no sound here; nothing is thrown.
  start() {
    if (this.node) return true;
    try {
      if (!this.ctx) this.ctx = this.makeContext ? this.makeContext() : null;
      const ctx = this.ctx;
      if (!ctx) return false;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
      if (!this.buffer) {
        const n = Math.floor(ctx.sampleRate * 2);
        this.buffer = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = this.buffer.getChannelData(0);
        for (let i = 0; i < n; i += 1) d[i] = this.random() * 2 - 1;
      }
      const node = ctx.createBufferSource();
      const amp = ctx.createGain();
      node.buffer = this.buffer; node.loop = true;
      amp.gain.setValueAtTime(0, ctx.currentTime);
      amp.gain.linearRampToValueAtTime(this.gain, ctx.currentTime + HISS_IN_S);
      node.connect(amp); amp.connect(ctx.destination);
      node.start();
      this.node = node; this.amp = amp;
      return true;
    } catch { this.node = null; this.amp = null; return false; }
  }

  stop() {
    const { node, amp, ctx } = this;
    if (!node) return;
    this.node = null; this.amp = null;
    try {
      const t = ctx.currentTime;
      amp.gain.cancelScheduledValues(t);
      amp.gain.setValueAtTime(amp.gain.value, t);
      amp.gain.linearRampToValueAtTime(0, t + HISS_OUT_S);
      node.stop(t + HISS_OUT_S + 0.02);
    } catch { try { node.stop(); } catch { /* already stopped */ } }
  }
}
