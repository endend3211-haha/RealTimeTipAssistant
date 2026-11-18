// 600x50 7-Tile LZ4 Differential Display Driver for MemoMind 4-bit GRAY_4 OLED
import { compressLz4, toBase64 } from './lz4.mjs';

const W = 600;
const H = 350;
const TILE_H = 50;
const NUM_TILES = 7;
const TILE_RAW_BYTES = (W * TILE_H) / 2; // 15,000 bytes

export class DirtyRenderer {
  constructor(gm) {
    this.gm = gm;
    this.lastTiles = new Array(NUM_TILES).fill(null);
    this.frameId = 1;
    this.created = false;
    this.atomicFrameSupported = true;
    this.isRendering = false;
    this.pendingCtx = null;
    this.lastErrorLogTime = 0;
  }

  reset() {
    this.lastTiles.fill(null);
    this.created = false;
    this.pendingCtx = null;
  }

  // Convert 600x350 RGBA Canvas into 7 strips of 15,000 bytes GRAY_4
  extractTiles(ctx) {
    const imgData = ctx.getImageData(0, 0, W, H);
    const pixels = imgData.data;
    const tiles = [];

    for (let t = 0; t < NUM_TILES; t++) {
      const raw = new Uint8Array(TILE_RAW_BYTES);
      const rowOffset = t * TILE_H * W;
      for (let i = 0; i < TILE_RAW_BYTES; i++) {
        const p1 = (rowOffset + i * 2) * 4;
        const p2 = p1 + 4;
        // Grayscale luminance: R*0.299 + G*0.587 + B*0.114 (approx /17 -> 0~15)
        const l1 = Math.min(15, Math.round((pixels[p1] * 0.299 + pixels[p1 + 1] * 0.587 + pixels[p1 + 2] * 0.114) / 17));
        const l2 = Math.min(15, Math.round((pixels[p2] * 0.299 + pixels[p2 + 1] * 0.587 + pixels[p2 + 2] * 0.114) / 17));
        raw[i] = (l1 << 4) | l2;
      }
      tiles.push(raw);
    }
    return tiles;
  }

  // Send only modified tiles over Bluetooth LZ4 with Mutex Protection & Frame Queue
  async render(ctx) {
    if (this.isRendering) {
      this.pendingCtx = ctx;
      return { skipped: false, reason: 'queued' };
    }
    this.isRendering = true;

    try {
      if (!this.created) {
        if (this.gm?.display?.createPage) {
          await this.gm.display.createPage();
        }
        this.created = true;
        this.lastTiles.fill(null);
      }

      const tiles = this.extractTiles(ctx);
      const dirty = [];

      for (let i = 0; i < NUM_TILES; i++) {
        const raw = tiles[i];
        const last = this.lastTiles[i];
        let isChanged = false;
        if (!last) {
          isChanged = true;
        } else {
          for (let j = 0; j < TILE_RAW_BYTES; j++) {
            if (raw[j] !== last[j]) {
              isChanged = true;
              break;
            }
          }
        }
        if (isChanged) {
          dirty.push({ index: i, raw });
        }
      }

      if (dirty.length === 0) return { skipped: true, dirtyCount: 0 };

      const errors = [];
      const currentFrame = ++this.frameId;

      // Path A: Tiled Atomic Frame (Host begins frame and presents after final tile)
      if (this.atomicFrameSupported && this.gm?.display?.beginFrame && this.gm?.display?.updateFrameImageLz4) {
        try {
          await this.gm.display.beginFrame({ frameId: currentFrame, tileCount: dirty.length });
          for (let k = 0; k < dirty.length; k++) {
            const { index, raw } = dirty[k];
            const compressed = compressLz4(raw);
            await this.gm.display.updateFrameImageLz4({
              frameId: currentFrame,
              tileIndex: k,
              x: 0,
              y: index * TILE_H,
              width: W,
              height: TILE_H,
              stride: W / 2,
              decodedSize: raw.length,
              dataBase64: toBase64(compressed),
            });
          }
          this.lastTiles = tiles;
          return { presented: true, dirtyCount: dirty.length, atomic: true };
        } catch (e) {
          errors.push(e?.message || String(e));
        }
      }

      // Path B: Per-tile updateImageLz4 fallback (firmware without atomic beginFrame support)
      if (this.gm?.display?.updateImageLz4) {
        try {
          for (const { index, raw } of dirty) {
            const compressed = compressLz4(raw);
            await this.gm.display.updateImageLz4({
              x: 0,
              y: index * TILE_H,
              width: W,
              height: TILE_H,
              stride: W / 2,
              decodedSize: raw.length,
              dataBase64: toBase64(compressed),
            });
          }
          this.lastTiles = tiles;
          return { presented: true, dirtyCount: dirty.length, atomic: false };
        } catch (e2) {
          errors.push(e2?.message || String(e2));
        }
      }

      // Path C: Raw RGBA updateImage last resort
      if (this.gm?.display?.updateImage) {
        try {
          for (const { index, raw } of dirty) {
            const y = index * TILE_H;

            await this.gm.display.updateImage({
              x: 0, y, width: W, height: TILE_H, stride: W / 2,
              dataBase64: toBase64(raw),
            });
          }
          this.lastTiles = tiles;
          return { presented: true, dirtyCount: dirty.length, atomic: false };
        } catch (e3) {
          errors.push(e3?.message || String(e3));
        }
      }

      return { presented: false, error: errors.join(' / ') || 'No display channel available' };
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorLogTime > 5000) {
        console.warn('[DirtyRenderer] notice:', err?.message || err);
        this.lastErrorLogTime = now;
      }
      this.created = false;
      return { presented: false, error: err };
    } finally {
      this.isRendering = false;
      if (this.pendingCtx) {
        const next = this.pendingCtx;
        this.pendingCtx = null;
        this.render(next).catch(() => {});
      }
    }
  }
}

