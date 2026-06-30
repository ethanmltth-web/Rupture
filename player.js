import { ARENA, P, PERFECT_DASH_CD_REDUCE, CHAIN_DECAY_FRAMES } from './constants.js';
import { dashFrameStep } from './dashCurve.js';
import { scaledSteps } from './gameTime.js';

export class Player {
  constructor(audio = null) {
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.x = ARENA.x + ARENA.w / 2;
    this.y = ARENA.y + ARENA.h / 2;
    this.vx = 0;
    this.vy = 0;
    this.lastDir = { x: 1, y: 0 };
    this.dashing = false;
    this.dashT = 0;
    this.dashFrame = 0;
    this.dashCD = 0;
    this.dashDir = { x: 1, y: 0 };
    this.dashStartDir = { x: 1, y: 0 };
    this.dashCurveHold = 0;
    this.dashPath = [];
    this.chain = 0;
    this.chainDecayFrames = 0;
    this.sectorDashes = 0;
    this.sectorPerfects = 0;
    this.dashStopFx = false;
    this.blinkIFrame = 0;
    this.perfectWindowExt = 0;
    this.perfectCdMult = 1;
    this.weaveHit = new Set();
    this.alive = true;
  }

  beginSectorStats() {
    this.sectorDashes = 0;
    this.sectorPerfects = 0;
    this.perfectWindowExt = 0;
    this.perfectCdMult = 1;
    this.chain = 0;
    this.chainDecayFrames = 0;
  }

  get hit() {
    const s = this.dashing ? 6 : P.r;
    return { x: this.x - s, y: this.y - s, w: s * 2, h: s * 2, cx: this.x, cy: this.y, r: s };
  }

  invuln() {
    return (this.dashing && this.dashFrame <= P.dashIFrame) || this.blinkIFrame > 0;
  }

  inPerfectWindow() {
    const window = P.perfectWindow + (this.perfectWindowExt || 0);
    return this.dashing && this.dashFrame >= 1 && this.dashFrame <= window;
  }

  update(input, settings = null, timeScale = 1) {
    if (!this.alive) return;
    const ts = Math.max(0, timeScale);

    if (this.dashCD > 0) this.dashCD -= ts;
    if (this.blinkIFrame > 0) this.blinkIFrame -= ts;

    if (this.dashing) {
      scaledSteps(ts, (step) => {
        const next = dashFrameStep(
          this.x, this.y,
          this.dashDir, this.dashStartDir, this.dashCurveHold,
          input.axis(), P.dashSpd * step,
        );
        this.x = next.x;
        this.y = next.y;
        this.dashDir = next.dir;
        this.dashCurveHold = next.hold;
        this.dashT -= step;
        this.dashFrame += step;
      });
      this.dashPath.push({ x: this.x, y: this.y });
      const ax = input.axis();
      if (ax.x || ax.y) {
        this.lastDir = { ...this.dashDir };
      }

      if (input.wantDashStop?.()) {
        this.stopDash();
        return;
      }
      this.clamp();
      if (this.dashT <= 0) this.dashing = false;
      return;
    }

    const ax = input.axis();
    if (ax.x || ax.y) {
      const len = Math.hypot(ax.x, ax.y) || 1;
      this.lastDir = { x: ax.x / len, y: ax.y / len };
      this.vx += (ax.x / len) * P.accel * ts;
      this.vy += (ax.y / len) * P.accel * ts;
    }

    const friction = Math.pow(P.friction, ts);
    this.vx *= friction;
    this.vy *= friction;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > P.speed) {
      this.vx = (this.vx / spd) * P.speed;
      this.vy = (this.vy / spd) * P.speed;
    }

    if (input.wantDash() && this.dashCD <= 0) {
      this.startDash();
    }

    if (this.chain > 0) {
      this.chainDecayFrames += ts;
      if (this.chainDecayFrames >= CHAIN_DECAY_FRAMES) {
        this.chain = 0;
        this.chainDecayFrames = 0;
      }
    }

    this.x += this.vx * ts;
    this.y += this.vy * ts;
    this.clamp();
  }

  applyDashCurve(steer) {
    const next = dashFrameStep(
      this.x, this.y,
      this.dashDir, this.dashStartDir, this.dashCurveHold,
      steer, 0,
    );
    this.dashDir = next.dir;
    this.dashCurveHold = next.hold;
    if (steer.x || steer.y) {
      this.lastDir = { ...this.dashDir };
    }
  }

  startDash() {
    const d = this.lastDir;
    if (!d.x && !d.y) return;
    this.dashing = true;
    this.dashT = P.dashLen;
    this.dashFrame = 0;
    this.dashDir = { x: d.x, y: d.y };
    this.dashStartDir = { x: d.x, y: d.y };
    this.dashCurveHold = 0;
    this.dashPath = [{ x: this.x, y: this.y }];
    this.dashCD = P.dashCD;
    this.vx = this.vy = 0;
    this.dashStopFx = false;
    this.weaveHit = new Set();
    this.sectorDashes++;
    this.onDash?.();
    this.audio?.play('dash_start');
  }

  stopDash() {
    if (!this.dashing) return false;
    this.lastDir = { ...this.dashDir };
    this.dashing = false;
    this.dashT = 0;
    this.vx = 0;
    this.vy = 0;
    this.dashStopFx = true;
    return true;
  }

  consumeDashStopFx() {
    if (!this.dashStopFx) return false;
    this.dashStopFx = false;
    return true;
  }

  perfectWeave() {
    const reduce = PERFECT_DASH_CD_REDUCE * (this.perfectCdMult || 1);
    this.dashCD = Math.max(0, this.dashCD - P.dashCD * reduce);
    this.chain++;
    this.chainDecayFrames = 0;
    this.sectorPerfects++;
    this.dashT = P.dashLen;
    this.dashFrame = 1;
    if (this.chain > 1) this.audio?.play('chain_up', { chain: this.chain });
    this.onPerfectWeave?.(this.chain);
  }

  clamp() {
    const h = this.hit;
    const a = ARENA;
    this.x = Math.max(a.x + h.r, Math.min(a.x + a.w - h.r, this.x));
    this.y = Math.max(a.y + h.r, Math.min(a.y + a.h - h.r, this.y));
  }

  die() {
    this.alive = false;
  }
}
