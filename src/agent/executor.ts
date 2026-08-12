/**
 * 统一工具执行器：REPL 与 WebSocket 两个入口共用。
 * 写操作一律走 ConfirmDriver（草稿预览 → 玩家确认），并写审计表。
 *
 * 倦怠档保护（设计文档 6.4 / 开发计划 2.3）：
 * 心情 <20 时“自动化/加速类”工具不可用；真实操作（查看/回复/完成待办）不受影响。
 */
import { dispatchTool, type ToolContext } from './tools.js';

export interface ConfirmDriver {
  confirm(tool: string, args: Record<string, unknown>, preview: string): Promise<boolean>;
}

export interface ExecResult {
  status: 'ok' | 'rejected' | 'error';
  text: string;
}

export const AUTOMATION_TOOLS = ['summarize_conversation', 'create_todo', 'create_doc', 'submit_report'];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  driver: ConfirmDriver,
): Promise<ExecResult> {
  if (AUTOMATION_TOOLS.includes(name) && ctx.moodTier?.() === '倦怠') {
    return {
      status: 'error',
      text: '小人处于倦怠状态，不想动脑：自动化/加速类功能暂不可用（查看、回复、完成待办等真实操作不受影响）。先休息一下吧。',
    };
  }
  const outcome = await dispatchTool(name, args, ctx);
  if (outcome.kind === 'error') return { status: 'error', text: outcome.text };
  if (outcome.kind === 'result') return { status: 'ok', text: outcome.text };

  const approved = await driver.confirm(name, args, outcome.preview);
  if (!approved) {
    ctx.store.audit(name, args, 'rejected', '玩家取消');
    return { status: 'rejected', text: '玩家已取消该操作，未执行。' };
  }
  try {
    const text = await outcome.run();
    ctx.store.audit(name, args, 'confirmed', text);
    return { status: 'ok', text };
  } catch (e) {
    ctx.store.audit(name, args, 'error', String(e));
    return { status: 'error', text: `执行出错: ${String(e)}` };
  }
}
