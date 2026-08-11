import * as readline from 'node:readline';
import type { AppConfig } from '../config.js';
import { chatOnce, SYSTEM_PROMPT, wrapExternalContent, wrapPlayerInput, type ChatMessage, type ToolCall } from './llm.js';
import { dispatchTool, openAiToolSchemas, type ToolContext } from './tools.js';

const MAX_TOOL_ITERATIONS = 6;

export interface ReplHandle {
  stop(): void;
}

function printHelp(write: (s: string) => void): void {
  write(
    [
      '命令:',
      '  /todos                    查看未完成待办',
      '  /call <工具名> <json参数>  直接调用工具（无需 LLM），如:',
      '                            /call list_todos {}',
      '                            /call send_group_message {"group":"测试","text":"hello"}',
      '  /help                     显示帮助',
      '  /quit                     退出',
      '其他输入将交给 AI 秘书（需配置 LLM API Key）。',
    ].join('\n'),
  );
}

/**
 * 终端 REPL：玩家输入 → AI 秘书（function calling）或 /call 直调。
 * 所有写操作在此处走“草稿预览 → 玩家确认”，并写审计表。
 */
export function startRepl(cfg: AppConfig, ctx: ToolContext, onQuit: () => void): ReplHandle {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const write = (s: string) => process.stdout.write(`${s}\n`);

  let closing = false;
  let hardStop = false;
  let busy = false;
  let rlClosed = false;
  const queue: string[] = [];
  const waiters: Array<(line: string) => void> = [];

  /**
   * 取一行输入：队列里已有（管道输入先到达）则立即取用；
   * 否则等待下一行（交互输入）。EOF 时等待者收到空串，确认默认按取消处理。
   */
  function nextLine(prompt: string): Promise<string> {
    if (queue.length > 0) {
      const line = queue.shift() as string;
      write(`${prompt}${line}`);
      return Promise.resolve(line);
    }
    process.stdout.write(prompt);
    return new Promise((resolve) => waiters.push(resolve));
  }

  async function runToolWithConfirm(name: string, args: Record<string, unknown>): Promise<string> {
    const outcome = await dispatchTool(name, args, ctx);
    if (outcome.kind === 'error') return `[失败] ${outcome.text}`;
    if (outcome.kind === 'result') return outcome.text;
    write(`\n—— 草稿确认 ——\n${outcome.preview}`);
    const answer = (await nextLine('执行吗? [y/N] ')).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      ctx.store.audit(name, args, 'rejected', '玩家取消');
      return '玩家已取消该操作，未执行。';
    }
    try {
      const result = await outcome.run();
      ctx.store.audit(name, args, 'confirmed', result);
      return result;
    } catch (e) {
      ctx.store.audit(name, args, 'error', String(e));
      return `执行出错: ${String(e)}`;
    }
  }

  async function agentFlow(input: string): Promise<void> {
    if (!cfg.llm.enabled) {
      write('LLM 未配置：请设置环境变量 PIXEL_LLM_API_KEY（或 DASHSCOPE_API_KEY），或使用 /call <工具> <json> 直调模式。');
      return;
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: wrapPlayerInput(input) },
    ];
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      let resp: { content: string | null; toolCalls: ToolCall[] };
      try {
        resp = await chatOnce(cfg.llm, messages, openAiToolSchemas());
      } catch (e) {
        write(`LLM 调用失败: ${String(e)}`);
        return;
      }
      if (resp.toolCalls.length === 0) {
        if (resp.content) write(resp.content);
        else write('(模型未返回内容)');
        return;
      }
      messages.push({ role: 'assistant', content: resp.content ?? '', tool_calls: resp.toolCalls });
      for (const tc of resp.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          write(`[warn] 工具参数 JSON 解析失败: ${tc.function.arguments}`);
        }
        write(`→ 调用工具 ${tc.function.name} ${JSON.stringify(args)}`);
        const result = await runToolWithConfirm(tc.function.name, args);
        // 工具输出可能包含钉钉外部内容，回传给模型时同样按不可信数据包裹
        messages.push({ role: 'tool', tool_call_id: tc.id, content: wrapExternalContent(result) });
      }
    }
    write('(已达到最大工具调用轮数，终止本次请求)');
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
      write(await runToolWithConfirm('list_todos', {}));
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
      write(await runToolWithConfirm(name, args));
      return;
    }
    if (line.startsWith('/')) {
      write(`未知命令 ${line}，/help 查看帮助`);
      return;
    }
    await agentFlow(line);
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

  write('像素办公室后端已启动。/help 查看命令；自然语言将交给 AI 秘书。');
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
