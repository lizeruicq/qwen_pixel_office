/**
 * 通用像素风对话框组件（复用：打卡 / 喝咖啡 / 和同事聊天 等场景）。
 *
 * 提供三个能力，全部操作 #modal-root 下动态创建的 DOM：
 *  - confirmPanel({ image, text, yesText, noText }) → Promise<boolean>
 *      屏幕中央的确认面板：一张图 + 一段文案 + 是/否两个按钮。
 *  - rpgDialog({ portrait, text }) → Promise<void>
 *      底部 RPG 对话框：左侧头像 + 打字机文案，点击关闭。
 *  - 均为独立 Promise，可同时/连续调用；新调用会替换同类型的旧框。
 *
 * 样式集中在 injectStyles()，首次调用时注入，不依赖外部 CSS。
 */

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    .dlg-overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; }
    .dlg-panel {
      background: #1a1626; border: 4px solid #5e3a1e;
      box-shadow: 0 0 0 4px #2a1a0e, inset 0 0 0 4px #8d5f33;
      padding: 18px 16px; text-align: center; min-width: 220px; max-width: 84vw;
      font-family: ui-monospace, Menlo, monospace; color: #d8dee6;
    }
    .dlg-panel img { image-rendering: pixelated; display: block; margin: 0 auto 10px; }
    .dlg-text { font-size: 14px; margin-bottom: 14px; white-space: pre-wrap; line-height: 1.6; }
    .dlg-btns button {
      font-family: inherit; font-size: 13px; color: #d8dee6; background: #2a2e38; cursor: pointer;
      border: 2px solid #0b0d10; box-shadow: inset -2px -2px 0 rgba(0,0,0,.45), inset 2px 2px 0 rgba(255,255,255,.14);
      padding: 6px 18px; margin: 0 6px;
    }
    .dlg-btns button:active { box-shadow: inset 2px 2px 0 rgba(0,0,0,.45); }
    .dlg-btns button.primary { background: #316dca; }

    .dlg-rpg {
      position: fixed; left: 50%; bottom: clamp(48px, 9vh, 120px); transform: translateX(-50%); z-index: 40;
      width: min(1080px, 92vw); padding: 20px 24px; display: flex; align-items: center; gap: 20px; cursor: pointer;
      background: #1a1626; border: 4px solid #5e3a1e; box-shadow: 0 0 0 4px #2a1a0e, inset 0 0 0 4px #8d5f33;
      font-family: ui-monospace, Menlo, monospace; color: #d8dee6;
    }
    .dlg-rpg img { width: 96px; height: 96px; flex: 0 0 96px; image-rendering: pixelated; border: 2px solid #0b0d10; background: #2a2e38; }
    .dlg-rpg .dlg-rpg-text { font-size: 22px; line-height: 1.7; flex: 1; white-space: pre-wrap; }
    .dlg-rpg .dlg-rpg-text::after { content: ' ▼'; color: #8b949e; animation: dlg-blink 1s steps(2) infinite; }
    @keyframes dlg-blink { 50% { opacity: 0; } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

let panelEl = null;
let rpgEl = null;

/**
 * 屏幕中央确认面板。
 * @param {{ image?: string, text: string, yesText?: string, noText?: string }} opts
 * @returns {Promise<boolean>} 点“是” resolve(true)，点“否” resolve(false)
 */
export function confirmPanel({ image, text, yesText = '是的', noText = '不是' }) {
  injectStyles();
  if (panelEl) panelEl.remove();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dlg-overlay';
    const img = image ? `<img src="${image}" style="max-width:96px;max-height:96px" alt="">` : '';
    wrap.innerHTML = `
      <div class="dlg-panel">
        ${img}
        <div class="dlg-text"></div>
        <div class="dlg-btns">
          <button class="primary" data-act="yes">${yesText}</button>
          <button data-act="no">${noText}</button>
        </div>
      </div>`;
    wrap.querySelector('.dlg-text').textContent = text;
    const done = (val) => { wrap.remove(); if (panelEl === wrap) panelEl = null; resolve(val); };
    wrap.querySelector('[data-act="yes"]').onclick = () => done(true);
    wrap.querySelector('[data-act="no"]').onclick = () => done(false);
    document.body.appendChild(wrap);
    panelEl = wrap;
  });
}

/**
 * 底部 RPG 对话框（头像 + 文案，点击关闭）。
 * @param {{ portrait?: string, text: string }} opts
 * @returns {Promise<void>} 用户点击后 resolve
 */
export function rpgDialog({ portrait, text }) {
  injectStyles();
  if (rpgEl) rpgEl.remove();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dlg-rpg';
    const img = portrait ? `<img src="${portrait}" alt="">` : '';
    box.innerHTML = `${img}<div class="dlg-rpg-text"></div>`;
    box.querySelector('.dlg-rpg-text').textContent = text;
    box.onclick = () => { box.remove(); if (rpgEl === box) rpgEl = null; resolve(); };
    document.body.appendChild(box);
    rpgEl = box;
  });
}
