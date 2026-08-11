import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { Store } from './db.js';
import { log } from './log.js';
import { ConsumeProc } from './bridge/consume.js';
import { normalizeImEvent } from './bridge/normalize.js';
import { TodoPoller } from './bridge/todo-poller.js';
import { dwsJson } from './bridge/dws-exec.js';
import { GameState, loadNumbers } from './game/state.js';
import { PushServer } from './push/ws-server.js';
import { startRepl } from './agent/repl.js';
import type { ToolContext } from './agent/tools.js';

/**
 * 像素办公室后端入口（P2：本地服务 + WS 推送 + 数值结算）。
 *
 * 数据流与安全边界：
 *   dws event consume / todo 轮询 → 归一化事件 → 日志 + SQLite + 数值结算 + WS 广播（展示通道）
 *   玩家 REPL / WS 输入 → 共享执行器（确认驱动）→ dws 写回 → 成功结果进结算（操作通道）
 * 两条通道物理隔离：事件内容永远不会触发工具调用（防提示词注入）。
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const store = new Store(resolve(cfg.rootDir, 'data/pixel-office.sqlite'));

  // 自身 userId（create_todo 需要）
  let selfUserId = '';
  try {
    const auth = await dwsJson<{ user_id?: string; authenticated?: boolean }>(cfg.dwsBin, ['auth', 'status']);
    if (!auth?.authenticated) {
      log('main', '⚠️ dws 未登录，请先在终端执行 dws auth login');
    }
    selfUserId = auth?.user_id ?? '';
  } catch (e) {
    log('main', `dws auth status 失败: ${String(e)}`);
  }
  log('main', `dws 登录态 OK，当前用户 userId=${selfUserId || '(未获取)'}`);

  // ---------- 游戏逻辑层 ----------
  const numbers = loadNumbers(cfg.rootDir);
  const game = new GameState(numbers, store);
  let push: PushServer | undefined;
  game.onNotice = (text) => {
    log('game', text);
    push?.broadcast({ type: 'notice', text, ts: Date.now() });
  };
  game.onStateChange = () => push?.broadcastState();

  // ---------- 展示通道：IM 事件 ----------
  const seen = new Map<string, { type: string; ts: number }>(); // messageId 去重（group_all 与 at 重叠）
  const onImEvent = (raw: unknown): void => {
    const ev = normalizeImEvent(raw);
    if (!ev) return;
    if (ev.messageId) {
      const now = Date.now();
      const hit = seen.get(ev.messageId);
      if (hit && now - hit.ts < 15_000) {
        if (!(hit.type !== 'at_me' && ev.type === 'at_me')) return;
      }
      seen.set(ev.messageId, { type: ev.type, ts: now });
      if (seen.size > 500) {
        for (const [k, v] of seen) if (now - v.ts > 60_000) seen.delete(k);
      }
    }
    store.insertEvent(ev.id, ev.ts, ev.type, raw);
    const text = (ev.text ?? '').replace(/\n/g, ' ').slice(0, 60);
    log('im', `${ev.type} | ${ev.sender ?? '?'}${ev.conversationId ? ` @${ev.conversationId.slice(0, 14)}…` : ''}: ${text}`);
    // 数值影响（深夜消息、@打断/压力等）——只做数值，绝不触发操作
    const notes = game.onImEvent(ev);
    if (notes.length > 0) log('game', notes.join('；'));
    push?.broadcast({
      type: 'game_event',
      kind: ev.type,
      payload: { sender: ev.sender, conversationId: ev.conversationId, text: (ev.text ?? '').slice(0, 200) },
      ts: ev.ts,
    });
  };

  const consumes = [
    new ConsumeProc(cfg.dwsBin, { name: 'group', eventKeys: ['user_im_message_receive_group_all'], onEvent: onImEvent }),
    new ConsumeProc(cfg.dwsBin, { name: 'at', eventKeys: ['user_im_message_receive_at'], onEvent: onImEvent }),
    new ConsumeProc(cfg.dwsBin, { name: 'o2o', eventKeys: ['user_im_message_receive_o2o_all'], onEvent: onImEvent }),
  ];

  // ---------- 展示通道：待办轮询 diff ----------
  const poller = new TodoPoller(
    cfg.dwsBin,
    cfg.todoPageSize,
    cfg.pollIntervalSec,
    store,
    (d) => {
      store.insertEvent(`todo-${d.kind}-${d.item.taskId}`, Date.now(), `todo_${d.kind}`, d.item);
      log('todo', `变化 ${d.kind}: [${d.item.taskId}] ${d.item.subject}`);
      const notes = game.onTodoDelta(d);
      if (notes.length > 0) log('game', notes.join('；'));
      push?.broadcast({ type: 'game_event', kind: `todo_${d.kind}`, payload: d.item, ts: Date.now() });
      push?.broadcastTodos();
    },
    () => {
      game.checkAllClear(poller.list());
    },
  );

  for (const c of consumes) c.start();
  await poller.start();

  // ---------- 操作通道：共享工具上下文（REPL 与 WS 共用） ----------
  const ctx: ToolContext = {
    dwsBin: cfg.dwsBin,
    selfUserId,
    poller,
    store,
    moodTier: () => game.moodTierName(),
    onAction: (ev) => {
      const notes = game.applyAction(ev);
      log('game', `结算 ${ev.kind}：${notes.join('；') || '无数值变化'}`);
    },
  };

  // ---------- 推送层：WS + debug 页 ----------
  push = new PushServer(
    { cfg, game, poller, toolCtx: ctx, debugHtmlPath: resolve(cfg.rootDir, 'public/debug.html') },
    cfg.wsPort,
  );
  push.broadcastState();

  // ---------- 每分钟结算 tick ----------
  const tickTimer = setInterval(() => {
    game.tick(Date.now(), poller.list());
  }, 60_000);

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('main', '正在退出：停止 consume 订阅、轮询与 WS…');
    clearInterval(tickTimer);
    for (const c of consumes) c.stop();
    poller.stop();
    push?.close();
    setTimeout(() => {
      store.close();
      process.exit(0);
    }, 4_000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startRepl(cfg, ctx, game, shutdown);

  log(
    'main',
    `像素办公室后端已启动 | 轮询 ${cfg.pollIntervalSec}s | WS :${cfg.wsPort}（调试页 http://localhost:${cfg.wsPort}）| LLM ${
      cfg.llm.enabled ? `已配置(${cfg.llm.model})` : '未配置（/call 直调模式可用）'
    }`,
  );
}

main().catch((e) => {
  console.error('启动失败:', e);
  process.exit(1);
});
