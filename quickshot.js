import { QUICK } from './constants.js';

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export class QuickShot {
  constructor(audio = null) {
    this.audio = audio;
    this.cooldownMax = QUICK.cooldown;
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
      x: player.x,
      y: player.y,
      vx: d.x * QUICK.spd,
      vy: d.y * QUICK.spd,
      spd: QUICK.spd,
      r: QUICK.radius,
      life: 240,
      kind: 'player',
      targetType: enemy.type,
      targetRef: enemy.ref,
    });
    this.cd = QUICK.cooldown;
    this.audio?.play('quick_fire');
    return true;
  }

  update(world, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;

    for (const b of this.bullets) {
      const ref = b.targetRef;
      const target = ref?.hp > 0
        ? { x: ref.x, y: ref.y }
        : world.nearestEnemy(b.x, b.y);
      if (target) {
        if (!ref?.hp && target.ref) {
          b.targetRef = target.ref;
          b.targetType = target.type;
        }
        const tx = target.x ?? target.ref?.x;
        const ty = target.y ?? target.ref?.y;
        if (tx != null && ty != null) {
          const d = norm(tx - b.x, ty - b.y);
          const blend = QUICK.homing;
          b.vx = b.vx * (1 - blend) + d.x * b.spd * blend;
          b.vy = b.vy * (1 - blend) + d.y * b.spd * blend;
          const spd = Math.hypot(b.vx, b.vy) || 1;
          b.vx = (b.vx / spd) * b.spd;
          b.vy = (b.vy / spd) * b.spd;
        }
      }

      b.x += b.vx * ts;
      b.y += b.vy * ts;
      b.life -= ts;

      const hit = this.checkHit(b, world);
      if (hit) {
        hit.ref.hp -= hit.ref.maxHp * QUICK.dmg;
        const killed = hit.ref.hp <= 0;
        if (killed) {
          fx.killFrameAt(hit.ref.x, hit.ref.y, true);
          this.audio?.play('quick_kill');
          world.removeEnemy(hit.type, hit.ref);
        } else {
          fx.quickHit(b.x, b.y);
        }
        b.life = 0;
      }
    }

    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  checkHit(b, world) {
    for (const e of world.allEnemies()) {
      if (dist(b.x, b.y, e.x, e.y) < b.r + 12) {
        return { ref: e.ref, type: e.type };
      }
    }
    return null;
  }

  ready() {
    return this.cd <= 0;
  }

  cdRatio() {
    return Math.max(0, 1 - this.cd / QUICK.cooldown);
  }

  cdSeconds() {
    return Math.ceil(this.cd / 60);
  }
}
