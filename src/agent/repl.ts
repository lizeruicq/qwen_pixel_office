/**
 * 终端 REPL（P2 适配）：玩家输入 → 共享执行器/Agent 流程。
 * 新增 /state（属性快照）、/rest（休息切换）。
 */
import * as readline from 'node:readline';
import type { AppConfig } from '../config.js';
import type { GameState } from '../game/state.js';
import { runAgentFlow } from './agent-flow.js';
import { executeTool, type ConfirmDriver } from './executor.js';
import type { ToolContext } from './tools.js';

export interface ReplHandle {
  stop(): void;
}

function printHelp(write: (s: string) => void): void {
  write(
    [
      '命令:',
      '  /todos                    查看未完成待办',
      '  /state                    查看四属性快照',
      '  /call <工具名> <json参数>  直接调用工具（无需 LLM），如:',
      '                            /call list_todos {}',
      '                            /call send_group_message {"group":"测试","text":"hello"}',
      '  /help                     显示帮助',
      '  /quit                     退出',
      '其他输入将交给 AI 助手千仔（需配置 LLM API Key）。',
    ].join('\n'),
  );
}

export function startRepl(cfg: AppConfig, ctx: ToolContext, game: GameState, onQuit: () => void): ReplHandle {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const write = (s: string) => process.stdout.write(`${s}\n`);

  let closing = false;
  let hardStop = false;
  let busy = false;
  let rlClosed = false;
  const queue: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  function nextLine(prompt: string): Promise<string> {
    if (queue.length > 0) {
      const line = queue.shift() as string;
      write(`${prompt}${line}`);
      return Promise.resolve(line);
    }
    process.stdout.write(prompt);
    return new Promise((resolve) => waiters.push(resolve));
  }

  /** 终端确认驱动：草稿预览 → y/N */
  const driver: ConfirmDriver = {
    async confirm(_tool, _args, preview) {
      write(`\n—— 草稿确认 ——\n${preview}`);
      const answer = (await nextLine('执行吗? [y/N] ')).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
  };

  const sink = {
    text: (t: string) => write(t),
    toolStart: (name: string, args: Record<string, unknown>) => write(`→ 调用工具 ${name} ${JSON.stringify(args)}`),
  };

  async function callTool(name: string, args: Record<string, unknown>): Promise<void> {
    const r = await executeTool(name, args, ctx, driver);
    if (r.status !== 'ok') write(`[${r.status}] ${r.text}`);
    else write(r.text);
  }

  function printState(): void {
    const s = game.snapshot();
    write(
      [
        `能量 ${s.energy}/${s.energyCap} ｜ 心情 ${s.mood}（${s.moodTier}）｜ 专注 ${s.focus}`,
        `金币 ${s.coins} ｜ Lv${s.level}（XP ${s.xp}）｜ 今日完成 ${s.completedToday}`,
      ].join('\n'),
    );
  }

  async function handle(line: string): Promise<void> {
    if (!line) return;
    if (line === '/help') {
      printHelp(write);
      return;
    }
    if (line === '/quit' || line === '/exit') {
      closing = true;
      hardStop = true;
      return;
    }
    if (line === '/todos') {
      await callTool('list_todos', {});
      return;
    }
    if (line === '/state') {
      printState();
      return;
    }
    if (line.startsWith('/call ')) {
      const rest = line.slice(6).trim();
      const sp = rest.indexOf(' ');
      const name = sp === -1 ? rest : rest.slice(0, sp);
      const jsonPart = sp === -1 ? '{}' : rest.slice(sp + 1).trim();
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(jsonPart || '{}');
      } catch {
        write('参数 JSON 无效');
        return;
      }
      await callTool(name, args);
      return;
    }
    if (line.startsWith('/')) {
      write(`未知命令 ${line}，/help 查看帮助`);
      return;
    }
    await runAgentFlow(line, cfg, ctx, driver, sink);
  }

  async function pump(): Promise<void> {
    if (busy) return;
    busy = true;
    while (queue.length > 0 && !hardStop) {
      const line = queue.shift() as string;
      try {
        await handle(line);
      } catch (e) {
        write(`处理出错: ${String(e)}`);
      }
    }
    busy = false;
    if (closing) {
      rl.close();
      onQuit();
      return;
    }
    if (!rlClosed) rl.prompt();
  }

  write('像素办公室后端已启动。/help 查看命令；自然语言将交给 AI 助手千仔。');
  rl.setPrompt('pixel-office> ');
  rl.prompt();

  rl.on('line', (l) => {
    const t = l.trim();
    const w = waiters.shift();
    if (w) {
      w(t);
      return;
    }
    queue.push(t);
    void pump();
  });
  rl.on('close', () => {
    rlClosed = true;
    while (waiters.length > 0) {
      const w = waiters.shift() as (line: string) => void;
      w('');
    }
    if (!closing) {
      closing = true;
      if (!busy) onQuit();
    }
  });

  return {
    stop() {
      closing = true;
      rl.close();
    },
  };
}
