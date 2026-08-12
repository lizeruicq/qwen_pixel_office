/**
 * 头顶像素对话气泡（复用：同事闲聊吐槽 / 千仔事件提醒）。
 *
 * 用法：
 *   const bubble = createBubble();
 *   bubble.follow(sprite, camera);              // 每帧调用，跟随某个 Phaser 精灵头顶
 *   bubble.say('需求又改了…', 3200);            // 弹出文本，N 毫秒后自动消失
 *   bubble.hide();                              // 立即消失
 *
 * 实现：单个绝对定位 DOM，白底黑边 + 小尾巴，跟随目标精灵的世界坐标→屏幕坐标换算。
 * 同一时刻一个 bubble 实例只显示一条；重复 say 会替换文本并重置计时。
 */

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
    .px-bubble {
      position: fixed; z-index: 30; pointer-events: none;
      transform: translate(-50%, -100%);
      max-width: 180px; padding: 5px 8px;
      background: #fdfdf6; color: #20242c;
      border: 3px solid #20242c; border-radius: 6px;
      font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.4;
      text-align: center; word-break: break-word;
      box-shadow: 2px 2px 0 rgba(0,0,0,.35);
      opacity: 0; transition: opacity .15s ease;
      white-space: pre-wrap;
    }
    .px-bubble.show { opacity: 1; }
    /* 尾巴：两个三角叠出描边效果 */
    .px-bubble::before, .px-bubble::after {
      content: ''; position: absolute; left: 50%; transform: translateX(-50%);
      border-style: solid;
    }
    .px-bubble::before { bottom: -11px; border-width: 8px 6px 0; border-color: #20242c transparent transparent; }
    .px-bubble::after { bottom: -6px; border-width: 7px 5px 0; border-color: #fdfdf6 transparent transparent; }
    .px-bubble.qz { background: #35265c; color: #e3d8ff; border-color: #b39ddb; }
    .px-bubble.qz::before { border-color: #b39ddb transparent transparent; }
    .px-bubble.qz::after { border-color: #35265c transparent transparent; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * @param {{ qz?: boolean }} opts qz=true 用千仔紫色气泡
 */
export function createBubble({ qz = false } = {}) {
  injectStyles();
  const el = document.createElement('div');
  el.className = 'px-bubble' + (qz ? ' qz' : '');
  document.body.appendChild(el);

  let timer = null;
  let target = null;

  return {
    /** 每帧调用：跟随精灵头顶。sprite 需有 .x/.y（origin 0.5,1，y=脚底），camera 为 Phaser 主相机 */
    follow(sprite, camera) {
      if (!el.classList.contains('show')) return;
      target = sprite;
      if (!target) return;
      const rect = camera.scene.game.canvas.getBoundingClientRect();
      // 相机无 zoom 时，canvas 内像素 → 页面像素的缩放比就是 rect.width/camera.width
      const k = rect.width / camera.width;
      const sx = rect.left + (target.x - camera.scrollX) * k;
      // 头顶 = 脚底(target.y) 往上 ~26 世界像素（小人高 24），换算成页面像素再多留 4px
      const sy = rect.top + (target.y - 26 - camera.scrollY) * k - 4;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
    },
    /** 弹出文本，ms 后自动隐藏 */
    say(text, ms = 3000) {
      el.textContent = text;
      el.classList.add('show');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.hide(), ms);
    },
    hide() {
      el.classList.remove('show');
      if (timer) { clearTimeout(timer); timer = null; }
    },
    get visible() { return el.classList.contains('show'); },
    destroy() { this.hide(); el.remove(); },
  };
}
