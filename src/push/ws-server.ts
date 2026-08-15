/**
 * 推送层：本地 HTTP + WebSocket 服务。
 * - GET / 提供 debug.html 调试页面；
 * - WS 协议见设计文档/开发计划：server→client 推 hello/state/game_event/todos/agent_card/notice，
 *   client→server 收 action/confirm/agent_chat。
 * - 写操作的草稿确认走 requestId 往返；超时按拒绝处理。
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import type { AppConfig } from '../config.js';
import type { GameState } from '../game/state.js';
import type { TodoPoller } from '../bridge/todo-poller.js';
import type { ToolContext } from '../agent/tools.js';
import { executeTool, type ConfirmDriver } from '../agent/executor.js';
import { runAgentChat } from '../agent/agent-flow.js';
import type { ChatMessage } from '../agent/llm.js';
import { log } from '../log.js';
import type { ClientMessage } from '../shared/types.js';
import type { Clock } from '../game/clock.js';

export interface PushDeps {
  cfg: AppConfig;
  game: GameState;
  poller: TodoPoller;
  toolCtx: ToolContext;
  debugHtmlPath: string;
  clock: Clock;
  getConversations: () => unknown[];
  fetchMessages: (convId: string) => Promise<unknown[]>;
}

const CONFIRM_TIMEOUT_MS = 5 * 60_000;

export class PushServer {
  private clients = new Set<WebSocket>();
  private pending = new Map<string, (approved: boolean) => void>();
  /** 每个连接当前正在运行的 AI 流程的中断器 */
  private agentAborters = new Map<WebSocket, AbortController>();
  /** 每个连接的千仔对话历史（会话记忆）：连接断开（刷新页面）即清空 */
  private chatHistories = new Map<WebSocket, ChatMessage[]>();
  /** 各角色/界面显隐状态（跨刷新保持，后端内存中），新连接建立时下发 */
  private visibility: Record<string, boolean> = { qz: true, workers: true, boss: true, player: true, phone: false };
  private server: http.Server;

  constructor(
    private deps: PushDeps,
    private port: number,
  ) {
    const html = readFileSync(deps.debugHtmlPath, 'utf8');
    this.server = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/debug')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });
    const wss = new WebSocketServer({ server: this.server });
    wss.on('connection', (ws) => {
      this.clients.add(ws);
      this.send(ws, { type: 'hello', ts: Date.now() });
      this.send(ws, { type: 'state', state: this.deps.game.snapshot() });
      this.send(ws, { type: 'todos', items: this.deps.poller.list() });
      this.send(ws, { type: 'ui_visibility', vis: this.visibility }); // 下发当前显隐状态，刷新后恢复
      this.sendTime(ws);
      ws.on('message', (data) => {
        void this.handleMessage(ws, data.toString());
      });
      ws.on('close', () => {
        this.clients.delete(ws);
        this.agentAborters.get(ws)?.abort();
        this.agentAborters.delete(ws);
        this.chatHistories.delete(ws); // 连接断开 → 清空千仔会话记忆
      });
      log('ws', `客户端连接，当前 ${this.clients.size} 个`);
    });
    this.server.listen(port, () => {
      log('ws', `WebSocket + 调试页已启动: http://localhost:${port}`);
    });
  }

  broadcast(msg: unknown): void {
    const s = JSON.stringify(msg);
    for (const c of this.clients) {
      if (c.readyState === WebSocket.OPEN) c.send(s);
    }
  }

  broadcastState(): void {
    this.broadcast({ type: 'state', state: this.deps.game.snapshot() });
  }

  broadcastTodos(): void {
    this.broadcast({ type: 'todos', items: this.deps.poller.list() });
  }

  /** 前端「刷新待办」：先真正向 dws 拉一次最新快照，再广播（否则只回内存缓存，可能滞后一个轮询周期） */
  private async refreshTodos(): Promise<void> {
    try {
      await this.deps.poller.poll();
    } catch (e) {
      log('todo', `手动刷新轮询失败: ${String(e)}`);
    }
    this.broadcastTodos();
  }

  private timeMsg(): { type: 'time'; mode: 'natural' | 'manual'; now: number; phase: string; ts: number } {
    const s = this.deps.clock.snapshot();
    return { type: 'time', mode: s.mode, now: s.now, phase: s.phase, ts: Date.now() };
  }

  private sendTime(ws: WebSocket): void {
    this.send(ws, this.timeMsg());
  }

  broadcastTime(): void {
    this.broadcast(this.timeMsg());
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  /** WS 版确认驱动：草稿卡片 + requestId 往返 */
  private wsDriver(ws: WebSocket): ConfirmDriver {
    return {
      confirm: (_tool, _args, preview) => {
        const requestId = randomUUID();
        this.send(ws, { type: 'agent_card', stage: 'draft', requestId, preview });
        return new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            this.pending.delete(requestId);
            resolve(false);
          }, CONFIRM_TIMEOUT_MS);
          this.pending.set(requestId, (approved) => {
            clearTimeout(timer);
            this.pending.delete(requestId);
            resolve(approved);
          });
        });
      },
    };
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    const { game, toolCtx, cfg } = this.deps;
    try {
      if (msg.type === 'set_time') {
        const m = msg as { type: 'set_time'; mode: 'natural' | 'manual'; ms?: number };
        if (m.mode === 'manual' && typeof m.ms === 'number' && Number.isFinite(m.ms)) {
          this.deps.clock.useManual(m.ms);
          log('clock', `切到人工时间：${new Date(m.ms).toLocaleString('zh-CN')}`);
        } else {
          this.deps.clock.useNatural();
          log('clock', '切回自然时间');
        }
        this.broadcastTime();
        return;
      }
      if (msg.type === 'panel') {
        const m = msg as { type: 'panel'; name?: string; convId?: string };
        if (m.name === 'conversations') {
          this.send(ws, { type: 'conversations', items: this.deps.getConversations() });
        } else if (m.name === 'messages') {
          const items = await this.deps.fetchMessages(String(m.convId ?? ''));
          this.send(ws, { type: 'messages', convId: m.convId, items });
        } else if (m.name === 'todos') {
          await this.refreshTodos();
        }
        return;
      }
      if (msg.type === 'confirm') {
        const resolver = this.pending.get(msg.requestId);
        if (resolver) resolver(Boolean(msg.approved));
        return;
      }
      if (msg.type === 'action') {
        const result = await executeTool(msg.name, msg.params ?? {}, toolCtx, this.wsDriver(ws));
        this.send(ws, { type: 'agent_card', stage: 'result', tool: msg.name, text: `[${result.status}] ${result.text}` });
        this.broadcastState();
        return;
      }
      if (msg.type === 'agent_cancel') {
        this.agentAborters.get(ws)?.abort();
        return;
      }
      if (msg.type === 'adjust_stat') {
        const m = msg as { type: 'adjust_stat'; stat: 'energy' | 'mood' | 'focus' | 'coins'; delta: number };
        const allowed = ['energy', 'mood', 'focus', 'coins'];
        if (allowed.includes(m.stat) && typeof m.delta === 'number') {
          game.adjustStat(m.stat, m.delta); // changed() → onStateChange → broadcastState()
          log('debug', `调整属性 ${m.stat} ${m.delta > 0 ? '+' : ''}${m.delta}`);
        }
        return;
      }
      if (msg.type === 'set_stat') {
        const m = msg as { type: 'set_stat'; stat: 'energy' | 'mood' | 'focus' | 'coins'; value: number };
        const allowed = ['energy', 'mood', 'focus', 'coins'];
        if (allowed.includes(m.stat) && typeof m.value === 'number' && Number.isFinite(m.value)) {
          game.setStat(m.stat, m.value); // changed() → onStateChange → broadcastState()
          log('debug', `设定属性 ${m.stat} = ${m.value}`);
        }
        return;
      }
      if (msg.type === 'debug_ui') {
        // 调试页控制游戏窗口：弹面板/对话、显隐角色、推手机消息 —— 广播给所有客户端渲染
        const m = msg as {
          type: 'debug_ui'; kind: 'panel' | 'dialog' | 'toggle' | 'phone_msg' | 'bubble' | 'sim_event';
          image?: string; portrait?: string; portraitKey?: string; text?: string;
          target?: 'qz' | 'workers' | 'boss' | 'phone' | 'worker0' | 'worker1' | 'player'; show?: boolean; from?: 'boss' | 'xiaomei';
          event?: string; sender?: string;
        };
        if (m.kind === 'panel') {
          this.broadcast({ type: 'ui_panel', image: String(m.image ?? ''), text: String(m.text ?? '') });
          log('debug', `调试面板：${String(m.text ?? '').slice(0, 24)}`);
        } else if (m.kind === 'dialog') {
          this.broadcast({ type: 'ui_dialog', portrait: String(m.portrait ?? ''), portraitKey: m.portraitKey ? String(m.portraitKey) : undefined, text: String(m.text ?? '') });
          log('debug', `调试对话：${String(m.text ?? '').slice(0, 24)}`);
        } else if (m.kind === 'toggle' && m.target) {
          this.visibility[m.target] = Boolean(m.show); // 记住显隐状态，供刷新后恢复
          this.broadcast({ type: 'ui_toggle', target: m.target, show: Boolean(m.show) });
          log('debug', `显隐 ${m.target} → ${m.show ? '显示' : '隐藏'}`);
        } else if (m.kind === 'phone_msg' && m.from) {
          this.broadcast({ type: 'ui_phone_msg', from: m.from, text: String(m.text ?? '') });
          log('debug', `手机消息 ${m.from}：${String(m.text ?? '').slice(0, 24)}`);
        } else if (m.kind === 'bubble' && m.target) {
          this.broadcast({ type: 'ui_bubble', target: m.target, text: String(m.text ?? '') });
          log('debug', `气泡 ${m.target}：${String(m.text ?? '').slice(0, 24)}`);
        } else if (m.kind === 'sim_event' && m.event) {
          // 模拟时间流：调试页触发一个事件，广播给游戏端按真实事件同样处理
          this.broadcast({ type: 'sim_event', event: String(m.event), text: String(m.text ?? ''), sender: String(m.sender ?? ''), ts: Date.now() });
          log('debug', `模拟事件 ${m.event}：${String(m.text ?? '').slice(0, 24)}`);
        }
        return;
      }
      if (msg.type === 'agent_chat') {
        // 若已有在跑的流程，先中断再开新的（防御；正常前端会在思考中锁定输入）
        this.agentAborters.get(ws)?.abort();
        const aborter = new AbortController();
        this.agentAborters.set(ws, aborter);
        // 取/建本连接的对话历史（会话记忆）
        let history = this.chatHistories.get(ws);
        if (!history) {
          history = [];
          this.chatHistories.set(ws, history);
        }
        try {
          await runAgentChat(String(msg.text ?? ''), history, cfg, toolCtx, this.wsDriver(ws), {
            text: (t) => this.send(ws, { type: 'agent_card', stage: 'result', text: t }),
            toolStart: (name, args) => this.send(ws, { type: 'agent_card', stage: 'tool', tool: name, text: JSON.stringify(args) }),
          }, aborter.signal);
        } finally {
          // 仅当本次仍是当前流程时才清理并通知解锁
          if (this.agentAborters.get(ws) === aborter) {
            this.agentAborters.delete(ws);
            this.send(ws, { type: 'agent_card', stage: 'done' });
          }
        }
        this.broadcastState();
      }
    } catch (e) {
      this.send(ws, { type: 'agent_card', stage: 'result', text: `处理出错: ${String(e)}` });
    }
  }

  close(): void {
    for (const c of this.clients) c.close();
    this.server.close();
  }
}
