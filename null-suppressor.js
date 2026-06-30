import { FPS } from './constants.js';
import {
  clearBulletsInCone, damageEnemy, dist, enemiesInCone, norm,
} from './ability-helpers.js';

const JAM_CD = 3.5 * FPS;
const JAM_RANGE = 160;
const JAM_HALF = Math.PI / 4;
const JAM_DMG = 0.1;

const STASIS_RADIUS = 110;
const STASIS_DURATION = 2.5 * FPS;
const STASIS_CD = 12 * FPS;
const STASIS_RELEASE_DMG = 0.25;

export class JamPulse {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = JAM_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.bursts = [];
  }

  tryFire(player, world, fx, usePriority = false) {
    if (this.cd > 0) return false;
    const enemy = usePriority
      ? world.priorityEnemy(player.x, player.y)
      : world.nearestEnemy(player.x, player.y);
    const d = enemy
      ? norm(enemy.x - player.x, enemy.y - player.y)
      : norm(player.lastDir.x, player.lastDir.y);
    if (!d.x && !d.y) return false;

    clearBulletsInCone(world, player.x, player.y, d.x, d.y, JAM_RANGE, JAM_HALF, fx);
    for (const e of enemiesInCone(world, player.x, player.y, d.x, d.y, JAM_RANGE, JAM_HALF)) {
      damageEnemy(world, fx, e.type, e.ref, JAM_DMG, e.x, e.y, this.audio);
    }

    this.bursts.push({
      x: player.x, y: player.y, dx: d.x, dy: d.y,
      life: 12, maxLife: 12,
    });
    this.cd = JAM_CD;
    this.audio?.play('jam_pulse');
    return true;
  }

  update(_world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;
    for (const b of this.bursts) b.life -= ts;
    this.bursts = this.bursts.filter(b => b.life > 0);
  }

  ready() { return this.cd <= 0; }
}

export class StasisField {
  constructor(audio = null) {
    this.audio = audio;
    this.durationMax = STASIS_DURATION;
    this.cooldownMax = STASIS_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.active = false;
    this.timer = 0;
    this.frozen = [];
    this.playerX = 0;
    this.playerY = 0;
  }

  get radius() {
    return STASIS_RADIUS;
  }

  tryActivate(player, world) {
    if (this.cd > 0 || this.active) return false;

    const px = player.x;
    const py = player.y;
    this.frozen = [];

    for (const b of world.bullets) {
      if (b.frozen) continue;
      if (dist(px, py, b.x, b.y) <= STASIS_RADIUS + b.r) {
        b.frozen = true;
        b.vx = 0;
        b.vy = 0;
        this.frozen.push({ kind: 'bullet', ref: b, ox: b.x - px, oy: b.y - py });
      }
    }

    for (const e of world.allEnemies()) {
      const ref = e.ref;
      if (ref.frozen) continue;
      if (dist(px, py, e.x, e.y) <= STASIS_RADIUS + (e.r || 14)) {
        ref.frozen = true;
        this.frozen.push({ kind: 'enemy', ref, type: e.type });
      }
    }

    if (!this.frozen.length) return false;

    this.active = true;
    this.timer = STASIS_DURATION;
    this.playerX = px;
    this.playerY = py;
    this.audio?.play('stasis_start');
    return true;
  }

  update(player, world, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (!this.active) {
      if (this.cd > 0) this.cd -= ts;
      return;
    }

    const dx = player.x - this.playerX;
    const dy = player.y - this.playerY;
    this.playerX = player.x;
    this.playerY = player.y;

    for (const f of this.frozen) {
      if (!f.ref) continue;
      if (f.kind === 'bullet') {
        f.ox += dx;
        f.oy += dy;
        f.ref.x = player.x + f.ox;
        f.ref.y = player.y + f.oy;
      }
    }

    this.timer -= ts;
    if (this.timer <= 0) this.release(world, fx);
  }

  release(world, fx) {
    for (const f of this.frozen) {
      if (!f.ref) continue;
      if (f.kind === 'bullet') {
        fx.pop(f.ref.x, f.ref.y);
        f.ref.life = 0;
        f.ref.frozen = false;
      } else if (f.kind === 'enemy' && f.ref.hp > 0) {
        f.ref.hp -= f.ref.maxHp * STASIS_RELEASE_DMG;
        f.ref.frozen = false;
        fx.quickHit(f.ref.x, f.ref.y);
        if (f.ref.hp <= 0) world.removeEnemy(f.type, f.ref);
      }
    }
    world.bullets = world.bullets.filter(b => b.life > 0);
    this.frozen = [];
    this.active = false;
    this.cd = STASIS_CD;
    this.audio?.play('stasis_shatter');
  }

  ready() { return !this.active && this.cd <= 0; }
}
