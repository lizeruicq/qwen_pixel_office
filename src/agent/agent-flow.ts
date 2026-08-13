/**
 * 千仔 AI 对话循环（function calling）：REPL 与 WebSocket 共用。
 * 输出经 AgentSink 适配到终端或 WS 卡片；确认经 ConfirmDriver 适配。
 *
 * 记忆：runAgentChat 接收一个由调用方持有的 history 数组，对话在其上原地累积。
 * WebSocket 每个连接各持有一份 → 同一连接内多轮对话有上下文；连接断开（刷新页面）即清空。
 */
import type { AppConfig } from '../config.js';
import { chatOnce, SYSTEM_PROMPT, wrapExternalContent, wrapPlayerInput, type ChatMessage, type ToolCall } from './llm.js';
import { openAiToolSchemas, type ToolContext } from './tools.js';
import { executeTool, type ConfirmDriver } from './executor.js';

const MAX_TOOL_ITERATIONS = 6;
/** 历史最多保留的「用户轮次」；超出后丢弃最早的对话，保留 system 与最近若干轮 */
const MAX_HISTORY_TURNS = 20;

export interface AgentSink {
  text(s: string): void;
  toolStart(name: string, args: Record<string, unknown>): void;
}

/** 裁剪历史：始终保留 system，限制 user 轮次，且不以孤悬的 assistant(tool_calls) 开头 */
export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  const system = history.filter((m) => m.role === 'system');
  const rest = history.filter((m) => m.role !== 'system');
  let userCount = 0;
  let start = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (rest[i].role === 'user') {
      userCount++;
      if (userCount > MAX_HISTORY_TURNS) { start = i + 1; break; }
      start = i;
    }
  }
  let kept = rest.slice(start);
  while (kept.length && kept[0].role !== 'user') kept = kept.slice(1); // 去除开头孤悬的 assistant/tool
  return [...system, ...kept];
}

/** 带记忆的对话：在传入的 history 上原地累积（调用方负责按会话持有 / 清空） */
export async function runAgentChat(
  input: string,
  history: ChatMessage[],
  cfg: AppConfig,
  ctx: ToolContext,
  driver: ConfirmDriver,
  sink: AgentSink,
  signal?: AbortSignal,
): Promise<void> {
  if (!cfg.llm.enabled) {
    sink.text('LLM 未配置：请设置环境变量 PIXEL_LLM_API_KEY（或 DASHSCOPE_API_KEY）。');
    return;
  }
  if (!history.length || history[0].role !== 'system') {
    history.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }
  history.push({ role: 'user', content: wrapPlayerInput(input) });
  const trimmed = trimHistory(history);
  history.length = 0;
  history.push(...trimmed);
  await runLoop(history, cfg, ctx, driver, sink, signal);
}

/** 一次性（无记忆）对话：REPL 用，每次独立 */
export async function runAgentFlow(
  input: string,
  cfg: AppConfig,
  ctx: ToolContext,
  driver: ConfirmDriver,
  sink: AgentSink,
  signal?: AbortSignal,
): Promise<void> {
  if (!cfg.llm.enabled) {
    sink.text('LLM 未配置：请设置环境变量 PIXEL_LLM_API_KEY（或 DASHSCOPE_API_KEY）。');
    return;
  }
  await runLoop([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: wrapPlayerInput(input) }], cfg, ctx, driver, sink, signal);
}

/** 核心 function-calling 循环：直接在传入的 messages 上累积 */
async function runLoop(
  messages: ChatMessage[],
  cfg: AppConfig,
  ctx: ToolContext,
  driver: ConfirmDriver,
  sink: AgentSink,
  signal?: AbortSignal,
): Promise<void> {
  const aborted = () => signal?.aborted === true;
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    if (aborted()) {
      sink.text('（已取消）');
      return;
    }
    let resp: { content: string | null; toolCalls: ToolCall[] };
    try {
      resp = await chatOnce(cfg.llm, messages, openAiToolSchemas(), signal);
    } catch (e) {
      if (aborted()) {
        sink.text('（已取消）');
        return;
      }
      sink.text(`LLM 调用失败: ${String(e)}`);
      return;
    }
    if (resp.toolCalls.length === 0) {
      sink.text(resp.content ?? '(模型未返回内容)');
      if (resp.content) messages.push({ role: 'assistant', content: resp.content }); // 记入历史
      return;
    }
    messages.push({ role: 'assistant', content: resp.content ?? '', tool_calls: resp.toolCalls });
    for (const tc of resp.toolCalls) {
      if (aborted()) {
        sink.text('（已取消）');
        return;
      }
      let args: Record<string, unknown> = {};
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        sink.text(`[warn] 工具参数 JSON 解析失败: ${tc.function.arguments}`);
      }
      sink.toolStart(tc.function.name, args);
      const result = await executeTool(tc.function.name, args, ctx, driver);
      const prefix = result.status === 'ok' ? '' : `[${result.status}] `;
      // 工具输出可能包含钉钉外部内容，回传给模型时按不可信数据包裹
      messages.push({ role: 'tool', tool_call_id: tc.id, content: wrapExternalContent(prefix + result.text) });
    }
  }
  sink.text('(已达到最大工具调用轮数，终止本次请求)');
}
