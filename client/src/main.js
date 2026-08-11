import Phaser from 'phaser';
import {
  TILE, MAP, T, floorLayout, OBJECTS, FOOTPRINTS, HOTSPOTS, WALK_BOUNDS, SPAWN, GLOWS, PANEL_TRIGGERS,
} from './config/scene.js';
import { GameSocket } from './net/ws.js';
import { initPanels } from './ui/panels.js';

const W = MAP.cols * TILE; // 352
const H = MAP.rows * TILE; // 224
const SPEED = 90;
const IDLE_FRAME = { down: 0, up: 3, right: 6, left: 9 };

const $ = (id) => document.getElementById(id);

class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
  }

  preload() {
    this.load.image('tileset', '/assets/tileset.png');
    this.load.spritesheet('player', '/assets/player.png', { frameWidth: 16, frameHeight: 24 });
    this.load.spritesheet('player_typing', '/assets/player_typing.png', { frameWidth: 16, frameHeight: 24 });
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

    // 点击地板走过去
    this.input.on('pointerdown', (p) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      for (const t of PANEL_TRIGGERS) {
        if (wp.x >= t.x - t.w / 2 && wp.x <= t.x + t.w / 2 && wp.y >= t.y - t.h && wp.y <= t.y) {
          this.panels?.openTab(t.tab);
          return;
        }
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
        this.state = msg.state;
        this.renderHud();
        break;
      case 'todos':
        this.todoCount = msg.items.length;
        break;
    }
  }

  /* ---------- 循环 ---------- */

  update() {
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
