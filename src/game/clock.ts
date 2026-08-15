/**
 * 全局时钟：自然时间 / 人工时间 双模式。
 *
 * - natural：跟随系统真实时间；
 * - manual：以设定时刻为基准，叠加此后的真实流逝（人工时间也会前进，可被暂停语义扩展）。
 *
 * 全项目统一用 clock.now() 取代 Date.now()，使游戏内所有时间逻辑
 * （深夜消息扣心情、临期/逾期判定、每日重置等）都服从同一时钟。
 * 模式与基准持久化到 kv 表，重启后保留。
 */
import type { Store } from '../db.js';

const KV_KEY = 'clock_v1';

export type ClockMode = 'natural' | 'manual';

export interface ClockSnapshot {
  mode: ClockMode;
  /** 当前时钟时间（毫秒） */
  now: number;
  /** 五阶段：清晨/上午/下午/傍晚/深夜 */
  phase: string;
  /** 时间流逝是否已暂停 */
  paused: boolean;
}

/** 按小时划分五阶段 */
export function phaseOf(ms: number): string {
  const h = new Date(ms).getHours();
  if (h >= 5 && h < 9) return '清晨';
  if (h >= 9 && h < 12) return '上午';
  if (h >= 12 && h < 18) return '下午';
  if (h >= 18 && h < 22) return '傍晚';
  return '深夜'; // 22:00–5:00
}

export class Clock {
  private mode: ClockMode = 'natural';
  /** manual 模式下：基准时刻（人工设定值） */
  private manualBase = Date.now();
  /** manual 模式下：设定基准时对应的真实时刻 */
  private manualRealBase = Date.now();
  /** 是否暂停流逝 */
  private paused = false;
  /** 暂停那一刻冻结的时钟时间 */
  private pausedAt = 0;

  constructor(private store: Store) {
    this.load();
  }

  private load(): void {
    const raw = this.store.kvGet(KV_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as { mode?: ClockMode; manualBase?: number; manualRealBase?: number; paused?: boolean; pausedAt?: number };
      if (d.mode === 'manual' || d.mode === 'natural') this.mode = d.mode;
      if (typeof d.manualBase === 'number') this.manualBase = d.manualBase;
      if (typeof d.manualRealBase === 'number') this.manualRealBase = d.manualRealBase;
      if (typeof d.paused === 'boolean') this.paused = d.paused;
      if (typeof d.pausedAt === 'number') this.pausedAt = d.pausedAt;
    } catch {
      /* 损坏则用默认 */
    }
  }

  private persist(): void {
    this.store.kvSet(
      KV_KEY,
      JSON.stringify({ mode: this.mode, manualBase: this.manualBase, manualRealBase: this.manualRealBase, paused: this.paused, pausedAt: this.pausedAt }),
    );
  }

  /** 当前时钟时间（毫秒）。所有游戏逻辑都应以此为准。暂停时冻结在暂停那一刻。 */
  now(): number {
    if (this.paused) return this.pausedAt;
    if (this.mode === 'manual') {
      return this.manualBase + (Date.now() - this.manualRealBase);
    }
    return Date.now();
  }

  snapshot(): ClockSnapshot {
    const now = this.now();
    return { mode: this.mode, now, phase: phaseOf(now), paused: this.paused };
  }

  /** 暂停/恢复时间流逝。恢复时重新锚定基准，时间从暂停点继续走（不跳变）。 */
  setPaused(paused: boolean): ClockSnapshot {
    if (paused === this.paused) return this.snapshot();
    if (paused) {
      this.pausedAt = this.now();
      this.paused = true;
    } else {
      // 以冻结点为新的基准重新锚定
      if (this.mode === 'manual') {
        this.manualBase = this.pausedAt;
        this.manualRealBase = Date.now();
      } else {
        // 自然模式恢复后直接跟随真实时间
        this.paused = false;
        this.persist();
        return this.snapshot();
      }
      this.paused = false;
    }
    this.persist();
    return this.snapshot();
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** 切回自然时间 */
  useNatural(): ClockSnapshot {
    this.mode = 'natural';
    this.persist();
    return this.snapshot();
  }

  /** 设为人工时间（ms 为设定时刻） */
  useManual(ms: number): ClockSnapshot {
    this.mode = 'manual';
    this.manualBase = ms;
    this.manualRealBase = Date.now();
    this.persist();
    return this.snapshot();
  }
}
