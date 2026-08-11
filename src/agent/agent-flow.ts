/**
 * AI 秘书对话循环（function calling）：REPL 与 WebSocket 共用。
 * 输出经 AgentSink 适配到终端或 WS 卡片；确认经 ConfirmDriver 适配。
 */
import type { AppConfig } from '../config.js';
import { chatOnce, SYSTEM_PROMPT, wrapExternalContent, wrapPlayerInput, type ChatMessage, type ToolCall } from './llm.js';
import { openAiToolSchemas, type ToolContext } from './tools.js';
import { executeTool, type ConfirmDriver } from './executor.js';

const MAX_TOOL_ITERATIONS = 6;

export interface AgentSink {
  text(s: string): void;
  toolStart(name: string, args: Record<string, unknown>): void;
}

export async function runAgentFlow(
  input: string,
  cfg: AppConfig,
  ctx: ToolContext,
  driver: ConfirmDriver,
  sink: AgentSink,
): Promise<void> {
  if (!cfg.llm.enabled) {
    sink.text('LLM 未配置：请设置环境变量 PIXEL_LLM_API_KEY（或 DASHSCOPE_API_KEY）。');
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
      sink.text(`LLM 调用失败: ${String(e)}`);
      return;
    }
    if (resp.toolCalls.length === 0) {
      sink.text(resp.content ?? '(模型未返回内容)');
      return;
    }
    messages.push({ role: 'assistant', content: resp.content ?? '', tool_calls: resp.toolCalls });
    for (const tc of resp.toolCalls) {
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
