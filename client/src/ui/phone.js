/**
 * 像素手机界面（调试页控制开关，对话内容可由调试页推送）。
 *
 * 外观：窗口右下角滑入的一台竖屏手机（圆角机身 + 刘海 + Home 条），屏幕内是一个
 * 极简聊天 App —— 对话列表（老板 / 小美）→ 点进某条进入聊天页。
 *
 * API：
 *   const phone = createPhone();
 *   phone.setVisible(true);                 // 滑入 / 滑出
 *   phone.push('boss', '今晚把方案发我');    // 往某个联系人塞一条消息（红点 + 列表置顶）
 *
 * 纯 DOM 实现，挂在 body 上，与 Phaser 场景叠放。样式集中在 injectStyles()。
 */

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    .px-phone {
      position: fixed; right: 18px; bottom: 0; z-index: 35;
      width: 240px; height: 430px;
      transform: translateY(calc(100% + 24px)); transition: transform .35s cubic-bezier(.2,.9,.3,1.15);
      font-family: ui-monospace, Menlo, monospace; color: #d8dee6;
      image-rendering: pixelated;
    }
    .px-phone.open { transform: translateY(0); }
    /* 机身 */
    .px-phone .body {
      position: absolute; inset: 0; background: #101216;
      border: 3px solid #2a2e38; border-bottom: none;
      border-radius: 22px 22px 0 0;
      box-shadow: 0 0 0 2px #05070a, 0 -6px 24px rgba(0,0,0,.5);
      display: flex; flex-direction: column; overflow: hidden;
    }
    /* 刘海 */
    .px-phone .notch {
      height: 18px; flex: 0 0 18px; display: flex; align-items: center; justify-content: center;
      background: #101216;
    }
    .px-phone .notch::before { content: ''; width: 64px; height: 8px; background: #05070a; border-radius: 4px; }
    /* 屏幕 */
    .px-phone .screen {
      flex: 1; margin: 0 8px; background: #161a22; border: 2px solid #05070a;
      border-radius: 6px 6px 0 0; display: flex; flex-direction: column; overflow: hidden;
    }
    /* Home 条 */
    .px-phone .home { height: 14px; flex: 0 0 14px; display: flex; align-items: center; justify-content: center; }
    .px-phone .home::before { content: ''; width: 70px; height: 4px; background: #3d4451; border-radius: 2px; }

    /* 状态栏 + 标题栏 */
    .px-phone .statusbar { display: flex; justify-content: space-between; padding: 3px 8px; font-size: 9px; color: #8b949e; background: #10131a; }
    .px-phone .titlebar {
      display: flex; align-items: center; gap: 6px; padding: 8px 10px;
      background: #1d222c; border-bottom: 2px solid #05070a; font-size: 13px; font-weight: bold;
    }
    .px-phone .back { cursor: pointer; color: #6cb6ff; font-size: 13px; padding: 0 4px; user-select: none; }
    .px-phone .back[hidden] { display: none; }

    /* 对话列表 */
    .px-phone .conv-list { flex: 1; overflow-y: auto; }
    .px-phone .conv {
      display: flex; align-items: center; gap: 8px; padding: 9px 10px; cursor: pointer;
      border-bottom: 1px solid #232833;
    }
    .px-phone .conv:hover { background: #1d222c; }
    .px-phone .avatar {
      width: 30px; height: 30px; flex: 0 0 30px; border-radius: 6px; border: 2px solid #05070a;
      display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;
    }
    .px-phone .avatar.boss { background: #5c1f24; color: #f47067; }
    .px-phone .avatar.xiaomei { background: #35265c; color: #b39ddb; }
    .px-phone .conv-main { flex: 1; min-width: 0; }
    .px-phone .conv-name { font-size: 12px; margin-bottom: 2px; }
    .px-phone .conv-preview { font-size: 10px; color: #8b949e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .px-phone .badge {
      min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: #f47067; color: #fff;
      font-size: 9px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
    }
    .px-phone .badge[hidden] { display: none; }

    /* 聊天页 */
    .px-phone .chat-log { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .px-phone .msg { max-width: 82%; padding: 5px 8px; font-size: 11px; line-height: 1.4; border: 2px solid #05070a; border-radius: 4px; word-break: break-word; }
    .px-phone .msg.them { align-self: flex-start; background: #2a2e38; }
    .px-phone .msg.them.boss { background: #43341c; }
    .px-phone .msg.them.xiaomei { background: #35265c; }
    .px-phone .empty { color: #636e7b; font-size: 11px; text-align: center; margin-top: 20px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

const CONTACTS = {
  boss: { name: '老板', avatar: 'boss', label: '老' },
  xiaomei: { name: '小美', avatar: 'xiaomei', label: '美' },
};

export function createPhone() {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'px-phone';
  root.innerHTML = `
    <div class="body">
      <div class="notch"></div>
      <div class="screen">
        <div class="statusbar"><span>9:41</span><span>📶 🔋</span></div>
        <div class="titlebar"><span class="back" hidden>‹</span><span class="title">消息</span></div>
        <div class="conv-list"></div>
        <div class="chat-log" hidden></div>
      </div>
      <div class="home"></div>
    </div>`;
  document.body.appendChild(root);

  const backBtn = root.querySelector('.back');
  const titleEl = root.querySelector('.title');
  const listEl = root.querySelector('.conv-list');
  const chatEl = root.querySelector('.chat-log');

  // 每个联系人的消息记录 + 未读数
  const threads = { boss: { msgs: [], unread: 0 }, xiaomei: { msgs: [], unread: 0 } };
  let open = null; // 当前打开的联系人 key，null=列表页

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function renderList() {
    listEl.innerHTML = '';
    for (const key of ['boss', 'xiaomei']) {
      const c = CONTACTS[key];
      const th = threads[key];
      const last = th.msgs[th.msgs.length - 1];
      const row = document.createElement('div');
      row.className = 'conv';
      row.innerHTML = `
        <div class="avatar ${c.avatar}">${c.label}</div>
        <div class="conv-main">
          <div class="conv-name">${c.name}</div>
          <div class="conv-preview">${last ? esc(last.text) : '暂无消息'}</div>
        </div>
        <div class="badge" ${th.unread ? '' : 'hidden'}>${th.unread}</div>`;
      row.onclick = () => openChat(key);
      listEl.appendChild(row);
    }
  }

  function renderChat() {
    chatEl.innerHTML = '';
    const th = threads[open];
    if (!th.msgs.length) {
      chatEl.innerHTML = '<div class="empty">还没有消息</div>';
      return;
    }
    for (const m of th.msgs) {
      const div = document.createElement('div');
      div.className = `msg them ${open}`;
      div.textContent = m.text;
      chatEl.appendChild(div);
    }
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function openChat(key) {
    open = key;
    threads[key].unread = 0;
    titleEl.textContent = CONTACTS[key].name;
    backBtn.hidden = false;
    listEl.hidden = true;
    chatEl.hidden = false;
    renderChat();
  }

  function closeChat() {
    open = null;
    titleEl.textContent = '消息';
    backBtn.hidden = true;
    chatEl.hidden = true;
    listEl.hidden = false;
    renderList();
  }

  backBtn.onclick = closeChat;
  renderList();

  return {
    setVisible(show) {
      root.classList.toggle('open', show);
    },
    get visible() { return root.classList.contains('open'); },
    /** 往某个联系人塞一条消息；若在列表页或未读则红点+1，正开着该聊天则直接显示 */
    push(from, text) {
      if (!threads[from]) return;
      threads[from].msgs.push({ text, ts: Date.now() });
      if (open === from) {
        renderChat();
      } else {
        threads[from].unread += 1;
        if (!open) renderList(); // 列表页实时刷新预览+红点
      }
    },
    destroy() { root.remove(); },
  };
}
