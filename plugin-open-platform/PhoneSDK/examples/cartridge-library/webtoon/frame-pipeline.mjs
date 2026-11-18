// Packed GRAY_4 mirrors the exact quantized phone snapshot. Compare only with
// the last ACKed image; partial/failed frames must never become the diff base.
export function packGray4(image) {
  const bytes = new Uint8Array(image.data.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (image.data[i * 8] / 17 << 4) | image.data[i * 8 + 4] / 17;
  return bytes;
}
export function changedTiles(current, previous, width = 600, height = 350) {
  const stride = width / 2;
  let left = stride, right = -1, top = height, bottom = -1;
  if (!previous) { left = 0; right = stride - 1; top = 0; bottom = height - 1; }
  else {
    for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      if (current[at] !== previous[at]) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
  }
  if (right < left) return [];
  // Full initial tile reserves the maximum decode capacity once, avoiding
  // repeated reallocations (and old+new buffer peaks) during animation.
  const tileStride = right - left + 1, rows = Math.floor(79800 / tileStride), tiles = [];
  for (let y = top; y <= bottom; y += rows) {
    const tileHeight = Math.min(rows, bottom - y + 1), bytes = new Uint8Array(tileStride * tileHeight);
    for (let row = 0; row < tileHeight; row++) bytes.set(current.subarray((y + row) * stride + left, (y + row) * stride + right + 1), row * tileStride);
    tiles.push({ x: left * 2, y, width: tileStride * 2, height: tileHeight, stride: tileStride, decodedSize: bytes.length, bytes });
  }
  return tiles;
}
export class FrameStats {
  constructor() { this.samples = []; }
  reset() { this.samples = []; }
  record(sample) { this.samples.push(sample); if (this.samples.length > 40) this.samples.shift(); }
  summary() {
    const samples = this.samples, count = samples.length;
    if (!count) return 'Awaiting confirmed frames';
    const mean = key => samples.reduce((sum, sample) => sum + sample[key], 0) / count;
    const times = samples.map(sample => sample.totalMs).sort((a, b) => a - b);
    const span = samples.at(-1).at - samples[0].at;
    return `${count} ACK frames · ${count > 1 && span > 0 ? ((count - 1) * 1000 / span).toFixed(1) : '—'} frames/s · render ${Math.round(mean('renderMs'))} ms · encode ${Math.round(mean('encodeMs'))} ms · transfer ${Math.round(mean('transferMs'))} ms · p95 ${Math.round(times[Math.ceil(count * .95) - 1])} ms · ${(mean('bytes') / 1024).toFixed(1)} KiB/frame`;
  }
}
