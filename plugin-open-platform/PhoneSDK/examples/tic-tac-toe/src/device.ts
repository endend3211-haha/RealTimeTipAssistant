import { bytesToBase64, renderBoardImage } from './board-image';
import { positionName, resultText, type GameState } from './game';
import { compressLz4 } from './lz4';

interface BridgeCaller {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface PendingFrame {
  key: string;
  state: GameState;
}

const BOARD_X = 304;
const BOARD_Y = 16;
const RAW_HEADER_BYTES = 10;
const LZ4_HEADER_BYTES = 14;

export function shouldUseLz4(rawLength: number, compressedLength: number): boolean {
  return LZ4_HEADER_BYTES + compressedLength < RAW_HEADER_BYTES + rawLength;
}

export class PresentationGeneration {
  private current = 0;

  begin(): number {
    this.current += 1;
    return this.current;
  }

  invalidate(): void {
    this.current += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.current;
  }
}

export function renderDeviceText(state: GameState): string {
  if (state.result !== 'playing') {
    return [
      `【${resultText(state.result)}】`,
      '메인 버튼을 두 번 클릭하면 다시 시작합니다',
      '',
      'This game is over',
      '당신은 X, 컴퓨터는 O',
      '한 줄로 3개를 놓으면 승리',
    ].join('\n');
  }
  const lines = [
    '틱택토',
    '당신은 X, 컴퓨터는 O, 먼저 시작합니다',
    '목표: 어느 방향으로든 3개 연결',
    '위 / 아래 보기: 위 / 아래 이동',
    '고개를 왼쪽 / 오른쪽으로 돌리기: 왼쪽 / 오른쪽 이동',
    '한 번 클릭: 표시 놓기',
    '두 번 클릭: 다시 시작',
    '빛나는 테두리가 선택된 칸을 표시',
    `상태: [${resultText(state.result)}]`,
  ];
  lines.push(`선택됨: ${positionName(state.cursor)}`);
  return lines.join('\n');
}

export class DevicePresenter {
  private activeKey: string | null = null;
  private pending: PendingFrame | null = null;
  private lastDeliveredKey: string | null = null;
  private drainPromise: Promise<void> | null = null;

  constructor(private readonly bridge: BridgeCaller) {}

  present(state: GameState): Promise<void> {
    const key = stateKey(state);
    if (key === this.activeKey) {
      // A/B/A: the newest request is already in flight, so stale B is removed.
      this.pending = null;
      return this.drainPromise ?? Promise.resolve();
    }
    if (this.activeKey === null && key === this.lastDeliveredKey) {
      this.pending = null;
      return this.drainPromise ?? Promise.resolve();
    }
    if (this.pending?.key !== key) this.pending = { key, state };
    if (this.drainPromise) return this.drainPromise;

    const running = this.drain();
    const tracked = running.finally(() => {
      if (this.drainPromise === tracked) this.drainPromise = null;
    });
    this.drainPromise = tracked;
    tracked.catch(() => undefined);
    return tracked;
  }

  closeBestEffort(): void {
    void this.bridge.call('display.closePage').catch(() => undefined);
  }

  private async drain(): Promise<void> {
    let lastError: unknown = null;
    while (this.pending) {
      const frame = this.pending;
      this.pending = null;
      this.activeKey = frame.key;
      try {
        await this.sendFrame(frame.state);
        this.lastDeliveredKey = frame.key;
        lastError = null;
      } catch (error) {
        // Text may already be visible when the image fails, so no previously
        // delivered key can still be treated as a complete frame.
        this.lastDeliveredKey = null;
        lastError = error;
      } finally {
        this.activeKey = null;
      }
    }
    if (lastError) throw lastError;
  }

  private async sendFrame(state: GameState): Promise<void> {
    const board = renderBoardImage(state);
    const compressed = compressLz4(board.pixels);
    await this.callStage('rules panel', 'display.updateText', {
      id: 1,
      x: 10,
      y: 10,
      width: 278,
      height: 268,
      border: 1,
      radius: 12,
      text: renderDeviceText(state),
    });

    const common = {
      x: BOARD_X,
      y: BOARD_Y,
      width: board.width,
      height: board.height,
      stride: board.stride,
    };
    if (shouldUseLz4(board.pixels.length, compressed.length)) {
      await this.callStage('board transfer', 'display.updateImageLz4', {
        ...common,
        decodedSize: board.pixels.length,
        dataBase64: bytesToBase64(compressed),
      });
      return;
    }
    await this.callStage('board transfer', 'display.updateImage', {
      ...common,
      dataBase64: bytesToBase64(board.pixels),
    });
  }

  private async callStage(
    stage: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.bridge.call(method, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${stage} failed: ${message}`);
    }
  }
}

function stateKey(state: GameState): string {
  return `${state.board.map((cell) => cell ?? '-').join('')}:${state.cursor}:${state.result}`;
}

