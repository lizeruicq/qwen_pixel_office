import Phaser from 'phaser';
import {
  TILE, MAP, T, floorLayout, OBJECTS, FOOTPRINTS, HOTSPOTS, WALK_BOUNDS, SPAWN, GLOWS, PANEL_TRIGGERS, TIME_CLOCK,
} from './config/scene.js';
import { GameSocket } from './net/ws.js';
import { initPanels } from './ui/panels.js';

const W = MAP.cols * TILE; // 352
const H = MAP.rows * TILE; // 224
const SPEED = 90;
const IDLE_FRAME = { down: 0, up: 3, right: 6, left: 9 };
const QZ_SPEED = 40; // 千仔移动更慢
const QZ_REGIONS = [
  { x1: 140, y1: 90, x2: 220, y2: 190 }, // 中央空地
  { x1: 40, y1: 170, x2: 120, y2: 196 }, // 左下白板前
  { x1: 230, y1: 150, x2: 310, y2: 196 }, // 休息区
];

const $ = (id) => document.getElementById(id);

class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
  }

  preload() {
    this.load.image('tileset', '/assets/tileset.png');
    this.load.spritesheet('player', '/assets/player.png', { frameWidth: 16, frameHeight: 24 });
    this.load.spritesheet('player_typing', '/assets/player_typing.png', { frameWidth: 16, frameHeight: 24 });
    this.load.spritesheet('qianzai', '/assets/qianzai.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('glow', '/assets/glow.png');
    this.load.image('glow_blue', '/assets/glow_blue.png');
    this.load.image('dust', '/assets/dust.png');
    for (const o of OBJECTS) this.load.image('obj_' + o.key, `/assets/objects/${o.key}.png`);
  }

  create() {
    // ---------- 地板/墙：从 tileset 烘焙单张纹理 ----------
    const src = this.textures.get('tileset').getSourceImage();
    const canvas = this.textures.createCanvas('floor', W, H);
    const ctx = canvas.getContext();
    const layout = floorLayout();
    for (let r = 0; r < MAP.rows; r++) {
      for (let c = 0; c < MAP.cols; c++) {
        const t = layout[r][c];
        ctx.drawImage(src, (t % 8) * TILE, Math.floor(t / 8) * TILE, TILE, TILE, c * TILE, r * TILE, TILE, TILE);
      }
    }
    canvas.refresh();
    this.add.image(0, 0, 'floor').setOrigin(0, 0).setDepth(0);

    // ---------- 光晕 ----------
    for (const [gx, gy, kind] of GLOWS) {
      const g = this.add.image(gx, gy, kind === 'cool' ? 'glow_blue' : 'glow')
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45).setDepth(1);
      this.tweens.add({
        targets: g, alpha: { from: 0.3, to: 0.55 },
        duration: 2000 + Math.random() * 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // ---------- 漂浮尘埃 ----------
    this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: W }, y: { min: 0, max: H },
      lifespan: 9000, speedX: { min: -3, max: 3 }, speedY: { min: -6, max: -2 },
      quantity: 1, frequency: 600, alpha: { start: 0.5, end: 0 }, scale: { min: 0.6, max: 1.2 },
    }).setDepth(900);

    // ---------- 小人动画 ----------
    const dirs = ['down', 'up', 'right', 'left'];
    for (let i = 0; i < dirs.length; i++) {
      this.anims.create({
        key: 'walk-' + dirs[i],
        frames: this.anims.generateFrameNumbers('player', { frames: [i * 3, i * 3 + 1, i * 3, i * 3 + 2] }),
        frameRate: 7, repeat: -1,
      });
    }
    this.anims.create({
      key: 'type', frames: this.anims.generateFrameNumbers('player_typing', { start: 0, end: 1 }),
      frameRate: 3, repeat: -1,
    });
    for (let i = 0; i < dirs.length; i++) {
      this.anims.create({
        key: 'qz-walk-' + dirs[i],
        frames: this.anims.generateFrameNumbers('qianzai', { frames: [i * 3, i * 3 + 1, i * 3, i * 3 + 2] }),
        frameRate: 5, repeat: -1,
      });
    }

    // ---------- 物件对象层（y-sort + 碰撞） ----------
    const furniture = this.physics.add.staticGroup();
    for (const o of OBJECTS) {
      const spr = furniture.create(o.x, o.y, 'obj_' + o.key).setOrigin(0.5, 1).setDepth(o.y);
      spr.refreshBody();
      const fp = FOOTPRINTS[o.key];
      spr.body.setSize(fp[0], fp[1], false);
      spr.body.setOffset((spr.width - fp[0]) / 2, spr.height - fp[1]);
    }

    // ---------- 玩家小人 ----------
    this.char = this.physics.add.sprite(SPAWN.x, SPAWN.y, 'player').setOrigin(0.5, 1);
    this.char.body.setSize(10, 8);
    this.char.body.setOffset(3, 15);
    this.char.setCollideWorldBounds(true);
    this.char.setData('dir', 'down');
    this.char.setDepth(SPAWN.y);
    this.physics.world.setBounds(0, 0, W, H);
    this.physics.add.collider(this.char, furniture);

    this.mainTarget = null;
    this.nextWanderAt = this.time.now + 3000;

    // ---------- 千仔（吉祥物）：自主慢速漫步，点击它打开秘书面板 ----------
    this.qz = this.add.sprite(180, 130, 'qianzai').setOrigin(0.5, 1);
    this.qz.setData('dir', 'down');
    this.qz.setDepth(130);
    this.qzTarget = null;
    this.qzNextWanderAt = this.time.now + 2000;

    // 点击地板走过去
    this.input.on('pointerdown', (p) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      for (const t of PANEL_TRIGGERS) {
        if (wp.x >= t.x - t.w / 2 && wp.x <= t.x + t.w / 2 && wp.y >= t.y - t.h && wp.y <= t.y) {
          this.panels?.openTab(t.tab);
          return;
        }
      }
      // 点击千仔 → 秘书面板（玩家不被控制移动）
      if (Math.abs(wp.x - this.qz.x) <= 10 && wp.y <= this.qz.y + 2 && wp.y >= this.qz.y - 18) {
        this.panels?.openTab('secretary');
        return;
      }
      // 点击打卡机 → 玩家走到打卡机前，到位后打开打卡面板
      const tc = TIME_CLOCK;
      if (wp.x >= tc.x - tc.w / 2 && wp.x <= tc.x + tc.w / 2 && wp.y >= tc.y - tc.h && wp.y <= tc.y) {
        this.punchPending = true;
        this.mainTarget = { x: tc.standX, y: tc.standY };
        return;
      }
      this.mainTarget = {
        x: Phaser.Math.Clamp(wp.x, WALK_BOUNDS.minX, WALK_BOUNDS.maxX),
        y: Phaser.Math.Clamp(wp.y, WALK_BOUNDS.minY, WALK_BOUNDS.maxY),
      };
    });

    // ---------- WebSocket ----------
    const wsUrl = new URLSearchParams(location.search).get('ws') || 'ws://localhost:8787';
    this.socket = new GameSocket(wsUrl, {
      onStatus: (ok) => {
        this.wsOk = ok;
        this.renderHud();
      },
      onMessage: (m) => this.onWs(m),
    });
    this.state = { energy: 100, energyCap: 100, mood: 70, focus: 50, coins: 0, level: 1, moodTier: '开心' };
    this.renderHud();

    // ---------- 抽屉面板 ----------
    this.panels = initPanels(this.socket);
    const autoPanel = new URLSearchParams(location.search).get('panel');
    if (['tasks', 'messages', 'events', 'secretary'].includes(autoPanel)) this.panels.openTab(autoPanel);

    // ---------- 打卡机 ----------
    this.punchPending = false;
    $('punch-no').onclick = () => this.closePunch();
    $('punch-yes').onclick = () => this.doPunch();
    $('rpg-box').onclick = () => { $('rpg-box').hidden = true; };
  }

  /* ---------- 打卡 ---------- */

  /* 当前游戏内时间（毫秒），优先用时钟广播，离线退回本地 */
  gameNow() {
    return this.clockInfo ? this.clockInfo.now + (performance.now() - this.clockInfo.at) : Date.now();
  }

  /* 时段判定：返回 'in' 上班 / 'out' 下班 / null 不可打卡 */
  punchWindow() {
    const d = new Date(this.gameNow());
    const mins = d.getHours() * 60 + d.getMinutes();
    if (mins >= 9 * 60 && mins < 9 * 60 + 30) return 'in';   // 09:00–09:30
    if (mins >= 18 * 60) return 'out';                        // 18:00–24:00
    return null;
  }

  openPunch() {
    const w = this.punchWindow();
    const text = $('punch-text');
    if (w === 'in') text.textContent = '要打卡上班吗？';
    else if (w === 'out') text.textContent = '要打卡下班吗？';
    else text.textContent = '现在不是打卡时间。';
    $('punch-yes').style.display = w ? '' : 'none';
    $('punch-panel').hidden = false;
  }

  closePunch() {
    $('punch-panel').hidden = true;
  }

  doPunch() {
    const w = this.punchWindow();
    this.closePunch();
    if (!w) return;
    const portrait = $('rpg-portrait');
    const text = $('rpg-text');
    if (w === 'in') {
      portrait.src = '/assets/portrait_happy.png';
      text.textContent = '打卡成功，开始一天的工作！';
    } else {
      portrait.src = '/assets/portrait_normal.png';
      text.textContent = '打卡下班，总觉得还有些事没做完…';
    }
    $('rpg-box').hidden = false;
  }

  /* ---------- UI ---------- */

  renderHud() {
    const s = this.state;
    $('f-energy').style.width = `${Math.min(100, (s.energy / s.energyCap) * 100)}%`;
    $('f-mood').style.width = `${Math.min(100, s.mood)}%`;
    $('f-focus').style.width = `${Math.min(100, s.focus)}%`;
    $('v-energy').textContent = `${Math.round(s.energy)}/${s.energyCap}`;
    $('v-mood').textContent = Math.round(s.mood);
    $('v-focus').textContent = Math.round(s.focus);
    $('v-coins').textContent = s.coins;
    $('v-level').textContent = s.level;
    $('v-tier').textContent = s.moodTier;
    $('v-off').textContent = this.wsOk ? '' : ' ｜ 离线';
  }

  onWs(msg) {
    this.panels?.handleWs(msg);
    switch (msg.type) {
      case 'state':
        this.floatDelta(msg.state);
        this.state = msg.state;
        this.renderHud();
        break;
      case 'todos':
        this.todoCount = msg.items.length;
        break;
      case 'time':
        this.clockInfo = { now: msg.now, phase: msg.phase, mode: msg.mode, at: performance.now() };
        this.renderClock();
        break;
    }
  }

  /* 时间组件：服务端每 5s 广播基准，期间本地插值让秒针平滑 */
  renderClock() {
    const c = this.clockInfo;
    if (!c) return;
    const cur = c.now + (performance.now() - c.at);
    const d = new Date(cur);
    const p = (n) => String(n).padStart(2, '0');
    const clockEl = $('v-clock');
    const phaseEl = $('v-phase');
    if (clockEl) clockEl.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    if (phaseEl) {
      phaseEl.textContent = c.phase;
      phaseEl.className = `phase-${c.phase}`;
    }
    const modeEl = $('v-clock-mode');
    if (modeEl) modeEl.textContent = c.mode === 'manual' ? '⏱人工' : '';
  }

  /* 对比上一帧 state，属性变化时在 HUD 对应行飘出数字（增=红，减=灰） */
  floatDelta(next) {
    const prev = this.state;
    if (!prev) return;
    const keys = ['energy', 'mood', 'focus', 'coins'];
    for (const key of keys) {
      const d = next[key] - prev[key];
      if (!d || Math.abs(d) < 0.05) continue;
      // 能量/心情/专注定位到各自 bar；金币等定位到 meta 行
      const host = $(`f-${key}`)?.closest('.bar') || $('meta') || $('hud');
      const el = document.createElement('span');
      el.className = `float-num ${d > 0 ? 'up' : 'down'}`;
      el.textContent = `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    }
  }

  /* ---------- 循环 ---------- */

  update(_time, delta) {
    // 闲逛
    if (!this.mainTarget && this.time.now >= this.nextWanderAt) {
      const spot = HOTSPOTS[Phaser.Math.Between(0, HOTSPOTS.length - 1)];
      this.mainTarget = {
        x: Phaser.Math.Clamp(spot.x + Phaser.Math.Between(-16, 16), WALK_BOUNDS.minX, WALK_BOUNDS.maxX),
        y: Phaser.Math.Clamp(spot.y + Phaser.Math.Between(-8, 8), WALK_BOUNDS.minY, WALK_BOUNDS.maxY),
      };
    }

    // 时钟每秒本地插值刷新一次
    if (!this._clockTickAt || this.time.now - this._clockTickAt >= 1000) {
      this._clockTickAt = this.time.now;
      this.renderClock();
    }

    let moving = false;
    if (this.mainTarget) {
      const dx = this.mainTarget.x - this.char.x;
      const dy = this.mainTarget.y - this.char.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 3) {
        this.char.setVelocity(0, 0);
        this.mainTarget = null;
        this.nextWanderAt = this.time.now + 4000 + Math.random() * 5000;
        // 走到打卡机前了 → 打开打卡面板
        if (this.punchPending) {
          this.punchPending = false;
          this.openPunch();
        }
      } else {
        this.char.setVelocity((dx / dist) * SPEED, (dy / dist) * SPEED);
        const nd = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        this.char.setData('dir', nd);
        this.char.anims.play('walk-' + nd, true);
        moving = true;
      }
    }
    if (!moving) {
      this.char.setVelocity(0, 0);
      this.char.anims.stop();
      this.char.setFrame(IDLE_FRAME[this.char.getData('dir') || 'down']);
    }
    this.char.setDepth(Math.round(this.char.y));

    // ---------- 千仔：自主慢速漫步（玩家不可控制） ----------
    if (!this.qzTarget && this.time.now >= this.qzNextWanderAt) {
      const r = QZ_REGIONS[Phaser.Math.Between(0, QZ_REGIONS.length - 1)];
      this.qzTarget = {
        x: Phaser.Math.Between(r.x1, r.x2),
        y: Phaser.Math.Between(r.y1, r.y2),
      };
    }
    if (this.qzTarget) {
      const dx = this.qzTarget.x - this.qz.x;
      const dy = this.qzTarget.y - this.qz.y;
      const dist = Math.hypot(dx, dy);
      const step = (QZ_SPEED * delta) / 1000;
      if (dist <= step) {
        this.qzTarget = null;
        this.qzNextWanderAt = this.time.now + 3000 + Math.random() * 6000;
        this.qz.anims.stop();
        this.qz.setFrame(IDLE_FRAME[this.qz.getData('dir') || 'down']);
      } else {
        this.qz.x += (dx / dist) * step;
        this.qz.y += (dy / dist) * step;
        const nd = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        this.qz.setData('dir', nd);
        this.qz.anims.play('qz-walk-' + nd, true);
      }
    }
    this.qz.setDepth(Math.round(this.qz.y));
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#10131a',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: OfficeScene,
});
