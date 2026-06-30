import { LOCKON } from './constants.js';

export class LockOn {
  constructor(audio = null) {
    this.audio = audio;
    this.lockFramesMax = LOCKON.lockFrames;
    this.cooldownMax = LOCKON.cooldown;
    this.reset();
  }

  reset() {
    this.active = false;
    this.target = null;
    this.timer = 0;
    this.cd = 0;
  }

  tryStart(world, player, usePriority = false) {
    if (this.active || this.cd > 0) return false;
    const enemy = usePriority
      ? world.priorityEnemy(player.x, player.y)
      : world.nearestEnemy(player.x, player.y);
    if (!enemy) return false;
    this.active = true;
    this.target = enemy;
    this.timer = 0;
    this.audio?.play('lock_start');
    return true;
  }

  update(world, player, fx, timeScale = 1) {
    const ts = Math.max(0, timeScale);
    if (this.cd > 0) this.cd -= ts;

    if (!this.active) return;

    const ref = this.target?.ref;
    if (!ref || ref.hp <= 0) {
      this.active = false;
      this.target = null;
      this.audio?.stopLockCharge();
      return;
    }

    this.timer += ts;
    this.audio?.updateLockCharge(this.timer / LOCKON.lockFrames);
    if (this.timer >= LOCKON.lockFrames) {
      this.fire(world, player, fx);
    }
  }

  fire(world, player, fx) {
    const { ref, type } = this.target;
    const tx = ref.x;
    const ty = ref.y;

    if (Math.random() < LOCKON.hitChance && ref.hp > 0) {
      const pct = type === 'sprayer' ? LOCKON.greenDmg : LOCKON.normalDmg;
      ref.hp -= ref.maxHp * pct;
      const killed = ref.hp <= 0;
      if (killed) {
        world.removeEnemy(type, ref);
        fx.lockKill(player.x, player.y, tx, ty);
      } else {
        fx.lockHit(player.x, player.y, tx, ty, pct);
      }
    } else {
      fx.lockMiss(tx, ty);
    }

    this.active = false;
    this.target = null;
    this.cd = LOCKON.cooldown;
  }

  lockSlowMult() {
    return LOCKON.lockSlow;
  }

  crosshairPos() {
    if (!this.active || !this.target?.ref) return null;
    return { x: this.target.ref.x, y: this.target.ref.y, t: this.timer / LOCKON.lockFrames };
  }

  ready() {
    return !this.active && this.cd <= 0;
  }

  cdRatio() {
    if (this.active) return this.timer / LOCKON.lockFrames;
    return Math.max(0, 1 - this.cd / LOCKON.cooldown);
  }

  cdSeconds() {
    return Math.ceil(this.cd / 60);
  }
}
