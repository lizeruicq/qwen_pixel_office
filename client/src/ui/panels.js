/**
 * 右侧抽屉：消息 / 待办 / 事件 / 秘书 四面板。
 * - 消息：会话列表 + 历史/实时 + 快捷 AI 指令 + 回复（草稿确认）
 * - 待办：卡片 + 完成/评论（草稿确认条在抽屉级，任何工具通用）
 * - 事件：独立事件流（IM 事件 / 待办变化 / 通知 / AI 活动）
 * - 秘书：AI 对话 + 快捷指令（agent_chat）
 */
export function initPanels(socket) {
  const $ = (id) => document.getElementById(id);
  const drawer = $('drawer');
  let tab = 'messages';
  let curConv = null;
  let draftReq = null;
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
    tab = t;
    for (const b of document.querySelectorAll('#drawer-tabs [data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === t);
    }
    for (const id of ['messages', 'tasks', 'events', 'secretary']) {
      $('pane-' + id).hidden = id !== t;
    }
    setOpen(true);
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

  /* ---------- 快捷 AI 指令 ---------- */

  const aiChat = (text) => {
    socket.send({ type: 'agent_chat', text });
    addEvent('ai', `你 → 秘书：${text}`);
  };

  $('msg-quick').innerHTML = ['总结本群', '起草回复']
    .map((t) => `<button data-q="${t}">${t}</button>`)
    .join('');
  for (const b of $('msg-quick').querySelectorAll('button')) {
    b.onclick = () => {
      const c = convs.find((x) => x.id === curConv);
      if (!c) {
        $('ai-line').textContent = '尚未选中会话——钉钉里来消息后自动出现。';
        return;
      }
      if (b.dataset.q === '总结本群') {
        aiChat(`总结群「${c.title}」（会话 ID ${c.id}）最近的消息`);
      } else {
        aiChat(`会话 ID ${c.id}（「${c.title}」）。读最近几条消息后，以我的口吻起草一条回复；不要直接发送，调用发送工具走我的确认。`);
      }
    };
  }

  const SEC_QUICK = [
    ['查看待办', '查看我的待办'],
    ['处理待办', '帮我处理第一条未完成待办'],
    ['新建待办', '帮我新建一条待办'],
    ['最近会话', '列出最近会话'],
  ];
  $('sec-quick').innerHTML = SEC_QUICK.map(([label], i) => `<button data-i="${i}">${label}</button>`).join('');
  for (const b of $('sec-quick').querySelectorAll('button')) {
    b.onclick = () => aiChat(SEC_QUICK[Number(b.dataset.i)][1]);
  }

  function sendSec() {
    const el = $('sec-input');
    const text = el.value.trim();
    if (!text) return;
    aiChat(text);
    el.value = '';
  }
  $('sec-send').onclick = sendSec;
  $('sec-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSec();
  });

  function addSecLine(kind, text) {
    const log = $('sec-log');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<span class="ev"><span class="t">${now()}</span><span class="k ai">${kind}</span>${esc(text)}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    $('ai-line').textContent = `${kind}：${text}`;
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
      case 'todos':
        renderTasks(msg.items);
        break;
      case 'agent_card':
        if (msg.stage === 'draft') {
          showDraft(msg.requestId, msg.preview);
        } else if (msg.stage === 'tool') {
          addSecLine('tool', `${msg.tool} ${msg.text ?? ''}`);
        } else if (msg.stage === 'result') {
          addSecLine('ai', msg.text ?? '');
        }
        break;
    }
  }

  return { openTab, handleWs, setOpen };
}
