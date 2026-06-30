import { FPS, P } from './constants.js';
import { clearBulletsInRadius, damageEnemiesInRadius, norm } from './ability-helpers.js';

const SHOCK_CD = 3 * FPS;
const SHOCK_RADIUS = 80;
const SHOCK_DMG = 0.12;

const BREACH_CD = 9 * FPS;
const BREACH_LEN = P.dashLen * P.dashSpd * 0.95;
const BREACH_WIDTH = 36;
const BREACH_DMG = 0.18;

export class ShockRing {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = SHOCK_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.pulses = [];
  }

  tryFire(player, world, fx) {
    if (this.cd > 0) return false;
    if (!world.enemyCount() && !world.bullets.length) return false;
    this.cd = SHOCK_CD;
    this.pulses.push({
      x: player.x, y: player.y, r: 8, max: SHOCK_RADIUS, life: 14, maxLife: 14,
    });
    clearBulletsInRadius(world, player.x, player.y, SHOCK_RADIUS, fx);
    damageEnemiesInRadius(world, fx, player.x, player.y, SHOCK_RADIUS, SHOCK_DMG, this.audio);
    this.audio?.play('pulse_shock');
    return true;
  }

  update(_world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;
    for (const p of this.pulses) {
      p.r += 9 * ts;
      p.life -= ts;
    }
    this.pulses = this.pulses.filter(p => p.life > 0);
  }

  ready() { return this.cd <= 0; }
}

export class BreachCharge {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = BREACH_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.blasts = [];
  }

  tryFire(player, world, fx) {
    if (this.cd > 0) return false;
    const d = player.lastDir;
    if (!d.x && !d.y) return false;
    if (!world.enemyCount() && !world.bullets.length) return false;

    const dir = norm(d.x, d.y);
    const x1 = player.x;
    const y1 = player.y;
    const x2 = x1 + dir.x * BREACH_LEN;
    const y2 = y1 + dir.y * BREACH_LEN;

    for (const b of world.bullets) {
      if (b.frozen) continue;
      const t = pointSegDist(b.x, b.y, x1, y1, x2, y2);
      if (t.dist < BREACH_WIDTH + b.r) {
        fx.pop(b.x, b.y);
        b.life = 0;
      }
    }
    world.bullets = world.bullets.filter(b => b.life > 0);

    for (const e of world.allEnemies()) {
      const er = e.r || 14;
      const t = pointSegDist(e.x, e.y, x1, y1, x2, y2);
      if (t.dist < BREACH_WIDTH + er) {
        e.ref.hp -= e.ref.maxHp * BREACH_DMG;
        fx.quickHit(e.x, e.y);
        if (e.ref.hp <= 0) {
          world.removeEnemy(e.type, e.ref);
          this.audio?.play('quick_kill');
        }
      }
    }

    this.blasts.push({ x1, y1, x2, y2, life: 16, maxLife: 16 });
    this.cd = BREACH_CD;
    this.audio?.play('pulse_breach');
    return true;
  }

  update(_world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;
    for (const b of this.blasts) b.life -= ts;
    this.blasts = this.blasts.filter(b => b.life > 0);
  }

  ready() { return this.cd <= 0; }
}

function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), t };
}
