# 像素办公室 · 本地后端（P1 闭环 + P2 服务与数值）

钉钉桥接 + 游戏数值结算 + AI 秘书：实时监听群消息/@我/单聊，2 分钟轮询待办 diff，四属性轴（能量/心情/专注/金币等级）随真实钉钉事件与玩家操作结算，WebSocket 推送给前端（P2 附 debug 调试页）。

## 前置条件

- Node.js ≥ 20
- 已安装并登录 dws（`dws auth status` 检查）

## 安装与运行

```bash
npm install
npm run build
npm start
```

启动后同时提供：终端 REPL、WebSocket 服务（默认 `:8787`）、调试页 <http://localhost:8787>。

可选：配置 LLM 后启用自然语言模式（OpenAI 兼容接口）：

```bash
export PIXEL_LLM_API_KEY=sk-xxxx          # 或 DASHSCOPE_API_KEY
export PIXEL_LLM_MODEL=qwen-plus          # 可选
export PIXEL_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1  # 可选
export PIXEL_WS_PORT=8787                 # 可选
```

## REPL 命令

| 输入 | 说明 |
|---|---|
| 自然语言 | 交给 AI 秘书（需 LLM Key），如「回复产品群：收到」 |
| `/todos` | 查看未完成待办 |
| `/state` | 查看四属性快照 |
| `/rest` | 开始/结束休息（能量+心情加速恢复） |
| `/call <工具> <json>` | 直接调用工具，如 `/call complete_todo {"subject":"周报"}` |
| `/help` / `/quit` | 帮助 / 退出 |

可用工具：`list_todos`、`complete_todo`、`send_group_message`、`send_o2o_message`、`summarize_conversation`、`create_todo`。

## WebSocket 协议（P2）

server→client：`hello` / `state`（四属性快照）/ `game_event`（消息与待办变化）/ `todos` / `agent_card`（草稿/结果卡片）/ `notice`（升级、档位变化等）。

client→server：`action`（执行工具或 `rest_start`/`rest_stop`）、`confirm`（按 `requestId` 回复草稿确认）、`agent_chat`（自然语言）。

调试页提供属性条、待办列表、动作按钮、AI 输入框、草稿确认卡片与事件流，供 P3 前端开发前联调。

冒烟测试（后端运行时另开终端执行）：

```bash
node scripts/ws-smoke-test.mjs
```

## 游戏数值

数值全部外置在 `config/numbers.json`（设计文档第 6 章）。核心规则：

- 实际能量消耗 = 基础 × 心情系数（兴奋 0.8 / 疲惫·倦怠 1.2）× 专注折扣（满专注省 30%）
- 心情五档：兴奋 90+ / 开心 70+ / 平静 40+ / 疲惫 20+ / 倦怠 <20；倦怠档锁自动化类工具（总结、建待办），真实操作不受影响
- 待办临期/逾期持续小幅压心情；完成紧急待办立刻逆转（正反馈 > 负反馈）
- 钉钉侧直接完成的待办同样给奖励（忙碌不是惩罚）；每日收入有上限（防刷）
- 存档在 SQLite kv 表 `game_state_v1`，跨重启保留

## 安全设计

- 事件管线（consume/轮询）只产展示数据，与工具执行器物理隔离；钉钉文本永远不当指令执行。
- 所有写操作先出草稿预览，玩家确认（终端 `y` 或调试页按钮）才执行；执行记录写入 SQLite `audit` 表。
- 危险操作（撤回/删除/权限）不在工具层提供。

## 数据

- SQLite：`data/pixel-office.sqlite`（events / audit / kv）
- 待办快照：kv 表 `todo_snapshot_v1`；游戏存档：`game_state_v1`

## 环境注意

- **dws shim 直通模式**：在 QoderWork 代理会话内（环境中带 `DWS_SESSION_ID`、`QODERWORK_SOURCE_CHAT_ID` 等变量）spawn `dws` 时，shim 会输出"等待宿主执行"占位符而不真正执行。后端已在 spawn 时自动剥离 `DWS_/QWORK_/QODERWORK_` 前缀变量（`dwsSpawnEnv`），使 shim 走本地直通模式。从普通终端直接 `npm start` 不受影响。
- **残留订阅清理**：若后端被强制杀死（kill -9），可能残留 consume 消费者。用 `dws event status` 检查，必要时 `dws event stop --all --dry-run` 预览后加 `--yes` 清理。正常 SIGTERM/`/quit` 退出会自动退订。
- **只跑一个实例**：多实例会重复轮询、共享订阅造成混乱。启动前先 `pgrep -fl "dist/main.js"` 确认没有旧实例。
