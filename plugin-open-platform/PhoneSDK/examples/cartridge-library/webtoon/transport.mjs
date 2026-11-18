import { changedTiles } from './frame-pipeline.mjs';
import { compressLz4 } from './lz4.mjs';
const base64 = bytes => { let result = ''; for (const byte of bytes) result += String.fromCharCode(byte); return btoa(result); };
export class HudSender {
  constructor(gm, onAck = () => {}) { this.gm = gm; this.onAck = onAck; this.frameId = 0; this.ready = false; this.active = true; this.closed = false; }
  reset() { this.previous = undefined; this.page = false; }
  offer(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 105000) return Promise.reject(new Error('화면 데이터 크기가 올바르지 않습니다.'));
    if (!this.ready || !this.active || this.closed) return Promise.reject(new Error('안경 연결과 실행 상태를 확인해 주세요.'));
    return new Promise((resolve, reject) => {
      this.pending?.reject(new Error('새 화면으로 대체되었습니다.'));
      this.pending = { bytes: bytes.slice(), resolve, reject };
      void this.flush();
    });
  }
  async flush() {
    if (this.busy || !this.pending || !this.active || this.closed) return;
    this.busy = true; const job = this.pending; this.pending = undefined;
    const epoch = this.epoch ?? 0, started = performance.now();
    try {
      if (!this.page) { await this.gm.display.createPage(); this.page = true; }
      const changes = changedTiles(job.bytes, this.previous);
      let compressedBytes = 0;
      if (changes.length) {
        this.frameId = this.frameId >= 0xffffffff ? 1 : this.frameId + 1;
        const frameId = this.frameId;
        await this.gm.display.beginFrame({ frameId, tileCount: changes.length });
        for (let tileIndex = 0; tileIndex < changes.length; tileIndex++) {
          if (epoch !== (this.epoch ?? 0) || !this.active || this.closed) throw new Error('화면 전송이 중단되었습니다.');
          const { bytes, ...geometry } = changes[tileIndex], compressed = compressLz4(bytes); compressedBytes += compressed.length;
          await this.gm.display.updateFrameImageLz4({ frameId, tileIndex, ...geometry, dataBase64: base64(compressed) });
        }
      }
      if (epoch !== (this.epoch ?? 0) || !this.active || this.closed) throw new Error('연결이 변경되었습니다.');
      this.previous = job.bytes;
      const receipt = { frameId: this.frameId, milliseconds: Math.round(performance.now() - started), bytes: compressedBytes, tiles: changes.length };
      this.onAck(job.bytes, receipt); job.resolve(receipt);
    } catch (error) { this.reset(); job.reject(error); }
    finally { this.busy = false; if (this.pending && this.active && !this.closed) void this.flush(); }
  }
  suspend() { this.active = false; this.epoch = (this.epoch ?? 0) + 1; this.pending?.reject(new Error('실행이 일시 중지되었습니다.')); this.pending = undefined; this.reset(); }
  close() { this.closed = true; this.suspend(); }
}
