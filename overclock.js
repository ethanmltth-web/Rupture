import { FPS } from './constants.js';
import { damageEnemiesInRadius, dist } from './ability-helpers.js';

const AMP_CD = 8 * FPS;
const AMP_DURATION = 5 * FPS;
const AMP_PULSE_DMG = 0.06;
const AMP_PULSE_RADIUS = 60;
const AMP_WINDOW_BONUS = 2;

const RAIL_CD = 10 * FPS;
const RAIL_DMG = 0.22;
const RAIL_LEN = 520;
const RAIL_WIDTH = 28;

export class WeaveAmp {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = AMP_CD;
    this.durationMax = AMP_DURATION;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.active = false;
    this.timer = 0;
  }

  tryFire(player, world, fx) {
    if (this.cd > 0 || this.active) return false;
    this.active = true;
    this.timer = AMP_DURATION;
    player.perfectWindowExt = AMP_WINDOW_BONUS;
    player.perfectCdMult = 1.5;
    damageEnemiesInRadius(world, fx, player.x, player.y, AMP_PULSE_RADIUS, AMP_PULSE_DMG, this.audio);
    this.audio?.play('overclock_amp');
    return true;
  }

  update(player, _world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (!this.active) {
      if (this.cd > 0) this.cd -= ts;
      return;
    }
    this.timer -= ts;
    if (this.timer <= 0) {
      this.active = false;
      this.cd = AMP_CD;
      player.perfectWindowExt = 0;
      player.perfectCdMult = 1;
    }
  }

  ready() { return !this.active && this.cd <= 0; }
}

export class RailShot {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = RAIL_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.beams = [];
  }

  tryFire(player, world, fx) {
    if (this.cd > 0) return false;
    if (player.chain < 2) return false;
    const enemy = world.nearestEnemy(player.x, player.y);
    if (!enemy) return false;

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const x1 = player.x;
    const y1 = player.y;
    const x2 = x1 + ux * RAIL_LEN;
    const y2 = y1 + uy * RAIL_LEN;

    for (const e of world.allEnemies()) {
      const er = e.r || 14;
      const t = pointSegDist(e.x, e.y, x1, y1, x2, y2);
      if (t.dist < RAIL_WIDTH + er) {
        e.ref.hp -= e.ref.maxHp * RAIL_DMG;
        fx.lockHit(x1, y1, e.x, e.y, RAIL_DMG);
        if (e.ref.hp <= 0) {
          world.removeEnemy(e.type, e.ref);
          this.audio?.play('quick_kill');
        }
      }
    }

    this.beams.push({ x1, y1, x2, y2, life: 14, maxLife: 14 });
    this.cd = RAIL_CD;
    this.audio?.play('overclock_rail');
    return true;
  }

  update(_world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;
    for (const b of this.beams) b.life -= ts;
    this.beams = this.beams.filter(b => b.life > 0);
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
