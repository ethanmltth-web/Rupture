import { FPS } from './constants.js';
import { damageEnemiesInRadius, dist } from './ability-helpers.js';

const BLINK_CD = 4 * FPS;
const BLINK_DIST = 120;
const BLINK_RADIUS = 50;
const BLINK_DMG = 0.08;
const BLINK_IFRAME = 6;

const TRAIL_CD = 11 * FPS;
const TRAIL_DURATION = 2 * FPS;
const TRAIL_INTERVAL = 6;
const TRAIL_RADIUS = 40;
const TRAIL_DMG = 0.05;

export class PhaseBlink {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = BLINK_CD;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.flashes = [];
  }

  tryFire(player, world, fx) {
    if (this.cd > 0) return false;
    const d = player.lastDir;
    const len = Math.hypot(d.x, d.y) || 1;
    const dx = d.x / len;
    const dy = d.y / len;

    player.x += dx * BLINK_DIST;
    player.y += dy * BLINK_DIST;
    player.clamp();
    player.blinkIFrame = BLINK_IFRAME;

    damageEnemiesInRadius(world, fx, player.x, player.y, BLINK_RADIUS, BLINK_DMG, this.audio);
    this.flashes.push({ x: player.x, y: player.y, life: 12, maxLife: 12 });
    this.cd = BLINK_CD;
    this.audio?.play('phase_blink');
    return true;
  }

  update(_world, _fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;
    for (const f of this.flashes) f.life -= ts;
    this.flashes = this.flashes.filter(f => f.life > 0);
  }

  ready() { return this.cd <= 0; }
}

export class AfterimageTrail {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = TRAIL_CD;
    this.durationMax = TRAIL_DURATION;
    this.reset();
  }

  reset() {
    this.cd = 0;
    this.active = false;
    this.timer = 0;
    this.tick = 0;
    this.nodes = [];
  }

  tryFire(player, world, fx) {
    if (this.cd > 0 || this.active) return false;
    this.active = true;
    this.timer = TRAIL_DURATION;
    this.tick = 0;
    this.nodes = [];
    damageEnemiesInRadius(world, fx, player.x, player.y, TRAIL_RADIUS, TRAIL_DMG, this.audio);
    this.audio?.play('phase_trail');
    return true;
  }

  update(player, world, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (!this.active) {
      if (this.cd > 0) this.cd -= ts;
      return;
    }

    this.timer -= ts;
    this.tick += ts;
    if (this.tick >= TRAIL_INTERVAL) {
      this.tick = 0;
      this.nodes.push({ x: player.x, y: player.y, life: 28, maxLife: 28, hit: new Set() });
      for (const n of this.nodes) {
        for (const e of world.allEnemies()) {
          if (n.hit.has(e.ref)) continue;
          const er = e.r || 14;
          if (dist(n.x, n.y, e.x, e.y) <= TRAIL_RADIUS + er) {
            n.hit.add(e.ref);
            e.ref.hp -= e.ref.maxHp * TRAIL_DMG;
            fx.quickHit(e.x, e.y);
            if (e.ref.hp <= 0) {
              world.removeEnemy(e.type, e.ref);
              this.audio?.play('quick_kill');
            }
          }
        }
      }
    }

    for (const n of this.nodes) n.life -= ts;
    this.nodes = this.nodes.filter(n => n.life > 0);

    if (this.timer <= 0) {
      this.active = false;
      this.cd = TRAIL_CD;
      this.nodes = [];
    }
  }

  ready() { return !this.active && this.cd <= 0; }
}
