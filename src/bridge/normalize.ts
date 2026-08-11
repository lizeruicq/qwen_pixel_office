import type { GameEvent } from '../shared/types.js';

/**
 * 把 dws event consume --flatten 的顶层业务字段归一化为 GameEvent。
 * 注意：这里产出的只是“展示素材”，永远不进入工具执行通道（防注入，设计文档 5.4）。
 */
export function normalizeImEvent(raw: unknown): GameEvent | null {
  const obj = raw as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') return null;
  const t = String(obj.type ?? '');

  let type: GameEvent['type'];
  if (t === 'user_im_message_receive_group_all' || t === 'user_im_message_receive_group') {
    type = 'group_msg';
  } else if (t === 'user_im_message_receive_at') {
    type = 'at_me';
  } else if (t === 'user_im_message_receive_o2o_all' || t === 'user_im_message_receive_o2o') {
    type = 'o2o_msg';
  } else {
    return null;
  }

  const content = obj.content;
  const text = typeof content === 'string' ? content : content == null ? '' : JSON.stringify(content);

  return {
    id: String(obj.event_id ?? `${t}-${String(obj.event_time ?? Date.now())}-${Math.random().toString(36).slice(2, 8)}`),
    type,
    ts: Number(obj.event_time ?? obj.timestamp ?? Date.now()),
    messageId: obj.message_id ? String(obj.message_id) : undefined,
    conversationId: obj.conversation_id ? String(obj.conversation_id) : undefined,
    sender: obj.sender ? String(obj.sender) : undefined,
    senderOpenId: obj.sender_open_dingtalk_id ? String(obj.sender_open_dingtalk_id) : undefined,
    text,
  };
}
