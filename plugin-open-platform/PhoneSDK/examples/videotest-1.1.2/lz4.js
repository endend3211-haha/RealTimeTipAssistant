// Raw LZ4 *block* encoder/decoder (no frame header), written for MM Boy 0.2.0 / MM Reader 0.3.11 from the public LZ4 block
// format description (github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md). This is what the glasses' Host LZ4 extension
// (decompress_safe) and the official display.updateImageLz4 channel 7 expect. Greedy, one 4-byte hash table; small and fast
// enough for 46 KB game frames. Format rules kept: matches >= 4 B, the last 5 B are always literals, no match starts in the
// last 12 B, offsets 1..65535.
const MINMATCH = 4, LASTLITERALS = 5, MFLIMIT = 12, HASH_LOG = 13, MAX_OFFSET = 65535;

function writeLen(out, n) { while (n >= 255) { out.push(255); n -= 255; } out.push(n); }

/** Compress bytes (Uint8Array) into one raw LZ4 block (Uint8Array). Always valid; incompressible input grows by ~0.4%. */
export function lz4Compress(src) {
  const n = src.length; const out = []; const table = new Int32Array(1 << HASH_LOG).fill(-1);
  const hash = (i) => (Math.imul(src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24), 2654435761) >>> (32 - HASH_LOG));
  let anchor = 0, i = 0; const limit = n - MFLIMIT;
  const emit = (litEnd, matchLen, offset) => {
    const lit = litEnd - anchor; const ml = matchLen - MINMATCH;
    out.push(((lit >= 15 ? 15 : lit) << 4) | (matchLen ? (ml >= 15 ? 15 : ml) : 0));
    if (lit >= 15) writeLen(out, lit - 15);
    for (let k = anchor; k < litEnd; k += 1) out.push(src[k]);
    if (matchLen) { out.push(offset & 0xff, offset >> 8); if (ml >= 15) writeLen(out, ml - 15); }
  };
  while (i < limit) {
    const h = hash(i); const ref = table[h]; table[h] = i;
    if (ref >= 0 && i - ref <= MAX_OFFSET && src[ref] === src[i] && src[ref + 1] === src[i + 1] && src[ref + 2] === src[i + 2] && src[ref + 3] === src[i + 3]) {
      let len = MINMATCH; const maxLen = n - LASTLITERALS - i;
      while (len < maxLen && src[ref + len] === src[i + len]) len += 1;
      emit(i, len, i - ref); i += len; anchor = i;
      if (i - 2 >= 0 && i - 2 < limit) table[hash(i - 2)] = i - 2;
    } else i += 1;
  }
  emit(n, 0, 0); // the last literals
  return Uint8Array.from(out);
}

/** Decode one raw LZ4 block into exactly `size` bytes; throws on malformed input (used by tests and the QA tools). */
export function lz4Decompress(src, size) {
  const out = new Uint8Array(size); let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++]; let lit = token >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    if (o + lit > size || i + lit > src.length) throw new Error('lz4: literal overrun');
    out.set(src.subarray(i, i + lit), o); i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2; if (!off || off > o) throw new Error('lz4: bad offset');
    let ml = token & 15; if (ml === 15) { let b; do { b = src[i++]; ml += b; } while (b === 255); } ml += MINMATCH;
    if (o + ml > size) throw new Error('lz4: match overrun');
    for (let k = 0; k < ml; k += 1, o += 1) out[o] = out[o - off];
  }
  if (o !== size) throw new Error(`lz4: got ${o} of ${size} bytes`);
  return out;
}

export function toBase64(bytes) {
  if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  return Buffer.from(bytes).toString('base64');
}
