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

/* ---------- P2：属性与协议类型 ---------- */

export type MoodTierName = '兴奋' | '开心' | '平静' | '疲惫' | '倦怠';

/** 四属性轴快照（server→client 的 state 消息体） */
export interface StateSnapshot {
  energy: number;
  energyCap: number;
  mood: number;
  moodTier: MoodTierName;
  focus: number;
  coins: number;
  xp: number;
  level: number;
  completedToday: number;
  date: string;
}

/** 工具成功执行后产生的结算动作（操作通道 → 游戏逻辑层） */
export type ActionEvent =
  | { kind: 'message_sent'; scope: 'group' | 'o2o'; conversationId?: string }
  | { kind: 'todo_completed'; taskId: string; priority: number; wasOverdue: boolean }
  | { kind: 'todo_created' }
  | { kind: 'approval_done' };

/** server→client 推送消息 */
export type ServerMessage =
  | { type: 'hello'; ts: number }
  | { type: 'state'; state: StateSnapshot }
  | { type: 'game_event'; kind: string; payload: unknown; ts: number }
  | { type: 'todos'; items: TodoItem[] }
  | { type: 'conversations'; items: Array<{ id: string; kind: 'group' | 'o2o'; title: string; count: number }> }
  | { type: 'messages'; convId: string; items: Array<{ sender: string; text: string; ts: string | number }> }
  | {
      type: 'agent_card';
      stage: 'draft' | 'tool' | 'result' | 'done';
      requestId?: string;
      tool?: string;
      preview?: string;
      text?: string;
    }
  | { type: 'notice'; text: string; ts: number }
  | { type: 'time'; mode: 'natural' | 'manual'; now: number; phase: string; ts: number }
  | { type: 'ui_panel'; image: string; text: string }   // 调试：游戏内弹确认面板
  | { type: 'ui_dialog'; portrait?: string; portraitKey?: string; text: string } // 调试：游戏内弹 RPG 对话（portrait=图片路径 / portraitKey=角色胸像）
  | { type: 'ui_toggle'; target: 'qz' | 'workers' | 'boss' | 'phone' | 'player'; show: boolean } // 调试：显隐角色/手机
  | { type: 'ui_phone_msg'; from: 'boss' | 'xiaomei'; text: string } // 调试：往手机推一条消息
  | { type: 'ui_bubble'; target: 'boss' | 'worker0' | 'worker1' | 'qz' | 'player'; text: string } // 调试：指定角色头顶气泡
  | { type: 'ui_visibility'; vis: Record<string, boolean> } // 连接建立时下发当前各角色显隐状态（用于刷新后恢复）
  | { type: 'sim_event'; event: string; text?: string; sender?: string; ts: number }; // 调试：模拟时间流事件（千仔回复/at我/群消息/新待办等）

/** client→server 请求消息 */
export type ClientMessage =
  | { type: 'action'; name: string; params?: Record<string, unknown> }
  | { type: 'confirm'; requestId: string; approved: boolean }
  | { type: 'panel'; name: 'conversations' | 'messages' | 'todos'; convId?: string }
  | { type: 'agent_chat'; text: string }
  | { type: 'agent_cancel' }
  | { type: 'set_time'; mode: 'natural' | 'manual'; ms?: number }
  | { type: 'adjust_stat'; stat: 'energy' | 'mood' | 'focus' | 'coins'; delta: number }
  | {
      type: 'debug_ui';
      kind: 'panel' | 'dialog' | 'toggle' | 'phone_msg' | 'bubble' | 'sim_event';
      image?: string; portrait?: string; portraitKey?: string; text?: string;
      target?: 'qz' | 'workers' | 'boss' | 'phone' | 'worker0' | 'worker1' | 'player'; show?: boolean;
      from?: 'boss' | 'xiaomei';
      event?: string; sender?: string;
    };
