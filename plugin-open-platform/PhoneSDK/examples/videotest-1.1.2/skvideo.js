// ScouterKit VIDEO records (enc 3) for MM Video Test.
// The encoder is a JavaScript port of VideoEncoder in src/g1/scouter_kit_g1.cpp of github.com/mafik/scouter_kit
// (MIT License, Copyright (c) 2026 the ScouterKit authors; licence at the end of this file and in ../NOTICE.md). It must stay byte-identical to the C++ one: the
// glasses decode it with the ported vm_video_decode in glass/videotest.c (test/sk.test.mjs checks both).
//
// One record = one 1-bit picture: flags:u8 (bit0 = start again) + range-coder bytes. Each record is coded against
// the previous picture of the same encoder, so an encoder is one stream: make a new one for a keyframe.
// SkStream codes a 16-grey picture as 1..4 bit planes (most significant first), Gray-coded or plain, and makes the
// enc 3 payload:  mode:u8 (bits 0-2 planes, bit 7 Gray) + per plane len:u16 (big-endian) + record.

const VMAX = 5;
const V_SAME = 0, V_V0 = 3, V_ISV = V_V0 + 7 * 7 * 6, V_SIGN = V_ISV + 7 * 2 * 6, V_MAG = V_SIGN + 7 * 6,
  V_PASS = V_MAG + (VMAX - 1) * 7 * 6, V_RUNLEN = V_PASS + 7, V_RUNBIT = V_RUNLEN + 2 * 20,
  V_PROBS = V_RUNBIT + 2 * 20 * 4;
export const SK_PROBS = V_PROBS; // 798
const TWO32 = 4294967296, TWO24 = 16777216;

class RangeEncoder {
  constructor(p) { this.p = p; this.out = []; this.low = 0; this.range = 0xFFFFFFFF; this.cache = 0; this.pending = 0; this.first = true; }
  put(b) { if (this.first) this.first = false; else this.out.push(b & 0xFF); }
  shiftLow() {
    const lo32 = this.low % TWO32, hi = Math.floor(this.low / TWO32);
    if (lo32 < 0xFF000000 || hi) {
      this.put(this.cache + hi);
      for (; this.pending; this.pending -= 1) this.put(0xFF + hi);
      this.cache = Math.floor(lo32 / TWO24) & 0xFF;
    } else this.pending += 1;
    this.low = (this.low % TWO24) * 256;
  }
  bit(i, b) {
    const q = this.p[i], bound = (this.range >>> 12) * q;
    if (!b) { this.range = bound; this.p[i] = q + ((4096 - q) >> 5); }
    else { this.low += bound; this.range = (this.range - bound) >>> 0; this.p[i] = q - (q >> 5); }
    while (this.range < TWO24) { this.range = (this.range * 256) >>> 0; this.shiftLow(); }
  }
  run(colour, v) {
    const x = v + 1; let nb = 0;
    while (x >= 2 ** (nb + 1)) nb += 1;
    for (let k = 0; k <= nb && k < 20; k += 1) this.bit(V_RUNLEN + 20 * colour + Math.min(k, 19), k < nb);
    const c = V_RUNBIT + 80 * colour + 4 * Math.min(nb, 19);
    for (let i = 0; i < nb; i += 1) this.bit(c + Math.min(i, 3), Math.floor(x / 2 ** (nb - 1 - i)) & 1);
  }
  finish() {
    for (let k = 1; k <= 4; k += 1) {
      const step = 2 ** (32 - 8 * k), v = Math.ceil(this.low / step) * step;
      if (v < this.low + this.range) { this.low = v; break; }
    }
    for (let i = 0; i < 5; i += 1) this.shiftLow();
    while (this.out.length > 1 && this.out[this.out.length - 1] === 0) this.out.pop();
  }
}

function aboveClass(b1, w, code) {
  if (b1 >= w) return 6;
  if (code === 0) return 0;
  return code === 8 ? 1 : code === 9 ? 2 : code === 7 ? 3 : code > 8 ? 4 : 5;
}
const clz32 = Math.clz32;
// The previous frame's row (after 4 zero bytes) around b1: 1..5 for the leftmost transition of b1's kind at
// b1 - 2..b1 + 2, 0 for none.
function frameClass(old, b1, colour) {
  const q = b1 + 29, u = (old[q >> 3] << 8) | old[(q >> 3) + 1];
  const px = (u >> (10 - (q & 7))) & 63, cand = ((px >> 1) ^ px) & (colour ? ~px : px) & 31;
  return cand ? clz32(cand) - 26 : 0;
}
function transitions(row, off, w, t) {
  let n = 0, c = 0;
  for (let x = 0; x < w; x += 1) {
    const p = (row[off + (x >> 3)] >> (7 - (x & 7))) & 1;
    if (p !== c) { t[n++] = x; c = p; }
  }
  return n;
}

export class SkEncoder {
  constructor(w, h) {
    this.w = w; this.h = h; this.nb = (w + 7) >> 3;
    this.prev = new Uint8Array(this.nb * h);
    this.p = new Uint16Array(V_PROBS).fill(2048);
    this.started = false;
    this.ref = new Uint16Array(w + 1); this.ct = new Uint16Array(w + 1);
    this.rcode = new Uint8Array(w + 1); this.ccode = new Uint8Array(w + 1);
    this.old = new Uint8Array(this.nb + 8);
  }
  /** bits: Uint8Array w*h of 0/1 (nonzero = ink). Returns the record (Uint8Array). */
  encode(bits) {
    const { w, h, nb } = this;
    const cur = new Uint8Array(nb * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (bits[y * w + x]) cur[y * nb + (x >> 3)] |= 0x80 >> (x & 7);
    const p = this.started ? Uint16Array.from(this.p) : new Uint16Array(V_PROBS).fill(2048);
    const e = new RangeEncoder(p);
    e.out.push(this.started ? 0 : 1); e.first = true; // flags byte, then the coder (its first byte is dropped)
    const out0 = e.out;
    const { ref, ct, rcode, ccode, old } = this;
    let nref = 0, prevSame = 2;
    for (let y = 0; y < h; y += 1) {
      const po = y * nb;
      let same = true;
      for (let i = 0; i < nb; i += 1) if (this.prev[po + i] !== cur[po + i]) { same = false; break; }
      const nc = transitions(cur, po, w, ct);
      e.bit(V_SAME + prevSame, same);
      prevSame = same ? 1 : 0;
      if (same) { ref.set(ct.subarray(0, nc)); rcode.fill(0, 0, nc); nref = nc; continue; }
      old.fill(0); old.set(this.prev.subarray(po, po + nb), 4);
      let a0 = -1, colour = 0, pc = 0, j = 0, i = 0;
      for (;;) {
        while (j < nref && ref[j] <= a0) j += 1;
        const jb = j + ((j & 1) !== colour ? 1 : 0);
        const b1 = jb < nref ? ref[jb] : w, b2 = jb + 1 < nref ? ref[jb + 1] : w;
        const ac = aboveClass(b1, w, jb < nref ? rcode[jb] : 0), tc = b1 < w ? frameClass(old, b1, colour) : 0;
        const a1 = i < nc ? ct[i] : w, a2 = i + 1 < nc ? ct[i + 1] : w, d = a1 - b1;
        const v0 = V_V0 + (pc * 7 + ac) * 6 + tc, isv = V_ISV + (pc * 2 + (ac !== 0 && ac !== 6 ? 1 : 0)) * 6 + tc;
        if (b2 < a1) { // pass
          e.bit(v0, 1); e.bit(isv, 0); e.bit(V_PASS + pc, 1);
          a0 = b2; pc = 5;
          continue;
        }
        if (d >= -VMAX && d <= VMAX) { // vertical
          e.bit(v0, d !== 0);
          if (d) {
            const m = Math.abs(d);
            e.bit(isv, 1); e.bit(V_SIGN + ac * 6 + tc, d < 0);
            for (let k = 1; k < VMAX; k += 1) { e.bit(V_MAG + ((k - 1) * 7 + ac) * 6 + tc, m > k); if (m <= k) break; }
          }
          if (a1 >= w) break;
          ccode[i++] = d + 8;
          a0 = a1; colour ^= 1;
          pc = d === 0 ? 1 : d === 1 ? 2 : d === -1 ? 3 : 4;
          continue;
        }
        e.bit(v0, 1); e.bit(isv, 0); e.bit(V_PASS + pc, 0); // horizontal
        e.run(colour, a1 - Math.max(a0, 0));
        e.run(colour ^ 1, a2 - a1);
        if (a1 >= w) break;
        ccode[i++] = 0;
        if (a2 >= w) break;
        ccode[i++] = 0;
        a0 = a2; pc = 6;
      }
      ref.set(ct.subarray(0, nc)); rcode.set(ccode.subarray(0, nc)); nref = nc;
    }
    e.finish();
    this.started = true; this.p = p; this.prev = cur;
    return Uint8Array.from(out0);
  }
}

const gray = (v) => v ^ (v >> 1);

/** A 16-grey stream as bit planes. planes 1..4; gray = Gray-code the levels first (better for smooth tones). */
export class SkStream {
  constructor(w, h, { planes = 4, gray: g = true } = {}) {
    if (!(planes >= 1 && planes <= 4)) throw new Error('planes 1..4');
    this.w = w; this.h = h; this.planes = planes; this.gray = !!g;
    this.mode = planes | (this.gray ? 0x80 : 0);
    this.reset();
  }
  reset() { this.enc = Array.from({ length: this.planes }, () => new SkEncoder(this.w, this.h)); }
  /** levels: Uint8Array w*h, 0..15. Each level is cut to the plane depth: v = round(l * (2^planes-1) / 15). */
  encode(levels) {
    const { w, h, planes } = this, n = w * h, maxv = (1 << planes) - 1;
    const vals = new Uint8Array(n);
    for (let k = 0; k < n; k += 1) {
      const v = planes === 4 ? levels[k] & 15 : Math.round((levels[k] & 15) * maxv / 15);
      vals[k] = this.gray ? gray(v) : v;
    }
    const recs = []; let total = 1;
    const bits = new Uint8Array(n);
    for (let p = 0; p < planes; p += 1) {
      const sh = planes - 1 - p;
      for (let k = 0; k < n; k += 1) bits[k] = (vals[k] >> sh) & 1;
      const r = this.enc[p].encode(bits);
      if (r.length > 0xFFFF) throw new Error('plane record too big');
      recs.push(r); total += 2 + r.length;
    }
    const out = new Uint8Array(total);
    out[0] = this.mode; let at = 1;
    for (const r of recs) { out[at] = r.length >> 8; out[at + 1] = r.length & 0xFF; out.set(r, at + 2); at += 2 + r.length; }
    return out;
  }
}

/** What the glasses show for a level after the plane cut (for previews and tests). */
export function skLevel(level, planes) {
  if (planes === 4) return level & 15;
  const maxv = (1 << planes) - 1;
  return Math.floor(Math.round((level & 15) * maxv / 15) * 15 / maxv);
}

/* ScouterKit licence (for the ported encoder above):

MIT License

Copyright (c) 2026 the ScouterKit authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
