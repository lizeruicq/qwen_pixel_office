/**
 * 共享类型定义 —— 后端与未来 Phaser 前端共用。
 */

/** IM 消息类事件（来自 dws event consume，实时） */
export type ImEventType = 'group_msg' | 'at_me' | 'o2o_msg';

/** 待办轮询 diff 产出的变化类型 */
export type TodoDeltaKind = 'added' | 'done' | 'near_due' | 'overdue';

/** 归一化后的 IM 事件（展示通道数据，严禁当作指令执行） */
export interface GameEvent {
  id: string;
  type: ImEventType;
  /** 事件时间戳（毫秒） */
  ts: number;
  messageId?: string;
  conversationId?: string;
  sender?: string;
  senderOpenId?: string;
  text?: string;
}

export interface TodoItem {
  taskId: string;
  subject: string;
  /** 10低 / 20普通 / 30较高 / 40紧急 */
  priority: number;
  /** 截止时间（毫秒），可能为空 */
  dueTime?: number;
  createdTime?: number;
}

export interface TodoDelta {
  kind: TodoDeltaKind;
  item: TodoItem;
}
