/**
 * 游戏逻辑层：四属性轴（能量/心情/专注/金币等级）的状态维护与结算。
 * 所有数值来自 config/numbers.json（设计文档第 6 章）。
 *
 * 原则体现：
 * - 原则一：倦怠档只锁自动化功能（由 executor 检查），真实操作永不阻塞；
 * - 原则二：钉钉侧直接完成的待办同样给奖励（onTodoDelta done）；
 * - 原则三：负反馈只做持续小幅压力，正反馈可立刻逆转。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Store } from '../db.js';
import type { ActionEvent, GameEvent, MoodTierName, StateSnapshot, TodoDelta, TodoItem } from '../shared/types.js';

export interface TierDef {
  name: MoodTierName;
  min: number;
  energyFactor: number;
}

export interface Numbers {
  initial: { energy: number; mood: number; focus: number; coins: number; level: number; xp: number };
  energy: {
    capByLevel: { minLevel: number; cap: number }[];
    cost: { message: number; todoByPriority: Record<string, number>; approval: number; docDraft: number };
    regen: {
      activePerMin: number;
      idlePerMin: number;
      idleAfterMin: number;
      busyProtectionCompletedThreshold: number;
      busyProtectionMultiplier: number;
    };
    focusMaxDiscount: number;
  };
  mood: {
    tiers: TierDef[];
    todoCompleteByPriority: Record<string, number>;
    overdueRebound: number;
    allClear: number;
    /** 待办出现时一次性扣心情：阈值内每条扣量 */
    newTodoMoodCost: number;
    /** 超过该未完成数量后，每条新待办按 newTodoMoodCostOver 扣 */
    newTodoMoodCostOverThreshold: number;
    /** 超额时每条新待办的扣量 */
    newTodoMoodCostOver: number;
    nearDuePerMin: number;
    nearDueCapPerMin: number;
    overduePerMin: number;
    overdueCapPerMin: number;
    lowEnergyThreshold: number;
    lowEnergyPerMin: number;
    autoRegenPerMin: number;
    idleDecayAfterMin: number;
    idleDecayPerHour: number;
    idleDecayFloor: number;
    lateNight: { startHour: number; endHour: number; perEvent: number; maxPerHour: number };
    atPressure: { groupMsgWindowMin: number; groupMsgThreshold: number; perEvent: number; cooldownMin: number };
    focusInterrupt: number;
  };
  coins: {
    todoCompleteByPriority: Record<string, number>;
    todoCompleteDailyCap: number;
    atResponse: number;
    atResponseWindowMin: number;
    atResponseDailyCap: number;
    messageReply: number;
    messageReplyDailyCap: number;
    approval: number;
    approvalDailyCap: number;
    dailyStart: number;
    allClear: number;
  };
  xp: { todoComplete: number; levelBase: number };
  focus: { convergePerMin: number; batchBonus: number; batchWindowMin: number; batchMinActions: number };
}

export function loadNumbers(rootDir: string): Numbers {
  return JSON.parse(readFileSync(resolve(rootDir, 'config/numbers.json'), 'utf8')) as Numbers;
}

/** 持久化的状态形状 */
interface PersistShape {
  energy: number;
  mood: number;
  focus: number;
  coins: number;
  xp: number;
  level: number;
  date: string;
  completedToday: number;
  /** 每日收入上限记账：来源 → 当日已得 */
  dailyEarn: Record<string, number>;
  dailyStartAwarded: boolean;
  allClearAwarded: boolean;
}

const KV_KEY = 'game_state_v1';
const round1 = (v: number) => Math.round(v * 10) / 10;

export class GameState {
  private p: PersistShape;
  /** 玩家最近一次主动操作（决定能量恢复速率） */
  private lastActionTs = Date.now();
  /** 最近一次任意互动（钉钉事件或玩家操作，决定发呆衰减） */
  private lastInteractionTs = Date.now();
  private recentActions: number[] = [];
  private groupMsgTimes = new Map<string, number[]>();
  private lastAtByConv = new Map<string, number>();
  private atPressureCooldown = new Map<string, number>();
  private lateNightTimes: number[] = [];
  /** 暂停属性自然变动（tick 不再改能量/心情/专注）；手动调整不受影响 */
  private naturalPaused = false;

  onNotice?: (text: string) => void;
  onStateChange?: () => void;

  constructor(
    private numbers: Numbers,
    private store: Store,
    /** 语义时间源（人工/自然时钟）：仅用于"看小时/看日期"（深夜时段、每日重置）。速率类逻辑仍用真实 Date.now() */
    private semanticNow: () => number = Date.now,
  ) {
    this.p = this.load();
    this.checkDailyReset();
  }

  private defaults(): PersistShape {
    const i = this.numbers.initial;
    return {
      energy: i.energy,
      mood: i.mood,
      focus: i.focus,
      coins: i.coins,
      xp: i.xp,
      level: i.level,
      date: this.todayStr(this.semanticNow()),
      completedToday: 0,
      dailyEarn: {},
      dailyStartAwarded: false,
      allClearAwarded: false,
    };
  }

  private load(): PersistShape {
    const saved = this.store.kvGet(KV_KEY);
    if (!saved) return this.defaults();
    try {
      return { ...this.defaults(), ...(JSON.parse(saved) as Partial<PersistShape>) };
    } catch {
      return this.defaults();
    }
  }

  private persist(): void {
    this.store.kvSet(KV_KEY, JSON.stringify(this.p));
  }

  private changed(): void {
    this.persist();
    this.onStateChange?.();
  }

  private notice(text: string): void {
    this.onNotice?.(text);
  }

  private todayStr(now: number): string {
    const d = new Date(now);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private checkDailyReset(): void {
    // 每日重置跟随语义时钟（人工时间也可触发"新的一天"）
    const today = this.todayStr(this.semanticNow());
    if (this.p.date === today) return;
    this.p.date = today;
    this.p.completedToday = 0;
    this.p.dailyEarn = {};
    this.p.dailyStartAwarded = false;
    this.p.allClearAwarded = false;
    this.persist();
    this.notice('新的一天，每日计数已重置');
  }

  moodTierName(): MoodTierName {
    return this.moodTier().name;
  }

  private moodTier(): TierDef {
    const sorted = [...this.numbers.mood.tiers].sort((a, b) => b.min - a.min);
    for (const t of sorted) if (this.p.mood >= t.min) return t;
    return sorted[sorted.length - 1];
  }

  energyCap(): number {
    const sorted = [...this.numbers.energy.capByLevel].sort((a, b) => b.minLevel - a.minLevel);
    for (const c of sorted) if (this.p.level >= c.minLevel) return c.cap;
    return sorted[sorted.length - 1]?.cap ?? 100;
  }

  private clampMood(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  /** 实际能量消耗 = 基础 × 心情系数 × 专注折扣 */
  private energyCost(base: number): number {
    const focusDiscount = 1 - (this.p.focus / 100) * this.numbers.energy.focusMaxDiscount;
    return round1(Math.max(0, base * this.moodTier().energyFactor * focusDiscount));
  }

  /** 按每日上限记账后入账，返回实际所得 */
  private addCoins(source: string, amount: number, cap?: number): number {
    if (cap != null) {
      const earned = this.p.dailyEarn[source] ?? 0;
      const allowed = Math.max(0, Math.min(amount, cap - earned));
      this.p.dailyEarn[source] = earned + allowed;
      this.p.coins += allowed;
      return allowed;
    }
    this.p.coins += amount;
    return amount;
  }

  private addXp(n: number): void {
    this.p.xp += n;
    const base = this.numbers.xp.levelBase;
    while (this.p.xp >= this.p.level * base) {
      this.p.xp -= this.p.level * base;
      this.p.level += 1;
      this.notice(`升级！当前 Lv${this.p.level}（能量上限 ${this.energyCap()}）`);
    }
  }

  /* ---------- 操作通道入口：玩家做了事 ---------- */

  applyAction(ev: ActionEvent, now = Date.now()): string[] {
    this.checkDailyReset();
    const notes: string[] = [];
    this.lastActionTs = now;
    this.lastInteractionTs = now;
    this.trackBatch(now);

    if (!this.p.dailyStartAwarded && this.numbers.coins.dailyStart > 0) {
      this.p.dailyStartAwarded = true;
      this.p.coins += this.numbers.coins.dailyStart;
      notes.push(`每日开工 +${this.numbers.coins.dailyStart} 金币`);
    }

    switch (ev.kind) {
      case 'message_sent': {
        const cost = this.energyCost(this.numbers.energy.cost.message);
        this.p.energy = Math.max(0, this.p.energy - cost);
        notes.push(`能量 -${cost}`);
        const gained = this.addCoins('messageReply', this.numbers.coins.messageReply, this.numbers.coins.messageReplyDailyCap);
        if (gained > 0) notes.push(`金币 +${gained}`);
        if (ev.scope === 'group' && ev.conversationId) {
          const at = this.lastAtByConv.get(ev.conversationId);
          if (at && now - at <= this.numbers.coins.atResponseWindowMin * 60_000) {
            const g = this.addCoins('atResponse', this.numbers.coins.atResponse, this.numbers.coins.atResponseDailyCap);
            if (g > 0) notes.push(`@响应奖励 金币 +${g}`);
            this.lastAtByConv.delete(ev.conversationId);
          }
        }
        break;
      }
      case 'todo_completed': {
        const pr = String(ev.priority);
        const baseCost = this.numbers.energy.cost.todoByPriority[pr] ?? 12;
        const cost = this.energyCost(baseCost);
        this.p.energy = Math.max(0, this.p.energy - cost);
        const coinGain = this.addCoins('todoComplete', this.numbers.coins.todoCompleteByPriority[pr] ?? 15, this.numbers.coins.todoCompleteDailyCap);
        const moodGain = (this.numbers.mood.todoCompleteByPriority[pr] ?? 6) + (ev.wasOverdue ? this.numbers.mood.overdueRebound : 0);
        this.p.mood = this.clampMood(this.p.mood + moodGain);
        this.p.completedToday += 1;
        this.addXp(this.numbers.xp.todoComplete);
        notes.push(`能量 -${cost}，金币 +${coinGain}，心情 +${moodGain}，XP +${this.numbers.xp.todoComplete}`);
        break;
      }
      case 'todo_created':
      case 'approval_done':
        break;
    }
    this.changed();
    return notes;
  }

  private trackBatch(now: number): void {
    const f = this.numbers.focus;
    this.recentActions = this.recentActions.filter((t) => now - t <= f.batchWindowMin * 60_000);
    this.recentActions.push(now);
    if (this.recentActions.length >= f.batchMinActions) {
      this.p.focus = Math.min(100, this.p.focus + f.batchBonus);
      this.recentActions = [];
      this.notice(`连续处理 ×${f.batchMinActions}，专注 +${f.batchBonus}`);
    }
  }

  /* ---------- 展示通道入口：钉钉事件只影响数值，绝不触发操作 ---------- */

  onImEvent(ev: GameEvent, now = Date.now()): string[] {
    this.checkDailyReset();
    const notes: string[] = [];
    this.lastInteractionTs = now;
    const m = this.numbers.mood;

    if (ev.type === 'group_msg' && ev.conversationId) {
      const win = m.atPressure.groupMsgWindowMin * 60_000;
      const arr = (this.groupMsgTimes.get(ev.conversationId) ?? []).filter((t) => now - t <= win);
      arr.push(now);
      this.groupMsgTimes.set(ev.conversationId, arr);

      const h = new Date(this.semanticNow()).getHours();
      const ln = m.lateNight;
      if (h >= ln.startHour || h < ln.endHour) {
        this.lateNightTimes = this.lateNightTimes.filter((t) => now - t < 3_600_000);
        if (this.lateNightTimes.length < ln.maxPerHour) {
          this.lateNightTimes.push(now);
          this.p.mood = this.clampMood(this.p.mood + ln.perEvent);
          notes.push(`深夜群消息 心情 ${ln.perEvent}`);
        }
      }
    }

    if (ev.type === 'at_me') {
      this.p.focus = Math.max(0, this.p.focus + m.focusInterrupt);
      notes.push(`被 @ 打断 专注 ${m.focusInterrupt}`);
      if (ev.conversationId) {
        this.lastAtByConv.set(ev.conversationId, now);
        const ap = m.atPressure;
        const cnt = (this.groupMsgTimes.get(ev.conversationId) ?? []).filter((t) => now - t <= ap.groupMsgWindowMin * 60_000).length;
        const lastPressure = this.atPressureCooldown.get(ev.conversationId) ?? 0;
        if (cnt > ap.groupMsgThreshold && now - lastPressure > ap.cooldownMin * 60_000) {
          this.atPressureCooldown.set(ev.conversationId, now);
          this.p.mood = this.clampMood(this.p.mood + ap.perEvent);
          notes.push(`@我且消息量大 心情 ${ap.perEvent}`);
        }
      }
    }

    if (notes.length > 0) this.changed();
    return notes;
  }

  /** 钉钉侧直接完成的待办也结算奖励（原则二：忙碌不是惩罚），但不耗能量 */
  onTodoDelta(d: TodoDelta, now = Date.now()): string[] {
    this.checkDailyReset();
    this.lastInteractionTs = now;
    if (d.kind !== 'done') return [];
    const pr = String(d.item.priority);
    const coinGain = this.addCoins('todoComplete', this.numbers.coins.todoCompleteByPriority[pr] ?? 15, this.numbers.coins.todoCompleteDailyCap);
    const moodGain = this.numbers.mood.todoCompleteByPriority[pr] ?? 6;
    this.p.mood = this.clampMood(this.p.mood + moodGain);
    this.p.completedToday += 1;
    this.addXp(this.numbers.xp.todoComplete);
    this.changed();
    return [`待办外部完成 金币 +${coinGain}，心情 +${moodGain}，XP +${this.numbers.xp.todoComplete}`];
  }

  /** 待办出现时一次性扣心情：≤阈值每条 -newTodoMoodCost，超过阈值每条 -newTodoMoodCostOver（按加入后的未完成总数定档） */
  onTodoAdded(openCount: number, now = Date.now()): string[] {
    this.checkDailyReset();
    this.lastInteractionTs = now;
    const m = this.numbers.mood;
    const cost = openCount > m.newTodoMoodCostOverThreshold ? m.newTodoMoodCostOver : m.newTodoMoodCost;
    this.p.mood = this.clampMood(this.p.mood - cost);
    this.changed();
    return [`新待办出现（当前未完成 ${openCount} 条）心情 -${cost}`];
  }

  checkAllClear(todos: TodoItem[], now = Date.now()): string[] {
    this.checkDailyReset();
    if (todos.length === 0 && this.p.completedToday > 0 && !this.p.allClearAwarded) {
      this.p.allClearAwarded = true;
      this.p.coins += this.numbers.coins.allClear;
      this.p.mood = this.clampMood(this.p.mood + this.numbers.mood.allClear);
      this.changed();
      this.notice(`今日待办全清！金币 +${this.numbers.coins.allClear}，心情 +${this.numbers.mood.allClear}`);
      return ['allclear'];
    }
    return [];
  }

  /* ---------- 每分钟结算 ---------- */

  /** 暂停/恢复属性自然变动；返回当前状态 */
  setNaturalPaused(paused: boolean): boolean {
    this.naturalPaused = paused;
    return this.naturalPaused;
  }

  isNaturalPaused(): boolean {
    return this.naturalPaused;
  }

  tick(now: number, todos: TodoItem[]): void {
    this.checkDailyReset();
    if (this.naturalPaused) return; // 暂停自然变动：能量/心情/专注不随时间变化（手动调整仍生效）
    const prevTier = this.moodTier().name;
    const rg = this.numbers.energy.regen;

    // 能量自动恢复：空闲 > 活跃；忙碌保护
    const idleMin = (now - this.lastActionTs) / 60_000;
    let rate = idleMin >= rg.idleAfterMin ? rg.idlePerMin : rg.activePerMin;
    if (this.p.completedToday >= rg.busyProtectionCompletedThreshold) rate *= rg.busyProtectionMultiplier;
    this.p.energy += rate;
    this.p.energy = Math.min(this.energyCap(), this.p.energy);

    // 心情持续压力：临期/逾期/低能量（负反馈只做提示）
    const m = this.numbers.mood;
    let nearDue = 0;
    let overdue = 0;
    for (const t of todos) {
      if (!t.dueTime) continue;
      if (t.dueTime < now) overdue += 1;
      else if (t.dueTime - now < 24 * 3_600_000) nearDue += 1;
    }
    const pressure =
      Math.min(nearDue * m.nearDuePerMin, m.nearDueCapPerMin) +
      Math.min(overdue * m.overduePerMin, m.overdueCapPerMin) +
      (this.p.energy < m.lowEnergyThreshold ? m.lowEnergyPerMin : 0);
    this.p.mood = this.clampMood(this.p.mood - pressure + m.autoRegenPerMin);

    // 长时间无互动缓慢下降（不穿透平静档下限）
    if ((now - this.lastInteractionTs) / 60_000 >= m.idleDecayAfterMin && this.p.mood > m.idleDecayFloor) {
      this.p.mood = Math.max(m.idleDecayFloor, this.p.mood - m.idleDecayPerHour / 60);
    }

    // 专注向心情收敛
    this.p.focus += (this.p.mood - this.p.focus) * this.numbers.focus.convergePerMin;
    this.p.focus = Math.max(0, Math.min(100, this.p.focus));

    this.changed();
    const tier = this.moodTier().name;
    if (tier !== prevTier) this.notice(`心情档位变化：${prevTier} → ${tier}`);
  }

  /** 调试：直接增减单条属性（能量/心情/专注/金币），带边界钳制 */
  adjustStat(stat: 'energy' | 'mood' | 'focus' | 'coins', delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return;
    switch (stat) {
      case 'energy':
        this.p.energy = Math.max(0, Math.min(this.energyCap(), this.p.energy + delta));
        break;
      case 'mood':
        this.p.mood = this.clampMood(this.p.mood + delta);
        break;
      case 'focus':
        this.p.focus = Math.max(0, Math.min(100, this.p.focus + delta));
        break;
      case 'coins':
        this.p.coins = Math.max(0, this.p.coins + delta);
        break;
    }
    this.changed();
  }

  /** 直接把属性设为指定值（调试页用），按各自上下限夹取 */
  setStat(stat: 'energy' | 'mood' | 'focus' | 'coins', value: number): void {
    if (!Number.isFinite(value)) return;
    switch (stat) {
      case 'energy':
        this.p.energy = Math.max(0, Math.min(this.energyCap(), value));
        break;
      case 'mood':
        this.p.mood = this.clampMood(value);
        break;
      case 'focus':
        this.p.focus = Math.max(0, Math.min(100, value));
        break;
      case 'coins':
        this.p.coins = Math.max(0, Math.round(value));
        break;
    }
    this.changed();
  }

  snapshot(): StateSnapshot {
    return {
      energy: round1(this.p.energy),
      energyCap: this.energyCap(),
      mood: round1(this.p.mood),
      moodTier: this.moodTier().name,
      focus: round1(this.p.focus),
      coins: this.p.coins,
      xp: this.p.xp,
      level: this.p.level,
      completedToday: this.p.completedToday,
      date: this.p.date,
    };
  }
}
