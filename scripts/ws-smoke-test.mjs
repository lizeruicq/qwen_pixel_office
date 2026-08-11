/**
 * P2 WS 冒烟测试：验证协议、草稿确认往返、数值结算。
 * 用法：先启动后端（npm start），再 `node scripts/ws-smoke-test.mjs`。
 */
import WebSocket from 'ws';

const PORT = process.env.PIXEL_WS_PORT || 8787;
const ws = new WebSocket(`ws://localhost:${PORT}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (obj) => ws.send(JSON.stringify(obj));
const log = (s) => console.log(`[client] ${s}`);

const seen = { types: {}, maxCoins: -1, maxXp: -1, sawResting: false, sawWorking: false, completedToday: 0 };
let failures = 0;
const check = (cond, name) => {
  if (cond) log(`✓ ${name}`);
  else {
    failures += 1;
    log(`✗ ${name}`);
  }
};

ws.on('error', (e) => {
  console.error('[client] 连接失败:', String(e));
  process.exit(1);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  seen.types[msg.type] = (seen.types[msg.type] ?? 0) + 1;
  switch (msg.type) {
    case 'hello':
      log('hello 收到');
      break;
    case 'state': {
      const s = msg.state;
      seen.maxCoins = Math.max(seen.maxCoins, s.coins);
      seen.maxXp = Math.max(seen.maxXp, s.xp);
      seen.completedToday = Math.max(seen.completedToday, s.completedToday);
      if (s.resting) seen.sawResting = true;
      else seen.sawWorking = true;
      log(`state: 能量 ${s.energy}/${s.energyCap} 心情 ${s.mood}(${s.moodTier}) 专注 ${s.focus} 金币 ${s.coins} XP ${s.xp} 休息=${s.resting}`);
      break;
    }
    case 'todos':
      log(`todos: ${msg.items.length} 条`);
      break;
    case 'game_event':
      log(`event ${msg.kind}: ${JSON.stringify(msg.payload).slice(0, 90)}`);
      break;
    case 'agent_card':
      if (msg.stage === 'draft') {
        log(`草稿确认: ${String(msg.preview).replace(/\n/g, ' | ')}`);
        send({ type: 'confirm', requestId: msg.requestId, approved: true });
      } else {
        log(`卡片[${msg.stage}] ${msg.tool || ''}: ${msg.text}`);
      }
      break;
    case 'notice':
      log(`通知: ${msg.text}`);
      break;
  }
});

ws.on('open', async () => {
  log(`已连接 ws://localhost:${PORT}`);
  await sleep(600);

  log('→ action list_todos');
  send({ type: 'action', name: 'list_todos' });
  await sleep(2000);

  log('→ action create_todo（P2冒烟测试待办, 优先级40）');
  send({ type: 'action', name: 'create_todo', params: { title: 'P2冒烟测试待办', priority: 40 } });
  await sleep(4000);

  log('→ action complete_todo（模糊匹配标题）');
  send({ type: 'action', name: 'complete_todo', params: { subject: 'P2冒烟测试待办' } });
  await sleep(4500);

  log('→ action rest_start / rest_stop');
  send({ type: 'action', name: 'rest_start' });
  await sleep(1500);
  send({ type: 'action', name: 'rest_stop' });
  await sleep(1500);

  log('—— 断言 ——');
  check((seen.types.hello ?? 0) >= 1, '收到 hello');
  check((seen.types.state ?? 0) >= 2, '收到 state 推送');
  check((seen.types.todos ?? 0) >= 1, '收到 todos 推送');
  check(seen.maxCoins >= 35, `完成紧急待办后金币 ≥35（每日开工5 + 完成30），实际 ${seen.maxCoins}`);
  check(seen.maxXp >= 10, `完成待办获得 XP ≥10，实际 ${seen.maxXp}`);
  check(seen.completedToday >= 1, `今日完成数 ≥1，实际 ${seen.completedToday}`);
  check(seen.sawResting, 'rest_start 后状态为休息中');
  check(seen.sawWorking, 'rest_stop 后状态恢复工作中');

  ws.close();
  log(failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
});
