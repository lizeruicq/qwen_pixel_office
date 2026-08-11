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
import { runAgentFlow } from '../agent/agent-flow.js';
import { log } from '../log.js';
import type { ClientMessage } from '../shared/types.js';

export interface PushDeps {
  cfg: AppConfig;
  game: GameState;
  poller: TodoPoller;
  toolCtx: ToolContext;
  debugHtmlPath: string;
}

const CONFIRM_TIMEOUT_MS = 5 * 60_000;

export class PushServer {
  private clients = new Set<WebSocket>();
  private pending = new Map<string, (approved: boolean) => void>();
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
      ws.on('message', (data) => {
        void this.handleMessage(ws, data.toString());
      });
      ws.on('close', () => this.clients.delete(ws));
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
      if (msg.type === 'confirm') {
        const resolver = this.pending.get(msg.requestId);
        if (resolver) resolver(Boolean(msg.approved));
        return;
      }
      if (msg.type === 'action') {
        if (msg.name === 'rest_start' || msg.name === 'rest_stop') {
          const text = msg.name === 'rest_start' ? game.startRest() : game.stopRest();
          this.send(ws, { type: 'agent_card', stage: 'result', text });
          this.broadcastState();
          return;
        }
        const result = await executeTool(msg.name, msg.params ?? {}, toolCtx, this.wsDriver(ws));
        this.send(ws, { type: 'agent_card', stage: 'result', tool: msg.name, text: `[${result.status}] ${result.text}` });
        this.broadcastState();
        return;
      }
      if (msg.type === 'agent_chat') {
        await runAgentFlow(String(msg.text ?? ''), cfg, toolCtx, this.wsDriver(ws), {
          text: (t) => this.send(ws, { type: 'agent_card', stage: 'result', text: t }),
          toolStart: (name, args) => this.send(ws, { type: 'agent_card', stage: 'tool', tool: name, text: JSON.stringify(args) }),
        });
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
