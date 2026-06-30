import { FPS, ARENA } from './constants.js';
import { dist, norm } from './ability-helpers.js';

const FAN_CD = 2.5 * FPS;
const FAN_COUNT = 5;
const FAN_SPREAD = Math.PI / 3;
const FAN_DMG = 0.08;
const FAN_SPD = 7.5;

const RICO_CD = 7 * FPS;
const RICO_DMG = 0.15;
const RICO_SPD = 8.5;
const RICO_BOUNCES = 3;

export class FanBurst {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = FAN_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.bullets = [];
  }

  tryFire(player, world, usePriority = false) {
    if (this.cd > 0) return false;
    const enemy = usePriority
      ? world.priorityEnemy(player.x, player.y)
      : world.nearestEnemy(player.x, player.y);
    if (!enemy) return false;

    const base = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const step = FAN_SPREAD / (FAN_COUNT - 1);
    for (let i = 0; i < FAN_COUNT; i++) {
      const ang = base - FAN_SPREAD / 2 + step * i;
      this.bullets.push({
        x: player.x, y: player.y,
        vx: Math.cos(ang) * FAN_SPD, vy: Math.sin(ang) * FAN_SPD,
        spd: FAN_SPD, r: 4, life: 90, dmg: FAN_DMG, hit: new Set(),
      });
    }
    this.cd = FAN_CD;
    this.audio?.play('arc_fan');
    return true;
  }

  update(world, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;

    for (const b of this.bullets) {
      b.x += b.vx * ts;
      b.y += b.vy * ts;
      b.life -= ts;
      for (const e of world.allEnemies()) {
        if (b.hit.has(e.ref)) continue;
        const er = e.r || 14;
        if (dist(b.x, b.y, e.x, e.y) < b.r + er) {
          b.hit.add(e.ref);
          e.ref.hp -= e.ref.maxHp * b.dmg;
          fx.quickHit(e.x, e.y);
          if (e.ref.hp <= 0) {
            world.removeEnemy(e.type, e.ref);
            this.audio?.play('quick_kill');
          }
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  ready() { return this.cd <= 0; }
}

export class RicochetShot {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = RICO_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.bullets = [];
  }

  tryFire(player, world, usePriority = false) {
    if (this.cd > 0) return false;
    const enemy = usePriority
      ? world.priorityEnemy(player.x, player.y)
      : world.nearestEnemy(player.x, player.y);
    if (!enemy) return false;

    const d = norm(enemy.x - player.x, enemy.y - player.y);
    this.bullets.push({
      x: player.x, y: player.y,
      vx: d.x * RICO_SPD, vy: d.y * RICO_SPD,
      spd: RICO_SPD, r: 5, life: 200, dmg: RICO_DMG,
      bouncesLeft: RICO_BOUNCES, hit: new Set(),
    });
    this.cd = RICO_CD;
    this.audio?.play('arc_ricochet');
    return true;
  }

  update(world, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;

    for (const b of this.bullets) {
      b.x += b.vx * ts;
      b.y += b.vy * ts;
      b.life -= ts;

      const pad = 20;
      if (b.x < ARENA.x + pad || b.x > ARENA.x + ARENA.w - pad) {
        b.vx *= -1;
        b.x = Math.max(ARENA.x + pad, Math.min(ARENA.x + ARENA.w - pad, b.x));
        b.bouncesLeft--;
      }
      if (b.y < ARENA.y + pad || b.y > ARENA.y + ARENA.h - pad) {
        b.vy *= -1;
        b.y = Math.max(ARENA.y + pad, Math.min(ARENA.y + ARENA.h - pad, b.y));
        b.bouncesLeft--;
      }
      if (b.bouncesLeft < 0) b.life = 0;

      for (const e of world.allEnemies()) {
        if (b.hit.has(e.ref)) continue;
        const er = e.r || 14;
        if (dist(b.x, b.y, e.x, e.y) < b.r + er) {
          b.hit.add(e.ref);
          e.ref.hp -= e.ref.maxHp * b.dmg;
          fx.quickHit(e.x, e.y);
          if (e.ref.hp <= 0) {
            world.removeEnemy(e.type, e.ref);
            this.audio?.play('quick_kill');
          }
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  ready() { return this.cd <= 0; }
}
