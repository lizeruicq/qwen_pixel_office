/**
 * 右侧抽屉：消息 / 待办 / 事件 / 千仔 四面板。
 * - 消息：会话列表 + 历史/实时 + 快捷 AI 指令 + 回复（草稿确认）
 * - 待办：卡片 + 完成/评论（草稿确认条在抽屉级，任何工具通用）
 * - 事件：独立事件流（IM 事件 / 待办变化 / 通知 / AI 活动）
 * - 千仔：AI 对话 + 快捷指令（agent_chat）
 */
export function initPanels(socket) {
  const $ = (id) => document.getElementById(id);
  const drawer = $('drawer');
  let tab = 'messages';
  let curConv = null;
  let draftReq = null;
  let qzVisible = true; // 千仔是否可见（隐藏时不允许打开千仔面板）
  const convs = [];

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

  /* ---------- 抽屉 / tab ---------- */

  function setOpen(v) {
    drawer.classList.toggle('closed', !v);
    if (v) requestTabData();
  }

  function requestTabData() {
    if (tab === 'messages') socket.send({ type: 'panel', name: 'conversations' });
    else if (tab === 'tasks') socket.send({ type: 'panel', name: 'todos' });
  }

  function openTab(t) {
    if (t === 'secretary' && !qzVisible) t = 'tasks'; // 千仔隐藏时打不开千仔页，落到待办
    tab = t;
    for (const b of document.querySelectorAll('#drawer-tabs [data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === t);
    }
    for (const id of ['messages', 'tasks', 'events', 'secretary']) {
      $('pane-' + id).hidden = id !== t;
    }
    setOpen(true);
  }

  /* 千仔显隐（调试页控制）：隐藏时移除秘书 tab，若正开着则切走 */
  function setQzVisible(show) {
    qzVisible = show;
    const btn = document.querySelector('#drawer-tabs [data-tab="secretary"]');
    if (btn) btn.hidden = !show;
    if (!show && tab === 'secretary') setOpen(false);
  }

  for (const b of document.querySelectorAll('#drawer-tabs [data-tab]')) {
    b.onclick = () => openTab(b.dataset.tab);
  }
  $('drawer-close').onclick = () => setOpen(false);

  /* ---------- 通用草稿确认（任何写工具） ---------- */

  function showDraft(requestId, preview) {
    draftReq = requestId;
    $('draft-text').textContent = preview || '';
    $('draft-bar').hidden = false;
  }
  function hideDraft() {
    draftReq = null;
    $('draft-bar').hidden = true;
  }
  $('draft-ok').onclick = () => {
    if (draftReq) socket.send({ type: 'confirm', requestId: draftReq, approved: true });
    hideDraft();
  };
  $('draft-no').onclick = () => {
    if (draftReq) socket.send({ type: 'confirm', requestId: draftReq, approved: false });
    hideDraft();
  };

  /* ---------- 消息面板 ---------- */

  function renderConvs() {
    const box = $('conv-list');
    if (!convs.length) {
      box.innerHTML = '<span class="dim">暂无会话——钉钉里来消息后自动出现。</span>';
      return;
    }
    box.innerHTML = convs
      .map((c) => `<button class="conv ${c.id === curConv ? 'active' : ''}" data-id="${c.id}">${esc(c.title)} <span class="dim">${c.count}</span></button>`)
      .join('');
    for (const b of box.querySelectorAll('.conv')) {
      b.onclick = () => {
        curConv = b.dataset.id;
        renderConvs();
        socket.send({ type: 'panel', name: 'messages', convId: curConv });
      };
    }
  }

  function addMsgLine(m) {
    const list = $('msg-list');
    const empty = list.querySelector('.dim');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<span class="who">${esc(m.sender)}</span>${esc(m.text)}`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }

  function renderMessages(items) {
    const list = $('msg-list');
    list.innerHTML = items.length ? '' : '<div class="dim">最近 8 小时暂无消息。</div>';
    for (const m of items) addMsgLine(m);
  }

  function sendReply() {
    const el = $('msg-input');
    const text = el.value.trim();
    if (!text || !curConv) return;
    socket.send({ type: 'action', name: 'send_group_message', params: { group: curConv, text } });
    el.value = '';
  }
  $('msg-send').onclick = sendReply;
  $('msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendReply();
  });

  /* ---------- 快捷 AI 指令（消息面板已不需要 AI，保留秘书面板的快捷指令） ---------- */

  const aiChat = (text) => {
    socket.send({ type: 'agent_chat', text });
    addEvent('ai', `你 → 千仔：${text}`);
  };

  const SEC_QUICK = [
    ['查看待办', '查看我的待办'],
    ['处理待办', '帮我处理第一条未完成待办'],
    ['新建待办', '帮我新建一条待办：'],
    ['读文档', '帮我读一下这篇文档的内容并总结：'],
    ['写文档', '帮我新建一篇文档，标题是「」，内容是：'],
    ['写日报', '帮我写今天的日报，今天主要做了：'],
  ];
  $('sec-quick').innerHTML = SEC_QUICK.map(([label], i) => `<button data-i="${i}">${label}</button>`).join('');
  for (const b of $('sec-quick').querySelectorAll('button')) {
    b.onclick = () => {
      if (secBusy) return; // 思考中不覆盖输入
      const el = $('sec-input');
      el.value = SEC_QUICK[Number(b.dataset.i)][1];
      el.focus();
      // 光标移到末尾，方便接着补内容
      el.setSelectionRange(el.value.length, el.value.length);
    };
  }

  /* ---------- 千仔：思考中锁定 / 取消中断 ---------- */
  let secBusy = false;

  function setSecBusy(v) {
    secBusy = v;
    const input = $('sec-input');
    const btn = $('sec-send');
    input.disabled = v;
    input.placeholder = v ? '千仔正在思考中…' : '让千仔来帮忙…（Enter 发送）';
    btn.textContent = v ? '取消' : '发送';
    btn.classList.toggle('primary', !v);
  }

  function sendSec() {
    const el = $('sec-input');
    const text = el.value.trim();
    if (!text) return;
    addChatRow('me', text);
    aiChat(text);
    el.value = '';
    setSecBusy(true);
  }
  $('sec-send').onclick = () => {
    if (secBusy) {
      socket.send({ type: 'agent_cancel' });
      // 不等后端回包，立即解锁（后端 done 到达时再确保一次）
      setSecBusy(false);
      addChatRow('qz', '（已取消）', true);
    } else {
      sendSec();
    }
  };
  $('sec-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !secBusy) sendSec();
  });

  /* 千仔聊天窗气泡：who = 'me' | 'qz' */
  function addChatRow(who, text, dimm = false) {
    const log = $('sec-log');
    const row = document.createElement('div');
    row.className = `chat-row ${who}`;
    const label = who === 'me' ? '我' : '千仔';
    row.innerHTML = `<div class="avatar ${who}"></div><div class="bubble">${dimm ? '<span class="dim">' : ''}${esc(text)}${dimm ? '</span>' : ''}</div>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    if (who === 'qz') $('ai-line').textContent = `千仔：${text}`;
  }

  /* ---------- 待办面板 ---------- */

  function renderTasks(items) {
    const box = $('task-list');
    if (!items.length) {
      box.innerHTML = '<div class="dim">没有未完成待办。</div>';
      return;
    }
    const color = { 10: '#8b949e', 20: '#6cb6ff', 30: '#dc8850', 40: '#f47067' };
    box.innerHTML = items
      .map(
        (t) => `<div class="task" style="border-left-color:${color[t.priority] || '#fff'}">
          <div class="t-sub">${esc(t.subject)}</div>
          <div class="t-meta">优先级 ${t.priority}${t.dueTime ? ' · 截止 ' + new Date(t.dueTime).toLocaleString('zh-CN') : ''}</div>
          <div class="t-ops"><button data-op="done" data-id="${t.taskId}">完成</button><button data-op="comment" data-id="${t.taskId}">评论</button></div>
        </div>`,
      )
      .join('');
    for (const b of box.querySelectorAll('button')) {
      b.onclick = () => {
        if (b.dataset.op === 'done') {
          socket.send({ type: 'action', name: 'complete_todo', params: { taskId: b.dataset.id } });
        } else {
          const c = prompt('评论内容：');
          if (c) socket.send({ type: 'action', name: 'comment_todo', params: { taskId: b.dataset.id, content: c } });
        }
      };
    }
  }
  $('task-refresh').onclick = () => socket.send({ type: 'panel', name: 'todos' });

  /* ---------- 事件流面板 ---------- */

  function addEvent(kind, text) {
    const list = $('event-list');
    const div = document.createElement('div');
    div.className = 'ev';
    div.innerHTML = `<span class="t">${now()}</span><span class="k ${kind}">${kind}</span>${esc(text)}`;
    list.appendChild(div);
    while (list.children.length > 200) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  /* ---------- WS 消息分发 ---------- */

  function handleWs(msg) {
    switch (msg.type) {
      case 'conversations':
        convs.length = 0;
        convs.push(...msg.items);
        if (!curConv && convs.length) {
          curConv = convs[0].id;
          socket.send({ type: 'panel', name: 'messages', convId: curConv });
        }
        renderConvs();
        break;
      case 'messages':
        if (msg.convId === curConv) renderMessages(msg.items);
        break;
      case 'game_event': {
        const p = msg.payload || {};
        if (msg.kind === 'group_msg' || msg.kind === 'at_me' || msg.kind === 'o2o_msg') {
          addEvent(msg.kind, `${p.sender ?? '?'}：${p.text ?? ''}`);
          if (p.conversationId === curConv && !drawer.classList.contains('closed') && tab === 'messages') {
            addMsgLine({ sender: p.sender || '?', text: p.text || '' });
          }
        } else if (msg.kind.startsWith('action_')) {
          const notes = Array.isArray(p.notes) && p.notes.length ? `（${p.notes.join('；')}）` : '';
          addEvent('action', `${p.text ?? '操作'}${notes}`);
        } else {
          addEvent(msg.kind, p.subject ?? '');
        }
        break;
      }
      case 'notice':
        addEvent('notice', msg.text);
        break;
      case 'action_result': // 直连工具操作（回复/完成/评论待办等）→ 进事件流，不进千仔聊天
        addEvent('action', `[${msg.status}] ${msg.text ?? ''}`);
        break;
      case 'todos':
        renderTasks(msg.items);
        break;
      case 'agent_card':
        if (msg.stage === 'draft') {
          showDraft(msg.requestId, msg.preview);
        } else if (msg.stage === 'tool') {
          addChatRow('qz', `🔧 ${msg.tool} ${msg.text ?? ''}`, true);
        } else if (msg.stage === 'result') {
          addChatRow('qz', msg.text ?? '');
          setSecBusy(false);
        } else if (msg.stage === 'done') {
          setSecBusy(false);
        }
        break;
    }
  }

  return { openTab, handleWs, setOpen, setQzVisible };
}
