import { C, FPS } from './constants.js';

export class Effects {
  constructor(audio = null) {
    this.audio = audio;
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flash = 0;
    this.flashColor = null;
    this.hitstop = 0;
    this.shake = 0;
    this.beams = [];
    this.stomps = [];
    this.killFrames = 0;
    this.killFrameMax = 0;
    this.killX = 0;
    this.killY = 0;
  }

  reset() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flash = 0;
    this.flashColor = null;
    this.hitstop = 0;
    this.shake = 0;
    this.beams = [];
    this.stomps = [];
    this.killFrames = 0;
    this.killFrameMax = 0;
    this.killX = 0;
    this.killY = 0;
  }

  burst(x, y, color, n = 14, opts = {}) {
    const { spark = false, glow = true } = opts;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const s = 2 + Math.random() * (spark ? 7 : 5);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 16 + Math.random() * 12,
        max: 28,
        color,
        sz: spark ? 1.5 + Math.random() * 2 : 2 + Math.random() * 2.5,
        spark,
        glow,
      });
    }
  }

  perfect(x, y) {
    this.audio?.play('perfect_weave');
    this.burst(x, y, C.perfect, 18, { spark: true, glow: true });
    this.burst(x, y, C.playerCoreBright, 10, { glow: true });
    this.rings.push({ x, y, r: 0, max: 90, life: 16, color: C.perfect, glow: true });
    this.rings.push({ x, y, r: 0, max: 48, life: 10, color: C.playerCoreBright, glow: true });
    this.texts.push({
      x, y: y - 22, t: 'PERFECT', life: 38, maxLife: 38,
      color: C.perfect, stroke: '#00000088', size: 13, glow: true,
    });
    this.flash = 6;
    this.flashColor = C.perfect;
    this.hitstop = 9;
    this.shake = 5;
  }

  pop(x, y) {
    this.audio?.play('bullet_pop');
    this.burst(x, y, C.bullet, 6, { spark: true });
    this.burst(x, y, C.bulletCore, 4);
  }

  death(x, y) {
    this.audio?.play('player_death');
    this.burst(x, y, C.wall, 28, { spark: true });
    this.burst(x, y, C.perfect, 14);
    this.rings.push({ x, y, r: 0, max: 120, life: 18, color: C.wall, glow: true });
    this.shake = 14;
    this.flash = 10;
    this.flashColor = C.wall;
  }

  lockHit(x1, y1, x2, y2, pct) {
    this.audio?.play('lock_hit');
    this.beams.push({ x1, y1, x2, y2, life: 12, color: C.lockYellow });
    this.burst(x2, y2, C.lockYellow, 16, { spark: true });
    this.texts.push({
      x: x2, y: y2 - 26,
      t: `-${Math.round(pct * 100)}%`, life: 32, maxLife: 32,
      color: C.lockYellow, stroke: '#00000099', size: 12, glow: true,
    });
    this.flash = 4;
    this.flashColor = C.lockYellow;
    this.shake = 4;
  }

  killFrameAt(x, y, playSound = true) {
    if (playSound) this.audio?.play('enemy_kill');
    this.burst(x, y, C.fxWhite, 24, { spark: true, glow: true });
    this.burst(x, y, C.fxKill, 16);
    this.burst(x, y, C.wall, 10, { spark: true });
    this.rings.push({ x, y, r: 0, max: 150, life: 22, color: C.fxWhite, glow: true });
    this.texts.push({
      x, y: y - 30, t: 'KILL', life: 40, maxLife: 40,
      color: C.fxWhite, stroke: '#000000cc', size: 14, glow: true,
    });
    this.killX = x;
    this.killY = y;
    this.killFrameMax = Math.round(0.4 * FPS);
    this.killFrames = this.killFrameMax;
  }

  lockKill(x1, y1, x2, y2) {
    this.audio?.play('lock_kill');
    this.hitstop = Math.max(this.hitstop, 4);
    this.beams.push({ x1, y1, x2, y2, life: 16, color: C.fxWhite });
    this.killFrameAt(x2, y2, false);
  }

  lockMiss(x, y) {
    this.audio?.play('lock_miss');
    this.texts.push({
      x, y: y - 20, t: 'MISS', life: 30, maxLife: 30,
      color: C.fxMuted, size: 11,
    });
  }

  quickHit(x, y) {
    this.audio?.play('quick_hit');
    this.burst(x, y, C.playerShot, 10, { spark: true });
    this.texts.push({
      x, y: y - 18, t: '-10%', life: 24, maxLife: 24,
      color: C.playerShot, size: 11, glow: true,
    });
  }

  dashStomp(x, y) {
    this.audio?.play('dash_stomp');
    this.stomps.push({ x, y, r: 3, life: 9, maxLife: 9 });
    this.rings.push({
      x, y, r: 2, max: 22, life: 9, maxLife: 9,
      color: C.fxStomp, stomp: true, glow: true,
    });
  }

  sectorClear(x, y) {
    this.texts.push({
      x, y: y - 40, t: 'SECTOR CLEAR', life: 55, maxLife: 55,
      color: C.perfect, stroke: '#000000bb', size: 15, glow: true,
    });
    this.rings.push({ x, y, r: 0, max: 170, life: 28, color: C.perfect, glow: true });
    this.burst(x, y, C.perfect, 20, { spark: true });
    this.flash = 8;
    this.flashColor = C.perfect;
    this.hitstop = 8;
  }

  tick(timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.hitstop > 0) {
      this.hitstop -= 1;
      this.tickParts(ts);
      return true;
    }
    this.tickParts(ts);
    if (this.flash > 0) this.flash -= ts;
    if (this.shake > 0) this.shake -= ts;
    return false;
  }

  tickParts(ts = 1) {
    for (const p of this.parts) {
      p.x += p.vx * ts;
      p.y += p.vy * ts;
      p.vx *= Math.pow(0.9, ts);
      p.vy *= Math.pow(0.9, ts);
      p.life -= ts;
    }
    this.parts = this.parts.filter(p => p.life > 0);

    for (const r of this.rings) {
      r.r += (r.stomp ? 5 : 9) * ts;
      r.life -= ts;
    }
    this.rings = this.rings.filter(r => r.life > 0);

    for (const s of this.stomps) {
      s.r += 4 * ts;
      s.life -= ts;
    }
    this.stomps = this.stomps.filter(s => s.life > 0);

    for (const t of this.texts) {
      t.y -= 0.7 * ts;
      t.life -= ts;
    }
    this.texts = this.texts.filter(t => t.life > 0);

    for (const b of this.beams) b.life -= ts;
    this.beams = this.beams.filter(b => b.life > 0);

    if (this.killFrames > 0) this.killFrames -= ts;
  }
}
