import { log } from '../log.js';
import type { Store } from '../db.js';
import type { TodoDelta, TodoItem } from '../shared/types.js';
import { dwsJson } from './dws-exec.js';

const KV_KEY = 'todo_snapshot_v1';
const NEAR_DUE_MS = 24 * 3600 * 1000;

interface SnapshotEntry extends TodoItem {
  nearDueNotified?: boolean;
  overdueNotified?: boolean;
}

/**
 * 待办无实时事件，轮询 `dws todo task list` 快照 diff：
 * added / done（含删除）/ near_due（24h 内到期）/ overdue。
 * 首次启动且无历史快照时静默引导（不把存量待办当新增刷屏）。
 */
export class TodoPoller {
  private items = new Map<string, SnapshotEntry>();
  private timer?: NodeJS.Timeout;
  private polling = false;
  private bootstrapped = false;

  constructor(
    private dwsBin: string,
    private pageSize: number,
    private intervalSec: number,
    private store: Store,
    private onDelta: (d: TodoDelta) => void,
    private onPolled?: (size: number) => void,
  ) {}

  async start(): Promise<void> {
    const saved = this.store.kvGet(KV_KEY);
    if (saved) {
      try {
        const arr = JSON.parse(saved) as SnapshotEntry[];
        for (const it of arr) this.items.set(it.taskId, it);
        this.bootstrapped = true;
        log('todo', `已恢复快照：${this.items.size} 条未完成待办`);
      } catch {
        log('todo', '本地快照损坏，忽略并重建');
      }
    }
    await this.poll();
    this.timer = setInterval(() => {
      this.poll().catch((e) => log('todo', `轮询失败: ${String(e)}`));
    }, this.intervalSec * 1000);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const res = await dwsJson<{ result?: { todoCards?: unknown[]; hasMore?: boolean } }>(this.dwsBin, [
        'todo',
        'task',
        'list',
        '--status',
        'false',
        '--page',
        '1',
        '--size',
        String(this.pageSize),
      ]);
      const cards = (res?.result?.todoCards ?? []) as Array<Record<string, unknown>>;
      if (res?.result?.hasMore) {
        log('todo', `注意：未完成待办超过 ${this.pageSize} 条，MVP 只轮询第一页`);
      }

      const now = Date.now();
      const fresh = new Map<string, SnapshotEntry>();
      for (const c of cards) {
        const taskId = String(c.taskId ?? '');
        if (!taskId) continue;
        fresh.set(taskId, {
          taskId,
          subject: String(c.subject ?? ''),
          priority: Number(c.priority ?? 20),
          dueTime: c.dueTime ? Number(c.dueTime) : undefined,
          createdTime: c.createdTime ? Number(c.createdTime) : undefined,
        });
      }

      const deltas: TodoDelta[] = [];
      const silentBootstrap = !this.bootstrapped;

      for (const [id, it] of fresh) {
        if (!this.items.has(id) && !silentBootstrap) deltas.push({ kind: 'added', item: it });
      }
      for (const [id, it] of this.items) {
        if (!fresh.has(id)) deltas.push({ kind: 'done', item: it });
      }
      for (const [id, it] of fresh) {
        const prev = this.items.get(id);
        if (it.dueTime) {
          if (it.dueTime < now) {
            if (!prev?.overdueNotified && !silentBootstrap) deltas.push({ kind: 'overdue', item: it });
            it.overdueNotified = true;
          } else if (it.dueTime - now < NEAR_DUE_MS) {
            if (!prev?.nearDueNotified && !silentBootstrap) deltas.push({ kind: 'near_due', item: it });
            it.nearDueNotified = true;
          }
        }
        if (prev) {
          it.nearDueNotified = it.nearDueNotified ?? prev.nearDueNotified;
          it.overdueNotified = it.overdueNotified ?? prev.overdueNotified;
        }
      }

      this.items = fresh;
      this.bootstrapped = true;
      this.persist();
      for (const d of deltas) this.onDelta(d);
      this.onPolled?.(fresh.size);
      log('todo', `轮询完成：${fresh.size} 条未完成，${deltas.length} 个变化`);
    } finally {
      this.polling = false;
    }
  }

  /** 当前未完成待办（供 list_todos 工具与前端） */
  list(): TodoItem[] {
    return [...this.items.values()].map((e) => ({
      taskId: e.taskId,
      subject: e.subject,
      priority: e.priority,
      dueTime: e.dueTime,
      createdTime: e.createdTime,
    }));
  }

  /**
   * 工具侧完成待办后立即从本地快照移除，
   * 避免下一轮轮询 diff 再次报 done（真实状态以钉钉为准）。
   */
  dropLocal(taskId: string): void {
    if (this.items.delete(taskId)) this.persist();
  }

  /**
   * 工具侧创建待办后立即写入本地快照，
   * 使新待办无需等待下一轮轮询即可被 list/complete 使用。
   */
  addLocal(item: TodoItem): void {
    this.items.set(item.taskId, item);
    this.persist();
  }

  /** 查询待办的临期/逾期标记（用于逾期回补奖励判定） */
  getFlags(taskId: string): { nearDue: boolean; overdue: boolean } {
    const e = this.items.get(taskId);
    return { nearDue: Boolean(e?.nearDueNotified), overdue: Boolean(e?.overdueNotified) };
  }

  private persist(): void {
    this.store.kvSet(KV_KEY, JSON.stringify([...this.items.values()]));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
