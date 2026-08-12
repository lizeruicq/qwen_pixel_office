import Phaser from 'phaser';
import {
  TILE, MAP, T, floorLayout, OBJECTS, FOOTPRINTS, HOTSPOTS, WALK_BOUNDS, SPAWN, GLOWS, PANEL_TRIGGERS, TIME_CLOCK,
  COFFEE_MACHINE, SEATS, WORKERS, SKY_STATES, PHASE_TO_SKY, SKY,
} from './config/scene.js';
import { GameSocket } from './net/ws.js';
import { initPanels } from './ui/panels.js';
import { confirmPanel, rpgDialog } from './ui/dialogs.js';
import { createBubble } from './ui/bubble.js';

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
    // 同事：行走/站立表（16×24，同 player）+ 打字表（16×24，2 帧）
    for (const wkr of WORKERS) {
      this.load.spritesheet(wkr.sprite, `/assets/${wkr.sprite}.png`, { frameWidth: 16, frameHeight: 24 });
      this.load.spritesheet(wkr.typing, `/assets/${wkr.typing}.png`, { frameWidth: 16, frameHeight: 24 });
    }
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
        if (t < 0) continue; // 留空（顶部窗区由窗外景层绘制）
        ctx.drawImage(src, (t % 8) * TILE, Math.floor(t / 8) * TILE, TILE, TILE, c * TILE, r * TILE, TILE, TILE);
      }
    }
    canvas.refresh();
    this.add.image(0, 0, 'floor').setOrigin(0, 0).setDepth(0);

    // ---------- 窗外景：叠在整面顶窗上，按时段切 4 种天色 ----------
    this.buildSky();
    this.skyImg = this.add.image(SKY.x, SKY.y, 'sky').setOrigin(0, 0).setDepth(0.6);
    this.setSky('forenoon'); // 默认白天，时钟广播到达后按真实时段覆盖

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
    // 同事打字动画（每帧 16×24，2 帧循环）
    for (const wkr of WORKERS) {
      this.anims.create({
        key: 'type-' + wkr.id,
        frames: this.anims.generateFrameNumbers(wkr.typing, { start: 0, end: 1 }),
        frameRate: 3, repeat: -1,
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
    // 引用碰撞体，落座时可关闭避免卡死
    this.charCollider = this.physics.add.collider(this.char, furniture);

    this.mainTarget = null;
    this.nextWanderAt = this.time.now + 3000;

    // ---------- 千仔（吉祥物）：自主慢速漫步，点击它打开秘书面板 ----------
    this.qz = this.add.sprite(180, 130, 'qianzai').setOrigin(0.5, 1);
    this.qz.setData('dir', 'down');
    this.qz.setDepth(130);
    this.qzTarget = null;
    this.qzNextWanderAt = this.time.now + 2000;

    // ---------- 两名常驻同事：始终在工位打字（座椅留空让玩家可物理接近，靠点击交互） ----------
    this.workers = [];
    for (const cfg of WORKERS) {
      const seat = SEATS.find((s) => s.id === cfg.seatId);
      const spr = this.add.sprite(seat.seatX, seat.seatY, cfg.sprite).setOrigin(0.5, 1);
      spr.setDepth(Math.round(seat.seatY));
      spr.anims.play('type-' + cfg.id, true);
      const bubble = createBubble();
      this.workers.push({ cfg, seat, spr, bubble, nextChatterAt: this.time.now + 4000 + Math.random() * 6000 });
    }
    // 千仔气泡（紫色）
    this.qzBubble = createBubble({ qz: true });

    // ---------- 落座状态 ----------
    this.seat = null;          // 玩家当前落座的 SEAT 项
    this.coffeePending = false; // 走到咖啡机前后触发
    this.chatTarget = null;    // 走到同事前后触发的闲聊对象

    // 同事闲聊语料（工作吐槽 / 自我 PUA / 自我鼓励）
    this.CHATTER = [
      '需求又改了，第三版了…', '这周的 OKR 还没动呢', '老板说要"闭环"，啥是闭环',
      '又加班，地铁都没了', '这 bug 我改了两天了', '我没事，我可以的',
      '加油，打工人！', '卷赢他们，年底评个 S', '再扛一扛，发完这版就好了',
      '我要偷偷努力，惊艳所有人', '咖啡续命中…', '这个会完全不用开',
    ];
    // 闲聊对话库（玩家先、同事答，两轮）
    this.CHAT_SCRIPTS = [
      [['在忙吗？', '嗯，需求堆成山了。'], ['需要帮忙吗？', '不用不用，我扛得住…大概。']],
      [['吃饭了吗？', '随便对付了一口，哪有时间。'], ['别太累了', '没办法，deadline 不等人啊。']],
      [['最近怎么样？', '老样子，白天开会晚上写码。'], ['注意身体', '等项目上线就好好休息…大概吧。']],
      [['周末去哪玩了？', '周末？我在家补觉。'], ['太惨了吧', '习惯就好，打工人不配拥有周末。']],
    ];

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
        this.standUp();
        this.punchPending = true;
        this.mainTarget = { x: tc.standX, y: tc.standY };
        return;
      }
      // 点击咖啡机 → 走过去，到位后确认面板 + 聊天（任何时候可用）
      const cm = COFFEE_MACHINE;
      if (wp.x >= cm.x - cm.w / 2 && wp.x <= cm.x + cm.w / 2 && wp.y >= cm.y - cm.h && wp.y <= cm.y) {
        this.standUp();
        this.coffeePending = true;
        this.mainTarget = { x: cm.standX, y: cm.standY };
        return;
      }
      // 点击同事 → 走过去，到位后两轮闲聊
      for (const w of this.workers) {
        if (Math.abs(wp.x - w.spr.x) <= 12 && wp.y <= w.spr.y + 2 && wp.y >= w.spr.y - 20) {
          this.standUp();
          this.chatTarget = w;
          this.mainTarget = { x: w.seat.seatX, y: w.seat.seatY + 22 };
          return;
        }
      }
      // 点击空白处 → 起身走向目标
      this.standUp();
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
  }

  /* ---------- 打卡 ---------- */

  /* 烘焙窗外景画布骨架（只建纹理，实际像素在 setSky 里按时段重绘）。高 1.5 行（24px） */
  buildSky() {
    const cv = this.textures.createCanvas('sky', SKY.w, SKY.h);
    cv.refresh();
  }

  /* 按窗外景状态重绘整面窗（只动窗外 canvas，不改室内色调）。每次清画布重画，避免叠色 */
  setSky(stateKey) {
    const st = SKY_STATES[stateKey];
    if (!st || !this.skyImg) return;
    const cv = this.textures.get('sky');
    const x = cv.getContext();
    const { w: Wpx, h: Hpx } = SKY;
    x.clearRect(0, 0, Wpx, Hpx);
    // 天空底
    x.fillStyle = st.sky;
    x.fillRect(0, 0, Wpx, Hpx);
    const night = stateKey === 'night';
    // 云与飞鸟：白天/清晨/傍晚可见，深夜隐入夜空
    if (!night) {
      x.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [cx, cy, w] of [[36, 6, 20], [120, 12, 26], [208, 5, 18], [280, 14, 16]]) {
        x.fillRect(cx, cy, w, 3);
        x.fillRect(cx + 3, cy - 2, w - 8, 2);
      }
      x.fillStyle = 'rgba(40,50,70,0.7)';
      for (const [bx, by] of [[70, 8], [78, 6], [150, 10], [232, 7], [292, 11]]) {
        x.fillRect(bx, by, 2, 1); x.fillRect(bx + 3, by, 2, 1);
      }
    }
    // 星星：深夜明显，白天淡
    x.fillStyle = night ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.28)';
    for (const [sx, sy] of [[30, 14], [90, 5], [135, 16], [175, 8], [215, 15], [255, 16], [298, 6], [310, 17], [55, 18]]) {
      x.fillRect(sx, sy, 1, 1);
    }
    // 太阳 / 月亮
    x.fillStyle = st.sun;
    x.beginPath(); x.arc(262, 9, 5, 0, Math.PI * 2); x.fill();
    // 两侧墙柱（盖住天空，露出中间窗区），与下方 SAND 墙衔接
    x.fillStyle = '#d9c49a';
    x.fillRect(0, 0, TILE, Hpx);
    x.fillRect(Wpx - TILE, 0, TILE, Hpx);
    // 墙柱描边
    x.fillStyle = '#b39a70';
    x.fillRect(TILE - 1, 0, 1, Hpx);
    x.fillRect(Wpx - TILE, 0, 1, Hpx);
    // 窗框竖梃（中间窗区每 4 列一根）+ 底窗台（在 24px 底边）
    x.fillStyle = '#6b4a2f';
    for (let c = 4; c < MAP.cols; c += 4) x.fillRect(c * TILE - 1, 0, 2, Hpx);
    x.fillStyle = '#5e3a1e';
    x.fillRect(0, Hpx - 2, Wpx, 2);
    cv.refresh();
    this.skyState = stateKey;
  }

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

  /* 走到打卡机前后调用：确认面板 → 是 → RPG 结果对话框 */
  async tryPunch() {
    const w = this.punchWindow();
    if (!w) {
      await rpgDialog({ portrait: '/assets/portrait_normal.png', text: '现在不是打卡时间。' });
      return;
    }
    const yes = await confirmPanel({
      image: '/assets/objects/time_clock.png',
      text: w === 'in' ? '要打卡上班吗？' : '要打卡下班吗？',
    });
    if (!yes) return;
    if (w === 'in') {
      await rpgDialog({ portrait: '/assets/portrait_happy.png', text: '打卡成功，开始一天的工作！' });
    } else {
      await rpgDialog({ portrait: '/assets/portrait_normal.png', text: '打卡下班，总觉得还有些事没做完…' });
    }
  }

  /* ---------- 喝咖啡（任何时候可用，逻辑同打卡机） ---------- */
  async tryCoffee() {
    const yes = await confirmPanel({
      image: '/assets/objects/coffee_machine.png',
      text: '要来一杯咖啡提提神吗？',
      yesText: '来一杯', noText: '算了',
    });
    if (!yes) return;
    await rpgDialog({ portrait: '/assets/portrait_happy.png', text: '咕咚咕咚……一杯美式下肚，精神多了！' });
  }

  /* ---------- 和同事闲聊（玩家先、同事答，两轮） ---------- */
  async chatWithWorker(w) {
    const script = this.CHAT_SCRIPTS[Phaser.Math.Between(0, this.CHAT_SCRIPTS.length - 1)];
    const name = w.cfg.name;
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const [mine, theirs] of script) {
      await rpgDialog({ portrait: '/assets/portrait_normal.png', text: `${mine}` });
      await pause(240);
      await rpgDialog({ portrait: w.cfg.portrait, text: `${name}：${theirs}` });
      await pause(240);
    }
  }

  /* ---------- 落座 / 起身 ---------- */
  /* 找到玩家附近的空工位并坐下（取消碰撞避免卡死） */
  trySit() {
    if (this.seat) return;
    let best = null; let bestD = 18;
    for (const s of SEATS) {
      if (s.worker) continue;                 // 同事占着
      if (s === this.seat) continue;
      const d = Math.hypot(this.char.x - s.seatX, this.char.y - s.seatY);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return;
    this.seat = best;
    this.mainTarget = null;
    this.char.setVelocity(0, 0);
    this.char.setPosition(best.seatX, best.seatY);
    this.char.setData('dir', best.faceDir);
    this.char.anims.play('type', true);
    this.char.setDepth(Math.round(best.seatY));
    if (this.charCollider) this.charCollider.active = false; // 落座时取消碰撞
  }

  standUp() {
    if (!this.seat) return;
    this.seat = null;
    if (this.charCollider) this.charCollider.active = true; // 起身恢复碰撞
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
        this.qzBubble?.say(`你有 ${msg.items.length} 条待办`, 2800);
        break;
      case 'game_event': {
        const p = msg.payload || {};
        if (msg.kind === 'at_me') this.qzBubble?.say(`${p.sender ?? '有人'} @ 你了`, 3200);
        else if (msg.kind === 'o2o_msg') this.qzBubble?.say(`${p.sender ?? '有人'} 私聊你`, 3200);
        else if (msg.kind === 'group_msg') this.qzBubble?.say(`${p.sender ?? '有人'} 在群里说话`, 2600);
        else if (msg.kind === 'todo_added') this.qzBubble?.say('你有新的待办', 2800);
        break;
      }
      case 'notice':
        this.qzBubble?.say(msg.text, 3000);
        break;
      case 'time':
        this.clockInfo = { now: msg.now, phase: msg.phase, mode: msg.mode, at: performance.now() };
        this.renderClock();
        // 时段变化 → 切换窗外景（清晨/上午/傍晚/深夜，下午并入白天）
        {
          const sky = PHASE_TO_SKY[msg.phase] || 'forenoon';
          if (sky !== this.skyState) this.setSky(sky);
        }
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
    // 落座中：持续打字，不移动，气泡跟随
    if (this.seat) {
      this.char.setVelocity(0, 0);
      this.char.setDepth(Math.round(this.char.y));
    } else {
      // 闲逛
      if (!this.mainTarget && this.time.now >= this.nextWanderAt) {
        const spot = HOTSPOTS[Phaser.Math.Between(0, HOTSPOTS.length - 1)];
        this.mainTarget = {
          x: Phaser.Math.Clamp(spot.x + Phaser.Math.Between(-16, 16), WALK_BOUNDS.minX, WALK_BOUNDS.maxX),
          y: Phaser.Math.Clamp(spot.y + Phaser.Math.Between(-8, 8), WALK_BOUNDS.minY, WALK_BOUNDS.maxY),
        };
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
          // 到位后触发待办：打卡 / 咖啡 / 闲聊
          if (this.punchPending) { this.punchPending = false; void this.tryPunch(); }
          else if (this.coffeePending) { this.coffeePending = false; void this.tryCoffee(); }
          else if (this.chatTarget) { const w = this.chatTarget; this.chatTarget = null; void this.chatWithWorker(w); }
          else this.trySit(); // 走到空工位附近则坐下
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
    }

    // 时钟每秒本地插值刷新一次
    if (!this._clockTickAt || this.time.now - this._clockTickAt >= 1000) {
      this._clockTickAt = this.time.now;
      this.renderClock();
    }

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

    // ---------- 同事：随机工作吐槽气泡 + 始终打字 ----------
    for (const w of this.workers) {
      if (this.time.now >= w.nextChatterAt) {
        w.nextChatterAt = this.time.now + 7000 + Math.random() * 9000;
        if (!w.bubble.visible) {
          w.bubble.say(this.CHATTER[Phaser.Math.Between(0, this.CHATTER.length - 1)], 3400);
        }
      }
      w.bubble.follow(w.spr, this.cameras.main);
    }
    this.qzBubble.follow(this.qz, this.cameras.main);
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
