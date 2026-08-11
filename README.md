# 像素办公室 · 本地后端（P1 最小闭环）

钉钉桥接 + AI 秘书的最小实现：实时监听群消息/@我/单聊，2 分钟轮询待办 diff，通过终端 REPL 用自然语言（或 `/call` 直调）回复消息、完成待办。

## 前置条件

- Node.js ≥ 20
- 已安装并登录 dws（`dws auth status` 检查）

## 安装与运行

```bash
npm install
npm run build
npm start
```

可选：配置 LLM 后启用自然语言模式（OpenAI 兼容接口）：

```bash
export PIXEL_LLM_API_KEY=sk-xxxx          # 或 DASHSCOPE_API_KEY
export PIXEL_LLM_MODEL=qwen-plus          # 可选
export PIXEL_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1  # 可选
```

## REPL 命令

| 输入 | 说明 |
|---|---|
| 自然语言 | 交给 AI 秘书（需 LLM Key），如「回复产品群：收到」 |
| `/todos` | 查看未完成待办 |
| `/call <工具> <json>` | 直接调用工具，如 `/call complete_todo {"subject":"周报"}` |
| `/help` / `/quit` | 帮助 / 退出 |

可用工具：`list_todos`、`complete_todo`、`send_group_message`、`send_o2o_message`、`summarize_conversation`、`create_todo`。

## 安全设计

- 事件管线（consume/轮询）只产展示数据，与工具执行器物理隔离；钉钉文本永远不当指令执行。
- 所有写操作先出草稿预览，玩家输入 `y` 才执行；执行记录写入 SQLite `audit` 表。
- 危险操作（撤回/删除/权限）不在工具层提供。

## 数据

- SQLite：`data/pixel-office.sqlite`（events / audit / kv）
- 待办快照：kv 表 `todo_snapshot_v1`

## 环境注意

- **dws shim 直通模式**：在 QoderWork 代理会话内（环境中带 `DWS_SESSION_ID`、`QODERWORK_SOURCE_CHAT_ID` 等变量）spawn `dws` 时，shim 会输出"等待宿主执行"占位符而不真正执行。后端已在 spawn 时自动剥离 `DWS_/QWORK_/QODERWORK_` 前缀变量（`dwsSpawnEnv`），使 shim 走本地直通模式。从普通终端直接 `npm start` 不受影响。
- **残留订阅清理**：若后端被强制杀死（kill -9），可能残留 consume 消费者。用 `dws event status` 检查，必要时 `dws event stop --all --dry-run` 预览后加 `--yes` 清理。正常 SIGTERM/`/quit` 退出会自动退订。
