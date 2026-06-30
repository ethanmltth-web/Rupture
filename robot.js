import { ARENA, P, ENEMY, FPS, BULLET_SPD_SCALE, SNIPER_TELEGRAPH } from './constants.js';
import { simulateDashPath } from './dashCurve.js';

const SAFE_PAD = 24;
const PREDICT = FPS * 3;
const BULLET_LOOK = PREDICT;
const HORIZON = PREDICT;

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wanderAt(homeX, homeY, wanderPhase, wanderR, spd, frames) {
  const phase = wanderPhase + (0.018 + spd * 0.002) * frames;
  let x = homeX + Math.cos(phase) * wanderR;
  let y = homeY + Math.sin(phase * 0.85) * wanderR * 0.75;
  x = clamp(x, ARENA.x + 24, ARENA.x + ARENA.w - 24);
  y = clamp(y, ARENA.y + 24, ARENA.y + ARENA.h - 24);
  return { x, y, phase };
}

function shooterTimerAt(timer, cd, framesAhead) {
  let t = timer - framesAhead;
  while (t <= 0) t += cd;
  return t;
}

function bulletClosestT(b, x, y) {
  const fireIn = b.fireIn || 0;
  const rx = x - b.x;
  const ry = y - b.y;
  const vx = b.vx;
  const vy = b.vy;
  const v2 = vx * vx + vy * vy;
  if (v2 < 0.01) return null;
  let tPath = -(rx * vx + ry * vy) / v2;
  tPath = clamp(tPath, 0, HORIZON - fireIn);
  const totalT = fireIn + tPath;
  const cx = b.x + vx * tPath;
  const cy = b.y + vy * tPath;
  return { totalT, cx, cy, dist: dist(x, y, cx, cy) };
}

function bulletDangerAt(b, x, y, pr) {
  const hit = bulletClosestT(b, x, y);
  if (!hit) return 0;
  const r = pr + b.r + SAFE_PAD;
  if (hit.dist >= r * 3.5) return 0;
  const nearBoost = hit.totalT < 30 ? 1.35 : hit.totalT < 90 ? 1.0 : 0.65;
  return ((r * 3.5 - hit.dist) / (r * 3.5)) ** 2
    * (1.4 - hit.totalT / (HORIZON + 10)) * nearBoost;
}

export class RobotCtrl {
  constructor() {
    this._axis = { x: 1, y: 0 };
    this._smooth = { x: 1, y: 0 };
    this._drift = Math.random() * Math.PI * 2;
    this._dash = false;
    this._stopDash = false;
    this._lock = false;
    this._quick = false;
    this._abilityCd = 0;
  }

  axis() { return this._axis; }
  wantDash() { return this._dash; }
  wantDashStop() { return this._stopDash; }
  wantLock() { return this._lock; }
  wantQuick() { return this._quick; }

  compute(player, world, abilities) {
    this._dash = false;
    this._stopDash = false;
    this._lock = false;
    this._quick = false;
    if (!player.alive) return;

    const px = player.x;
    const py = player.y;
    const pr = P.r;
    const virtualBullets = this.gatherBulletField(world, px, py);
    const rupture = world.levelName() === 'RUPTURE' || world.levelName() === 'CHAOS';
    const dashBullets = virtualBullets.filter(b => (b.fireIn || 0) <= 90);
    const threats = this.collectThreats(world, px, py, pr, virtualBullets);
    const danger = this.dangerAt(px, py, world, pr, virtualBullets, px, py);
    const maxUrgency = threats.reduce((m, t) => Math.max(m, t.urgency), 0);
    const locking = abilities.isLocking?.() ?? false;
    const incomingSoon = threats.filter(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.t < 40,
    ).length;
    const shootersWinding = this.shootersWindingUp(world);
    const bulletNear = threats.some(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.t < (rupture ? 32 : 26),
    );
    const underPressure = danger > 0.35 || maxUrgency > 0.08 || bulletNear
      || shootersWinding || incomingSoon >= 1;
    const dangerous = danger > 0.8 || maxUrgency > 0.15 || bulletNear
      || (rupture && (shootersWinding || incomingSoon >= 2));
    const enemies = world.allEnemies();
    const enemiesLeft = enemies.length;

    if (player.dashing) {
      if (player.dashFrame >= 2 && this.shouldStopDash(
        px, py, pr, player, world, threats, dashBullets, virtualBullets,
      )) {
        this._stopDash = true;
      } else {
        const steer = this.pickDashCurve(
          px, py, pr, player, world, threats, dashBullets, virtualBullets,
        );
        this._axis = steer.x || steer.y ? steer : norm(player.dashDir.x, player.dashDir.y);
        this._smooth = { ...this._axis };
      }
    } else {
      this._chCache = new Map();

      let dashDir = this.pickBestDash(
        px, py, pr, world, threats, dashBullets, virtualBullets,
        { underPressure, dangerous, rupture, locking },
      );

      if (!dashDir) {
        dashDir = this.pickSafestDash(px, py, pr, world, threats, dashBullets, virtualBullets, true)
          || this.pickZeroHitDash(px, py, pr, world, dashBullets, virtualBullets);
      }

      if (dashDir || enemiesLeft) {
        this._dash = true;
        this._axis = dashDir || this._smooth;
        this._smooth = dashDir ? { ...dashDir } : { ...this._axis };
      } else {
        const move = this.pickMove(
          px, py, pr, world, threats, virtualBullets, dashBullets,
          maxUrgency, locking, false, dangerous,
        );
        const blend = dangerous ? 0.85 : 0.35;
        this._smooth.x += (move.x - this._smooth.x) * blend;
        this._smooth.y += (move.y - this._smooth.y) * blend;
        this._axis = norm(this._smooth.x, this._smooth.y);
      }
    }

    this.applyCombat(world, abilities, {
      maxUrgency, danger, bulletNear, locking, enemiesLeft,
      rupture, shootersWinding, incomingSoon, underPressure, dashing: player.dashing,
    });
  }

  pickBestDash(px, py, pr, world, threats, dashBullets, virtualBullets, ctx) {
    const { rupture } = ctx;
    const bulletThreat = threats.some(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.t < 55,
    ) || dashBullets.some(b => (b.fireIn || 0) <= 35);

    if (bulletThreat) {
      const zero = this.pickZeroHitDash(px, py, pr, world, dashBullets, virtualBullets);
      if (zero) return zero;

      const bulletDash = this.pickBulletDash(px, py, pr, world, threats, dashBullets, virtualBullets);
      if (bulletDash) return bulletDash;

      const preempt = this.pickPreemptiveDash(px, py, pr, world, threats, dashBullets, virtualBullets);
      if (preempt) return preempt;
    }

    const chaserPerfect = this.pickChaserPerfectDash(px, py, pr, world, dashBullets, virtualBullets);
    if (chaserPerfect) return chaserPerfect;

    if (this.nearestChaserDist(px, py, world) < 200) {
      const chaserEscape = this.pickChaserEscapeDash(
        px, py, pr, world, dashBullets, virtualBullets,
      );
      if (chaserEscape) return chaserEscape;
    }

    const curved = this.pickCurvedInitialDash(
      px, py, pr, world, threats, dashBullets, virtualBullets,
    );
    if (curved) return curved;

    if (!bulletThreat) {
      const preempt = this.pickPreemptiveDash(px, py, pr, world, threats, dashBullets, virtualBullets);
      if (preempt) return preempt;
    }

    const spreadDash = this.pickSpreadDash(px, py, pr, world, threats, dashBullets, virtualBullets, rupture);
    if (spreadDash) return spreadDash;

    if (!bulletThreat) {
      const bulletDash = this.pickBulletDash(px, py, pr, world, threats, dashBullets, virtualBullets);
      if (bulletDash) return bulletDash;
    }

    const dodge = this.pickDash(px, py, pr, world, threats, dashBullets, virtualBullets, ctx.locking);
    if (dodge) return dodge;

    const retreat = this.pickRetreatDash(px, py, pr, world, threats, dashBullets, virtualBullets);
    if (retreat) return retreat;

    return this.pickSafestDash(px, py, pr, world, threats, dashBullets, virtualBullets, true)
      || this.pickZeroHitDash(px, py, pr, world, dashBullets, virtualBullets);
  }

  shootersWindingUp(world) {
    for (const t of world.turrets) {
      if (t.hp > 0 && (t.telegraph || t.timer <= 18)) return true;
    }
    for (const s of world.sprayers) {
      if (s.hp > 0 && s.timer <= 14) return true;
    }
    for (const sn of world.snipers) {
      if (sn.hp > 0 && (sn.telegraph || sn.timer <= 20)) return true;
    }
    for (const m of world.mines) {
      if (m.hp > 0 && m.timer <= 16) return true;
    }
    for (const o of world.orbiters) {
      if (o.hp > 0 && o.timer <= 14) return true;
    }
    return false;
  }

  applyCombat(world, abilities, ctx) {
    if (!ctx.enemiesLeft) return;

    if (this._abilityCd > 0) {
      this._abilityCd--;
      return;
    }
    if (abilities.ready2()) this._quick = true;
    if (abilities.ready1() && !abilities.isLocking()) this._lock = true;
    if (this._lock || this._quick) this._abilityCd = 15;
  }

  pickCurvedInitialDash(px, py, pr, world, threats, dashBullets, virtualBullets) {
    let bestDir = null;
    let bestHits = Infinity;
    let bestScore = -Infinity;

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      const initDir = { x: Math.cos(ang), y: Math.sin(ang) };
      const steerCandidates = [initDir];

      for (const th of threats) {
        if (th.vx !== undefined) {
          steerCandidates.push(norm(-th.vy, th.vx), norm(th.vy, -th.vx));
        }
        if (th.fx !== undefined) {
          steerCandidates.push({ x: th.fx, y: th.fy });
        }
      }

      for (const [, group] of this.groupBursts(virtualBullets)) {
        if (group.length >= 2) {
          steerCandidates.push(...this.gapDirectionsForBurst(group, px, py));
        }
      }

      for (const raw of steerCandidates) {
        if (!raw.x && !raw.y) continue;
        const steer = norm(raw.x, raw.y);
        const hits = this.pathHitsCurvedDash(
          px, py, initDir, initDir, 0, steer, dashBullets, pr, P.dashLen,
        );
        const end = simulateDashPath(
          px, py, initDir, initDir, 0, steer, P.dashLen, P.dashSpd,
        );
        let score = -this.dangerAt(end.x, end.y, world, pr, virtualBullets, px, py) * 3.5;
        score -= hits * 900;
        if (this.chaserContactAfterInvuln(end.pts, world, pr)) score -= 1600;
        else if (this.chaserPerfectInDir(px, py, initDir, world, pr)) score += 350;

        const target = world.priorityEnemy(px, py);
        if (target && hits === 0 && target.type !== 'chaser') {
          const toward = norm(target.x - end.x, target.y - end.y);
          score += (end.dir.x * toward.x + end.dir.y * toward.y) * 140;
        }

        if (hits < bestHits || (hits === bestHits && score > bestScore)) {
          bestHits = hits;
          bestScore = score;
          bestDir = initDir;
        }
      }
    }

    return bestHits === 0 ? bestDir : null;
  }

  /** Chaser contact only after dash i-frames — safe during perfect-weave kills. */
  chaserContactAfterInvuln(pathPts, world, pr, pad = 2) {
    if (pathPts.length < 2) return false;

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let cx = c.x;
      let cy = c.y;
      for (let i = 1; i < pathPts.length; i++) {
        const { x, y } = pathPts[i];
        const toP = norm(x - cx, y - cy);
        cx += toP.x * c.spd;
        cy += toP.y * c.spd;
        cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
        cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
        if (i > P.dashIFrame && dist(x, y, cx, cy) < pr + c.r + pad) return true;
      }
    }
    return false;
  }

  /** True if dashing `dir` lets perfect window (frames 1–3) delete a chaser. */
  chaserPerfectInDir(px, py, dir, world, pr) {
    const lethalIn = P.perfectLethalFrames;
    const ddx = dir.x * P.dashSpd;
    const ddy = dir.y * P.dashSpd;

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let tpx = px;
      let tpy = py;
      let cx = c.x;
      let cy = c.y;

      for (let dashF = 1; dashF <= P.perfectWindow; dashF++) {
        tpx += ddx;
        tpy += ddy;
        let pcx = cx;
        let pcy = cy;
        let checkPx = tpx;
        let checkPy = tpy;

        for (let f = 0; f <= lethalIn; f++) {
          if (dist(checkPx, checkPy, pcx, pcy) < pr + c.r) return c;
          const toP = norm(checkPx - pcx, checkPy - pcy);
          pcx += toP.x * c.spd;
          pcy += toP.y * c.spd;
          checkPx += ddx;
          checkPy += ddy;
        }

        const toP = norm(tpx - cx, tpy - cy);
        cx += toP.x * c.spd;
        cy += toP.y * c.spd;
        cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
        cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
      }
    }
    return null;
  }

  pickChaserPerfectDash(px, py, pr, world, dashBullets, virtualBullets) {
    if (!world.chasers.some(c => c.hp > 0)) return null;

    let bestDir = null;
    let bestScore = -Infinity;
    const candidates = [];

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      candidates.push(norm(c.x - px, c.y - py));
    }

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      candidates.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }

    for (const raw of candidates) {
      if (!raw.x && !raw.y) continue;
      const dir = norm(raw.x, raw.y);
      const target = this.chaserPerfectInDir(px, py, dir, world, pr);
      if (!target) continue;
      if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) continue;
      if (this.chaserContactAfterInvuln(this.straightDashPts(px, py, dir), world, pr)) continue;

      const endX = px + dir.x * P.dashSpd * P.dashLen;
      const endY = py + dir.y * P.dashSpd * P.dashLen;
      if (endX < ARENA.x + pr || endX > ARENA.x + ARENA.w - pr
        || endY < ARENA.y + pr || endY > ARENA.y + ARENA.h - pr) {
        continue;
      }

      let score = 500 - dist(px, py, target.x, target.y) * 0.15;
      score -= this.dangerAt(endX, endY, world, pr, virtualBullets, px, py);

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  pickPerfectWeaveSteer(px, py, pr, player, world, virtualBullets) {
    const lethalF = P.perfectLethalFrames;
    const ddx = player.dashDir.x * P.dashSpd;
    const ddy = player.dashDir.y * P.dashSpd;
    let bestSteer = null;
    let bestPri = -1;

    const checkBullet = (bx, by, vx, vy, br, pri) => {
      let tpx = px;
      let tpy = py;
      for (let f = 0; f <= lethalF; f++) {
        const bulletX = bx + vx * f;
        const bulletY = by + vy * f;
        if (dist(tpx, tpy, bulletX, bulletY) < pr + br) {
          const steer = norm(bulletX - px, bulletY - py);
          if (pri > bestPri) {
            bestPri = pri;
            bestSteer = steer;
          }
          return;
        }
        tpx += ddx;
        tpy += ddy;
      }
    };

    for (const b of world.bullets) {
      if (b.life <= 0) continue;
      checkBullet(b.x, b.y, b.vx, b.vy, b.r, 1.6);
    }

    for (const b of virtualBullets) {
      const fireIn = b.fireIn || 0;
      if (fireIn > lethalF + 2) continue;
      checkBullet(b.x, b.y, b.vx, b.vy, b.r, 1.2 / (1 + fireIn * 0.08));
    }

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let cx = c.x;
      let cy = c.y;
      let tpx = px;
      let tpy = py;
      for (let f = 0; f <= lethalF; f++) {
        if (dist(tpx, tpy, cx, cy) < pr + c.r) {
          const pri = 2.8 - f * 0.08;
          const steer = norm(cx - tpx, cy - tpy);
          if (pri > bestPri) {
            bestPri = pri;
            bestSteer = steer;
          }
          break;
        }
        tpx += ddx;
        tpy += ddy;
        const toP = norm(tpx - cx, tpy - cy);
        cx += toP.x * c.spd;
        cy += toP.y * c.spd;
        cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
        cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
      }
    }

    return bestSteer;
  }

  pathHitsChasersAlongCurve(px, py, dashDir, startDir, curveHold, steer, world, pr, frames) {
    const { pts } = simulateDashPath(
      px, py, dashDir, startDir, curveHold, steer, frames, P.dashSpd,
    );
    return this.chaserContactAlongPath(pts, world, pr) ? 1 : 0;
  }

  nearestChaserDist(px, py, world) {
    let best = Infinity;
    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      best = Math.min(best, dist(px, py, c.x, c.y));
    }
    return best;
  }

  straightDashPts(px, py, dir, steps = P.dashLen) {
    const pts = [{ x: px, y: py }];
    let x = px;
    let y = py;
    for (let f = 1; f <= steps; f++) {
      x += dir.x * P.dashSpd;
      y += dir.y * P.dashSpd;
      pts.push({ x, y });
    }
    return pts;
  }

  /** Chasers chase the player each step along pathPts (matches world.update order). */
  chaserContactAlongPath(pathPts, world, pr, pad = 2) {
    if (pathPts.length < 2) return false;

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let cx = c.x;
      let cy = c.y;
      for (let i = 1; i < pathPts.length; i++) {
        const { x, y } = pathPts[i];
        const toP = norm(x - cx, y - cy);
        cx += toP.x * c.spd;
        cy += toP.y * c.spd;
        cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
        cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
        if (dist(x, y, cx, cy) < pr + c.r + pad) return true;
      }
    }
    return false;
  }

  chaserEndState(px, py, dir, world, steps = P.dashLen) {
    const pts = this.straightDashPts(px, py, dir, steps);
    const out = [];
    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let cx = c.x;
      let cy = c.y;
      for (let i = 1; i < pts.length; i++) {
        const { x, y } = pts[i];
        const toP = norm(x - cx, y - cy);
        cx += toP.x * c.spd;
        cy += toP.y * c.spd;
        cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
        cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
      }
      const endPlayer = pts[pts.length - 1];
      out.push({
        chaser: c,
        x: cx,
        y: cy,
        endDist: dist(endPlayer.x, endPlayer.y, cx, cy),
        startDist: dist(px, py, c.x, c.y),
      });
    }
    return out;
  }

  pickChaserEscapeDash(px, py, pr, world, dashBullets, virtualBullets) {
    const live = world.chasers.filter(c => c.hp > 0);
    if (!live.length) return null;

    let bestDir = null;
    let bestScore = -Infinity;
    const candidates = [];

    for (const c of live) {
      candidates.push(norm(px - c.x, py - c.y));
      candidates.push(norm(-(py - c.y), px - c.x));
      candidates.push(norm(py - c.y, -(px - c.x)));
    }

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      candidates.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }

    for (const raw of candidates) {
      if (!raw.x && !raw.y) continue;
      const dir = norm(raw.x, raw.y);
      if (this.chaserContactAlongPath(this.straightDashPts(px, py, dir), world, pr)) continue;
      if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) continue;

      const endX = px + dir.x * P.dashSpd * P.dashLen;
      const endY = py + dir.y * P.dashSpd * P.dashLen;
      if (endX < ARENA.x + pr || endX > ARENA.x + ARENA.w - pr
        || endY < ARENA.y + pr || endY > ARENA.y + ARENA.h - pr) {
        continue;
      }

      let score = 0;
      for (const st of this.chaserEndState(px, py, dir, world)) {
        score += (st.endDist - st.startDist) * 2.4;
        const flee = norm(px - st.chaser.x, py - st.chaser.y);
        score += (dir.x * flee.x + dir.y * flee.y) * 55;
        const safe = pr + st.chaser.r + 18;
        if (st.endDist < safe) score -= (safe - st.endDist) * 28;
      }

      score -= this.dangerAt(endX, endY, world, pr, virtualBullets, px, py) * 2.5;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestScore > -500 ? bestDir : null;
  }

  chaserGapPenalty(px, py, dir, world, pr) {
    let penalty = 0;
    for (const st of this.chaserEndState(px, py, dir, world)) {
      const gapSafe = pr + st.chaser.r + 14;
      if (st.endDist < gapSafe) penalty += (gapSafe - st.endDist) * 35;
    }
    return penalty;
  }

  idealAnchor(world, px, py) {
    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    const idx = world.levelIdx;
    const name = world.levelName();

    if (name === 'RUPTURE' || name === 'CHAOS') {
      const leftPocket = { x: ARENA.x + ARENA.w * 0.22, y: ARENA.y + ARENA.h * 0.68 };
      const rightPocket = { x: ARENA.x + ARENA.w * 0.78, y: ARENA.y + ARENA.h * 0.68 };
      const ch = world.chasers.find(c => c.hp > 0);
      let pocket = px < cx ? leftPocket : rightPocket;

      if (ch && ch.y < py) {
        const fromCh = norm(pocket.x - ch.x, pocket.y - ch.y);
        pocket = { x: pocket.x + fromCh.x * 40, y: pocket.y + fromCh.y * 35 };
      }

      for (const s of world.sprayers) {
        if (s.hp <= 0) continue;
        const away = norm(pocket.x - s.x, pocket.y - s.y);
        pocket.x += away.x * 35;
        pocket.y += away.y * 35;
      }

      pocket.x = clamp(pocket.x, ARENA.x + 60, ARENA.x + ARENA.w - 60);
      pocket.y = clamp(pocket.y, ARENA.y + 80, ARENA.y + ARENA.h - 50);
      return { x: pocket.x, y: pocket.y, weight: 0.62 };
    }

    if (name === 'CROSSFIRE' || (world.turrets.filter(t => t.hp > 0).length >= 2 && idx >= 1)) {
      return { x: cx, y: cy, weight: 0.35 };
    }

    if (name === 'SPIRAL') {
      const t = world.turrets.find(tr => tr.hp > 0);
      if (t) {
        const away = norm(px - t.x, py - t.y);
        return { x: px + away.x * 120, y: py + away.y * 120, weight: 0.4 };
      }
    }

    if (name === 'HUNT') {
      return { x: cx, y: cy - 40, weight: 0.3 };
    }

    if (name === 'BURST') {
      const s = world.sprayers.find(sp => sp.hp > 0);
      if (s) {
        const away = norm(px - s.x, py - s.y);
        return { x: px + away.x * 80, y: py + away.y * 80, weight: 0.25 };
      }
      return { x: cx, y: cy - 30, weight: 0.3 };
    }

    if (name === 'ORBIT' || name === 'CHAOS') {
      return { x: cx, y: cy, weight: 0.38 };
    }

    if (name === 'SNIPER') {
      return { x: cx, y: cy + 30, weight: 0.32 };
    }

    if (name === 'MINES') {
      return { x: cx, y: cy - 50, weight: 0.35 };
    }

    return { x: cx, y: cy, weight: 0.2 };
  }

  orbiterPosAt(o, frames) {
    const ang = o.phase + o.orbitSpd * frames;
    return {
      x: o.homeX + Math.cos(ang) * o.orbitR,
      y: o.homeY + Math.sin(ang) * o.orbitR,
    };
  }

  shooterPosAt(s, fireFrame, wander) {
    if (s.kind === 'orbiter') return this.orbiterPosAt(s, fireFrame);
    if (wander && s.wanderPhase !== undefined) {
      return wanderAt(s.homeX, s.homeY, s.wanderPhase, s.wanderR, s.spd || 3, fireFrame);
    }
    return { x: s.homeX, y: s.homeY };
  }

  anchorBias(world, px, py, nx, ny) {
    const anchor = this.idealAnchor(world, px, py);
    const before = dist(px, py, anchor.x, anchor.y);
    const after = dist(nx, ny, anchor.x, anchor.y);
    return (before - after) * anchor.weight;
  }

  // Live bullets + full 3s simulation of wandering shooters and all future shots
  gatherBulletField(world, px, py) {
    const list = [];

    for (const b of world.bullets) {
      list.push({
        x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, fireIn: 0, src: 'live',
        rayAng: Math.atan2(b.vy, b.vx),
        originX: b.x, originY: b.y,
      });
    }

    this.tagLiveBursts(list, world);

    const wander = world.levelIdx > 0;

    for (const t of world.turrets) {
      if (t.hp <= 0) continue;
      this.simulateShooterEvents(list, {
        kind: 'turret',
        x: t.x, y: t.y,
        homeX: t.homeX, homeY: t.homeY,
        wanderPhase: t.wanderPhase,
        wanderR: t.wanderR,
        timer: t.timer,
        cd: t.cd,
        spd: t.spd,
        burst: t.burst,
        spread: t.spread,
        bulletR: ENEMY.turret.bulletR,
        telegraph: !!t.telegraph,
      }, px, py, PREDICT, wander);
    }

    for (const s of world.sprayers) {
      if (s.hp <= 0) continue;
      this.simulateShooterEvents(list, {
        kind: 'sprayer',
        x: s.x, y: s.y,
        homeX: s.homeX, homeY: s.homeY,
        wanderPhase: s.wanderPhase,
        wanderR: s.wanderR,
        timer: s.timer,
        cd: s.cd,
        spd: s.spd,
        burst: 1,
        spread: 0,
        bulletR: ENEMY.sprayer.bulletR,
        telegraph: false,
      }, px, py, PREDICT, wander);
    }

    for (const o of world.orbiters) {
      if (o.hp <= 0) continue;
      this.simulateShooterEvents(list, {
        kind: 'orbiter',
        x: o.x, y: o.y,
        homeX: o.homeX, homeY: o.homeY,
        phase: o.phase,
        orbitR: o.orbitR,
        orbitSpd: o.orbitSpd,
        timer: o.timer,
        cd: o.cd,
        spd: o.spd,
        burst: ENEMY.orbiter.burst,
        spread: ENEMY.orbiter.spread,
        bulletR: ENEMY.orbiter.bulletR,
        telegraph: false,
      }, px, py, PREDICT, false);
    }

    for (const sn of world.snipers) {
      if (sn.hp <= 0) continue;
      this.simulateShooterEvents(list, {
        kind: 'sniper',
        x: sn.x, y: sn.y,
        homeX: sn.homeX, homeY: sn.homeY,
        wanderPhase: sn.wanderPhase,
        wanderR: sn.wanderR,
        timer: sn.timer,
        cd: sn.cd,
        spd: sn.spd,
        burst: 1,
        spread: 0,
        bulletR: ENEMY.sniper.bulletR,
        telegraph: !!sn.telegraph,
      }, px, py, PREDICT, wander);
    }

    for (const m of world.mines) {
      if (m.hp <= 0) continue;
      this.simulateShooterEvents(list, {
        kind: 'mine',
        x: m.x, y: m.y,
        homeX: m.homeX, homeY: m.homeY,
        wanderPhase: m.wanderPhase,
        wanderR: m.wanderR,
        timer: m.timer,
        cd: m.cd,
        spin: m.spin,
        burst: ENEMY.mine.burst,
        bulletR: ENEMY.mine.bulletR,
        spd: 4.8,
        telegraph: false,
      }, px, py, PREDICT, wander);
    }

    return list;
  }

  simulateShooterEvents(list, s, px, py, horizon, wander) {
    let shotIdx = 0;
    let fireFrame = Math.max(1, s.timer);
    let mineSpin = s.spin || 0;

    while (fireFrame <= horizon) {
      const pos = this.shooterPosAt(s, fireFrame, wander);
      const aim = norm(px - pos.x, py - pos.y);
      const burstId = `${s.kind}-${Math.round(s.homeX)}-${Math.round(s.homeY)}-${shotIdx}`;
      const bulletSpd = s.spd * BULLET_SPD_SCALE;

      if (s.kind === 'mine') {
        for (let i = 0; i < s.burst; i++) {
          const ang = mineSpin + (Math.PI * 2 * i) / s.burst;
          list.push({
            x: pos.x, y: pos.y,
            vx: Math.cos(ang) * bulletSpd,
            vy: Math.sin(ang) * bulletSpd,
            r: s.bulletR,
            fireIn: fireFrame,
            src: 'mine',
            burstId,
            burstCount: s.burst,
            originX: pos.x,
            originY: pos.y,
            rayAng: ang,
          });
        }
        mineSpin += 0.35;
      } else if (s.kind === 'turret' || s.kind === 'orbiter' || s.kind === 'sniper') {
        for (let i = 0; i < s.burst; i++) {
          const ang = Math.atan2(aim.y, aim.x) + (i - (s.burst - 1) / 2) * s.spread;
          list.push({
            x: pos.x, y: pos.y,
            vx: Math.cos(ang) * bulletSpd,
            vy: Math.sin(ang) * bulletSpd,
            r: s.bulletR,
            fireIn: fireFrame,
            src: s.kind,
            telegraph: s.telegraph && fireFrame <= (s.kind === 'sniper' ? SNIPER_TELEGRAPH + 2 : ENEMY.turret.telegraph + 2),
            burstId,
            burstCount: s.burst,
            originX: pos.x,
            originY: pos.y,
            rayAng: ang,
          });
        }
      } else {
        list.push({
          x: pos.x, y: pos.y,
          vx: aim.x * bulletSpd,
          vy: aim.y * bulletSpd,
          r: s.bulletR,
          fireIn: fireFrame,
          src: 'sprayer',
        });
      }

      shotIdx++;
      fireFrame += s.cd;
    }
  }

  filterDashBullets(bullets, px, py, pr) {
    const hitRad = pr + 12;
    const out = [];
    for (const b of bullets) {
      if ((b.fireIn || 0) > 72) continue;
      if (b.fireIn === 0) {
        out.push(b);
        continue;
      }
      const hit = bulletClosestT(b, px, py);
      if (hit && hit.dist < hitRad + b.r + 80) {
        out.push(b);
        continue;
      }
      if (dist(px, py, b.x, b.y) < 420) out.push(b);
    }
    return out.length ? out : bullets.filter(b => (b.fireIn || 0) <= 72);
  }

  tagLiveBursts(list, world) {
    for (const b of list) {
      if (b.src !== 'live') continue;
      for (const t of world.turrets) {
        if (t.hp <= 0) continue;
        const bAng = Math.atan2(b.vy, b.vx);
        const toB = Math.atan2(b.y - t.y, b.x - t.x);
        let diff = Math.abs(bAng - toB);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.4 && dist(b.x, b.y, t.x, t.y) < 420) {
          b.originX = t.x;
          b.originY = t.y;
          b.burstId = `live-t-${Math.round(t.x)}-${Math.round(t.y)}`;
          b.burstCount = t.burst;
          break;
        }
      }
    }

    const byTurret = new Map();
    for (const b of list) {
      if (!b.burstId?.startsWith('live-t')) continue;
      if (!byTurret.has(b.burstId)) byTurret.set(b.burstId, []);
      byTurret.get(b.burstId).push(b);
    }
    for (const [, group] of byTurret) {
      if (group.length < 2) continue;
      for (const b of group) b.burstCount = group.length;
    }

    const clusters = new Map();
    for (const b of list) {
      if (b.burstId || b.src !== 'live') continue;
      const key = `${Math.round(b.x / 6) * 6}-${Math.round(b.y / 6) * 6}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(b);
    }
    for (const [key, group] of clusters) {
      if (group.length < 2) continue;
      const bid = `live-${key}`;
      for (const b of group) {
        b.burstId = bid;
        b.burstCount = group.length;
        b.originX = group[0].x;
        b.originY = group[0].y;
      }
    }
  }

  collectThreats(world, px, py, pr, virtualBullets) {
    const list = [];

    for (const b of virtualBullets) {
      if ((b.fireIn || 0) > HORIZON) continue;
      const t = b.fireIn > 0
        ? this.futureBulletThreat(b.x, b.y, b.vx, b.vy, b.r, b.fireIn, px, py, pr)
        : this.bulletThreat(b, px, py, pr);
      if (!t) continue;
      list.push({
        ...t,
        kind: b.fireIn > 0 ? 'scheduled' : 'bullet',
        src: b.src,
        shootIn: b.fireIn,
      });
    }

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      const dd = dist(px, py, c.x, c.y);
      if (dd < 200) {
        list.push({
          fx: norm(px - c.x, py - c.y).x,
          fy: norm(px - c.x, py - c.y).y,
          weight: 18,
          urgency: clamp(1 - dd / 200, 0, 1) + (dd < pr + c.r + 30 ? 0.65 : 0),
          t: dd / Math.max(c.spd, 0.1),
          kind: 'chaser',
          retreat: dd < 160,
          enemy: 'chaser',
        });
      }
      list.push(...this.chaserThreats(c, px, py, pr));
    }

    for (const t of world.turrets) {
      if (t.hp <= 0) continue;
      list.push(...this.turretZoneThreat(t, px, py));
    }

    for (const s of world.sprayers) {
      if (s.hp <= 0) continue;
      list.push(...this.sprayerZoneThreat(s, px, py));
    }

    for (const o of world.orbiters) {
      if (o.hp <= 0) continue;
      list.push(...this.shooterZoneThreat(o, px, py, 300, 'orbiter'));
    }

    for (const sn of world.snipers) {
      if (sn.hp <= 0) continue;
      list.push(...this.shooterZoneThreat(sn, px, py, 340, 'sniper', sn.telegraph ? 0.25 : 0));
    }

    for (const m of world.mines) {
      if (m.hp <= 0) continue;
      list.push(...this.shooterZoneThreat(m, px, py, 270, 'mine', m.timer <= 16 ? 0.4 : 0));
    }

    return list;
  }

  shooterZoneThreat(e, px, py, range, kind, extra = 0) {
    const d = dist(px, py, e.x, e.y);
    if (d > range) return [];

    const flee = norm(px - e.x, py - e.y);
    const prox = clamp((range - d) / range, 0, 1);
    const shotSoon = clamp(1 - e.timer / e.cd, 0, 1);
    const tele = e.telegraph ? 0.45 : 0;
    const urgency = clamp(prox * prox * 0.85 + shotSoon * 0.35 + tele + extra, 0, 1);

    return [{
      fx: flee.x,
      fy: flee.y,
      weight: 6 + prox * 12 + shotSoon * 6 + tele * 8,
      urgency,
      t: e.timer,
      shootIn: e.timer,
      kind: 'proximity',
      retreat: d < range * 0.55 || (d < range * 0.82 && e.timer <= e.cd * 0.55),
      enemy: kind,
    }];
  }

  chaserThreats(c, px, py, pr) {
    const out = [];
    const d = dist(px, py, c.x, c.y);
    if (d > ENEMY.chaser.maxRange) return out;

    const flee = norm(px - c.x, py - c.y);
    const prox = clamp((ENEMY.chaser.maxRange - d) / ENEMY.chaser.maxRange, 0, 1);
    const contactIn = d / Math.max(c.spd + 0.5, 0.1);
    const urgency = prox * prox * 1.4 + (d < pr + ENEMY.chaser.r + 24 ? 0.75 : 0);

    out.push({
      fx: flee.x, fy: flee.y,
      weight: urgency * 14 + 4,
      urgency: clamp(urgency, 0, 1),
      t: contactIn,
      kind: 'chaser',
      retreat: d < 160,
      enemy: 'chaser',
    });

    for (let f = 1; f <= 120; f += 2) {
      const pos = this.predictChaserPos(c, px, py, f);
      const dd = dist(px, py, pos.x, pos.y);
      if (dd < pr + ENEMY.chaser.r + 22) {
        out.push({
          fx: flee.x, fy: flee.y,
          weight: 8 + (1 - dd / (pr + ENEMY.chaser.r + 20)) * 6,
          urgency: clamp(0.55 + (1 - f / 120) * 0.4, 0, 1),
          t: f,
          kind: 'chaser_path',
          retreat: true,
          enemy: 'chaser',
        });
        break;
      }
    }

    return out;
  }

  turretZoneThreat(t, px, py) {
    const out = [];
    const d = dist(px, py, t.x, t.y);
    if (d > 320) return out;

    const flee = norm(px - t.x, py - t.y);
    const shotProgress = clamp(1 - t.timer / t.cd, 0, 1);
    const tele = t.telegraph ? 0.4 : 0;
    const prox = clamp((320 - d) / 320, 0, 1);
    const urgency = clamp(prox * prox * 0.85 + shotProgress * 0.35 + tele, 0, 1);

    out.push({
      fx: flee.x, fy: flee.y,
      weight: 6 + prox * 12 + shotProgress * 6 + (t.telegraph ? 8 : 0),
      urgency,
      t: t.timer,
      shootIn: t.timer,
      impactIn: t.timer + d / Math.max(t.spd, 0.1),
      kind: 'proximity',
      retreat: d < 160 || (d < 220 && t.timer <= t.cd * 0.55),
      enemy: 'turret',
    });

    return out;
  }

  sprayerZoneThreat(s, px, py) {
    const out = [];
    const d = dist(px, py, s.x, s.y);
    if (d > 340) return out;

    const flee = norm(px - s.x, py - s.y);
    const shotProgress = clamp(1 - s.timer / s.cd, 0, 1);
    const prox = clamp((340 - d) / 340, 0, 1);
    const urgency = clamp(prox * prox * 0.95 + shotProgress * 0.55, 0, 1);

    out.push({
      fx: flee.x, fy: flee.y,
      weight: 8 + prox * 16 + shotProgress * 9,
      urgency,
      t: s.timer,
      shootIn: s.timer,
      impactIn: s.timer + d / Math.max(s.spd, 0.1),
      kind: 'proximity',
      retreat: d < 220 || (d < 260 && s.timer <= s.cd * 0.65),
      enemy: 'sprayer',
    });

    return out;
  }

  bulletThreat(b, px, py, pr) {
    const vx = b.vx;
    const vy = b.vy;
    const v2 = vx * vx + vy * vy;
    if (v2 < 0.01) return null;

    const rx = px - b.x;
    const ry = py - b.y;
    const t = -(rx * vx + ry * vy) / v2;
    if (t < 0 || t > BULLET_LOOK) return null;

    const cx = b.x + vx * t;
    const cy = b.y + vy * t;
    const d = dist(px, py, cx, cy);
    const hitRad = pr + b.r + SAFE_PAD;
    if (d > hitRad + 6) return null;

    const f = norm(px - cx, py - cy);
    const closeness = clamp(1 - d / (hitRad + 6), 0, 1);
    const timeFactor = clamp(1 - t / 120, 0, 1);
    const urgency = closeness * 0.55 + timeFactor * 0.45 + (t < 18 ? 0.45 : t < 36 ? 0.2 : 0);

    return { fx: f.x, fy: f.y, weight: urgency * 9 + 0.8, urgency, t, vx, vy };
  }

  futureBulletThreat(bx, by, vx, vy, br, fireIn, px, py, pr) {
    const v2 = vx * vx + vy * vy;
    if (v2 < 0.01) return null;

    const rx = px - bx;
    const ry = py - by;
    const tPath = -(rx * vx + ry * vy) / v2;
    if (tPath < 0 || tPath > BULLET_LOOK) return null;

    const cx = bx + vx * tPath;
    const cy = by + vy * tPath;
    const d = dist(px, py, cx, cy);
    const hitRad = pr + br + SAFE_PAD;
    if (d > hitRad + 12) return null;

    const totalT = fireIn + tPath;
    const closeness = clamp(1 - d / (hitRad + 12), 0, 1);
    const timeFactor = clamp(1 - totalT / (BULLET_LOOK + 20), 0, 1);
    const urgency = closeness * 0.5 + timeFactor * 0.4
      + (totalT < 18 ? 0.5 : totalT < 40 ? 0.25 : totalT < 70 ? 0.1 : 0);

    const f = norm(px - cx, py - cy);
    return { fx: f.x, fy: f.y, weight: urgency * 9 + 0.8, urgency, t: totalT, vx, vy };
  }

  groupBursts(virtualBullets) {
    const groups = new Map();
    for (const b of virtualBullets) {
      if (!b.burstId || (b.burstCount || 0) < 2) continue;
      if (!groups.has(b.burstId)) groups.set(b.burstId, []);
      groups.get(b.burstId).push(b);
    }
    return groups;
  }

  gapDirectionsForBurst(bullets, px, py) {
    const dirs = [];
    const rays = bullets
      .map(b => b.rayAng ?? Math.atan2(b.vy, b.vx))
      .sort((a, b) => a - b);

    for (let i = 0; i < rays.length - 1; i++) {
      const mid = (rays[i] + rays[i + 1]) / 2;
      dirs.push({ x: Math.cos(mid), y: Math.sin(mid) });
      dirs.push({ x: -Math.cos(mid), y: -Math.sin(mid) });
    }

    const ox = bullets[0].originX ?? bullets[0].x;
    const oy = bullets[0].originY ?? bullets[0].y;
    dirs.push(norm(px - ox, py - oy));
    dirs.push(norm(ox - px, oy - py));

    const center = rays[Math.floor(rays.length / 2)];
    dirs.push({ x: -Math.sin(center), y: Math.cos(center) });
    dirs.push({ x: Math.sin(center), y: -Math.cos(center) });

    for (let i = 0; i < rays.length; i++) {
      const a = rays[i] + Math.PI * 0.5;
      dirs.push({ x: Math.cos(a), y: Math.sin(a) });
      dirs.push({ x: Math.cos(a + Math.PI), y: Math.sin(a + Math.PI) });
    }

    return dirs;
  }

  burstThreatensPlayer(bullets, px, py, pr, minUrgency = 0.15) {
    let count = 0;
    for (const b of bullets) {
      const t = b.fireIn > 0
        ? this.futureBulletThreat(b.x, b.y, b.vx, b.vy, b.r, b.fireIn, px, py, pr)
        : this.bulletThreat(b, px, py, pr);
      if (t && t.urgency > minUrgency) count++;
    }
    return count;
  }

  pickPreemptiveDash(px, py, pr, world, threats, dashBullets, virtualBullets) {
    let need = false;
    for (const t of world.turrets) {
      if (t.hp > 0 && t.telegraph) need = true;
    }
    let sprayerSoon = 0;
    for (const s of world.sprayers) {
      if (s.hp > 0 && s.timer <= 16) sprayerSoon++;
    }
    if (sprayerSoon >= 2) need = true;

    for (const sn of world.snipers) {
      if (sn.hp > 0 && (sn.telegraph || sn.timer <= 18)) need = true;
    }
    for (const m of world.mines) {
      if (m.hp > 0 && m.timer <= 14) need = true;
    }
    for (const o of world.orbiters) {
      if (o.hp > 0 && o.timer <= 12) need = true;
    }

    const ch = world.chasers.find(c => c.hp > 0);
    if (ch && dist(px, py, ch.x, ch.y) < 130) need = true;

    if (!need) return null;

    let bestDir = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) continue;
      if (this.pathHitsChasers(px, py, dir, world, pr)) continue;
      const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, true);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    if (bestDir) return bestDir;

    for (const [, group] of this.groupBursts(virtualBullets)) {
      if (group.length < 2) continue;
      const minFire = Math.min(...group.map(b => b.fireIn || 0));
      if (minFire > 22 && !group.some(b => b.telegraph)) continue;
      if (this.burstThreatensPlayer(group, px, py, pr, 0.08) < 1) continue;
      const candidates = this.gapDirectionsForBurst(group, px, py);
      for (const raw of candidates) {
        const dir = norm(raw.x, raw.y);
        if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) continue;
        const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, true);
        if (score > bestScore) {
          bestScore = score;
          bestDir = dir;
        }
      }
    }

    return bestScore > -20 ? bestDir : null;
  }

  pickSpreadDash(px, py, pr, world, threats, dashBullets, virtualBullets, rupture = false) {
    const groups = this.groupBursts(virtualBullets);
    let bestDir = null;
    let bestHits = Infinity;
    let bestScore = -Infinity;
    const minThreats = rupture ? 1 : 2;
    const minUrgency = rupture ? 0.08 : 0.15;

    for (const [, bullets] of groups) {
      if (bullets.length < 2) continue;
      const threatens = this.burstThreatensPlayer(bullets, px, py, pr, minUrgency);
      const soon = bullets.some(b => (b.fireIn || 0) <= 28 || b.telegraph);
      if (threatens < minThreats && !(rupture && soon && threatens >= 1)) continue;

      const candidates = this.gapDirectionsForBurst(bullets, px, py);
      for (let i = 0; i < 12; i++) {
        const ang = (Math.PI * 2 * i) / 12;
        candidates.push({ x: Math.cos(ang), y: Math.sin(ang) });
      }

      for (const raw of candidates) {
        const dir = norm(raw.x, raw.y);
        const hits = this.pathHitsBullets(px, py, dir, dashBullets, pr);
        const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, true);

        if (hits < bestHits || (hits === bestHits && score > bestScore)) {
          bestHits = hits;
          bestScore = score;
          bestDir = dir;
        }
      }
    }

    for (const [, bullets] of groups) {
      if (bullets.length < 2) continue;
      if (this.burstThreatensPlayer(bullets, px, py, pr, minUrgency) < minThreats) continue;
      const liveGroup = bullets.every(b => b.fireIn === 0);
      if (liveGroup && bestHits > 0) {
        const retreat = norm(px - bullets[0].originX, py - bullets[0].originY);
        const hits = this.pathHitsBullets(px, py, retreat, dashBullets, pr);
        if (hits < bestHits) return retreat;
      }
    }

    return bestHits === 0 ? bestDir : (bestHits <= 1 ? bestDir : null);
  }

  shouldStopDash(px, py, pr, player, world, threats, dashBullets, virtualBullets) {
    if (player.dashFrame <= P.perfectWindow) {
      if (this.chaserPerfectInDir(px, py, player.dashDir, world, pr)) return false;
      if (this.pickPerfectWeaveSteer(px, py, pr, player, world, virtualBullets)) return false;
      return false;
    }

    const remaining = player.dashT;
    const nowDanger = this.dangerAt(px, py, world, pr, virtualBullets, px, py);
    const bulletNear = threats.some(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.t < 22,
    );

    const futurePts = this.straightDashPts(px, py, player.dashDir, remaining);
    const chaserAhead = this.chaserContactAfterInvuln(futurePts, world, pr);
    const continueHits = this.pathHitsBullets(px, py, player.dashDir, dashBullets, pr, remaining);

    if (continueHits > 0 && nowDanger < 0.55) return true;
    if (chaserAhead && nowDanger > 0.12) return false;
    if (chaserAhead && nowDanger <= 0.12) return true;

    if (bulletNear && nowDanger > 0.28) return false;

    const endX = px + player.dashDir.x * P.dashSpd * remaining;
    const endY = py + player.dashDir.y * P.dashSpd * remaining;
    const endDanger = this.dangerAt(endX, endY, world, pr, virtualBullets, px, py);

    if (nowDanger + 0.1 < endDanger && nowDanger < 0.4) return true;
    if (player.dashFrame >= P.perfectWindow + 1 && nowDanger < 0.2) return true;
    if (remaining <= 2 && nowDanger < 0.38) return true;

    return false;
  }

  pickDashCurve(px, py, pr, player, world, threats, dashBullets, virtualBullets) {
    const frames = player.dashT;
    if (frames <= 0) return { x: 0, y: 0 };

    if (player.dashFrame >= 1 && player.dashFrame <= P.perfectWindow) {
      const weave = this.pickPerfectWeaveSteer(px, py, pr, player, world, virtualBullets);
      if (weave) return weave;
    }

    const dashDir = player.dashDir;
    const startDir = player.dashStartDir;
    const hold = player.dashCurveHold;
    const candidates = [];

    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16;
      candidates.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }

    for (const [, group] of this.groupBursts(virtualBullets)) {
      if (group.length >= 2) {
        candidates.push(...this.gapDirectionsForBurst(group, px, py));
      }
    }

    for (const th of threats) {
      if (th.vx !== undefined) {
        candidates.push(norm(-th.vy, th.vx));
        candidates.push(norm(th.vy, -th.vx));
      }
      if (th.fx !== undefined && th.fy !== undefined) {
        candidates.push({ x: th.fx, y: th.fy });
      }
    }

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      candidates.push(norm(px - c.x, py - c.y));
    }

    let bestSteer = null;
    let bestScore = -Infinity;
    let bestHits = Infinity;
    let bestChaserHit = true;

    for (const raw of candidates) {
      if (!raw.x && !raw.y) continue;
      const steer = norm(raw.x, raw.y);
      const path = simulateDashPath(px, py, dashDir, startDir, hold, steer, frames, P.dashSpd);
      const hits = this.pathHitsCurvedDash(
        px, py, dashDir, startDir, hold, steer, dashBullets, pr, frames,
      );
      const chaserHit = this.chaserContactAfterInvuln(path.pts, world, pr);
      const end = path;
      let score = -this.dangerAt(end.x, end.y, world, pr, virtualBullets, px, py) * 3.5;
      score -= hits * 1200;
      if (chaserHit) score -= 1800;

      for (const th of threats) {
        if (th.fx === undefined) continue;
        const flee = end.dir.x * th.fx + end.dir.y * th.fy;
        const chWeight = th.kind === 'chaser' || th.kind === 'chaser_path' ? 12 : 7;
        if (flee > 0.05) score += th.urgency * chWeight;
        else score -= th.urgency * (chWeight * 0.45);
      }

      if (chaserHit && !bestChaserHit) continue;
      if (chaserHit === bestChaserHit && hits > bestHits) continue;
      if (chaserHit === bestChaserHit && hits === bestHits && score <= bestScore) continue;

      bestChaserHit = chaserHit;
      bestHits = hits;
      bestScore = score;
      bestSteer = steer;
    }

    return bestSteer || this.fallbackCurveSteer(threats, world, px, py);
  }

  fallbackCurveSteer(threats, world, px, py) {
    const chaser = world?.chasers?.find(c => c.hp > 0);
    if (chaser && dist(px, py, chaser.x, chaser.y) < 180) {
      return norm(px - chaser.x, py - chaser.y);
    }
    const bullet = threats.find(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.vx !== undefined,
    );
    if (bullet) return norm(-bullet.vy, bullet.vx);
    const prox = threats.find(t => t.kind === 'proximity' && t.fx !== undefined);
    if (prox) return { x: prox.fx, y: prox.fy };
    return { x: 0, y: 0 };
  }

  pathHitsCurvedDash(px, py, dashDir, startDir, curveHold, steer, bullets, pr, frames) {
    const { pts } = simulateDashPath(
      px, py, dashDir, startDir, curveHold, steer, frames, P.dashSpd,
    );
    const hitRad = pr + 10;
    for (let i = 1; i < pts.length; i++) {
      const { x, y } = pts[i];
      const f = i;
      for (const b of bullets) {
        const startF = b.fireIn || 0;
        if (f < startF) continue;
        const bf = f - startF;
        const bx = b.x + b.vx * bf;
        const by = b.y + b.vy * bf;
        if (dist(x, y, bx, by) < hitRad + b.r) return 1;
      }
    }
    return 0;
  }

  pathHitsBullets(px, py, dir, bullets, pr, steps = P.dashLen, stepSpd = P.dashSpd) {
    const hitRad = pr + 10;
    for (let f = 1; f <= steps; f++) {
      const x = px + dir.x * stepSpd * f;
      const y = py + dir.y * stepSpd * f;
      for (const b of bullets) {
        const startF = b.fireIn || 0;
        if (f < startF) continue;
        const bf = f - startF;
        const bx = b.x + b.vx * bf;
        const by = b.y + b.vy * bf;
        if (dist(x, y, bx, by) < hitRad + b.r) return 1;
      }
    }
    return 0;
  }

  predictChaserPos(c, ppx, ppy, frames) {
    const key = `${c.x | 0}_${c.y | 0}_${ppx | 0}_${ppy | 0}_${frames}`;
    const cached = this._chCache?.get(key);
    if (cached) return cached;

    let x = c.x;
    let y = c.y;
    for (let f = 0; f < frames; f++) {
      const d = norm(ppx - x, ppy - y);
      x += d.x * c.spd;
      y += d.y * c.spd;
      x = clamp(x, ARENA.x + 20, ARENA.x + ARENA.w - 20);
      y = clamp(y, ARENA.y + 20, ARENA.y + ARENA.h - 20);
    }
    const pos = { x, y };
    this._chCache?.set(key, pos);
    return pos;
  }

  pathHitsChasers(px, py, dir, world, pr) {
    return this.chaserContactAlongPath(this.straightDashPts(px, py, dir), world, pr);
  }

  pickBulletDash(px, py, pr, world, threats, dashBullets, virtualBullets) {
    const bullets = threats.filter(t =>
      (t.kind === 'bullet' || t.kind === 'scheduled') && t.t < 48,
    );
    if (!bullets.length) return null;

    let bestDir = null;
    let bestHits = Infinity;
    let bestScore = -Infinity;
    const candidates = [];

    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      candidates.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }

    for (const [, group] of this.groupBursts(virtualBullets)) {
      if (group.length >= 2) {
        candidates.push(...this.gapDirectionsForBurst(group, px, py));
      }
    }

    for (const th of bullets) {
      if (th.vx !== undefined) {
        candidates.push(norm(-th.vy, th.vx));
        candidates.push(norm(th.vy, -th.vx));
      }
    }

    for (const raw of candidates) {
      const dir = norm(raw.x, raw.y);
      const hits = this.pathHitsBullets(px, py, dir, dashBullets, pr);
      const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, true);
      if (hits < bestHits || (hits === bestHits && score > bestScore)) {
        bestHits = hits;
        bestScore = score;
        bestDir = dir;
      }
    }

    if (bestHits === 0) return bestDir;
    return null;
  }

  pickSafestDash(px, py, pr, world, threats, dashBullets, virtualBullets, panic = false) {
    let bestDir = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, panic);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestScore > -900 ? bestDir : null;
  }

  pickZeroHitDash(px, py, pr, world, dashBullets, virtualBullets) {
    let bestDir = null;
    let bestDanger = Infinity;
    const a = ARENA;

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      let blocked = false;
      for (let f = 1; f <= P.dashLen; f++) {
        const x = px + dir.x * P.dashSpd * f;
        const y = py + dir.y * P.dashSpd * f;
        if (x < a.x + pr || x > a.x + a.w - pr || y < a.y + pr || y > a.y + a.h - pr) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) continue;
      if (this.chaserContactAfterInvuln(this.straightDashPts(px, py, dir), world, pr)) continue;
      const endX = px + dir.x * P.dashSpd * P.dashLen;
      const endY = py + dir.y * P.dashSpd * P.dashLen;
      const d = this.dangerAt(endX, endY, world, pr, virtualBullets, px, py);
      if (d < bestDanger) {
        bestDanger = d;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  dangerAt(x, y, world, pr, virtualBullets, ppx, ppy) {
    let d = 0;
    const a = ARENA;
    const wander = world.levelIdx > 0;

    if (x < a.x + 50) d += (50 - (x - a.x)) / 50 * 2.5;
    if (x > a.x + a.w - 50) d += (50 - (a.x + a.w - x)) / 50 * 2.5;
    if (y < a.y + 50) d += (50 - (y - a.y)) / 50 * 2.5;
    if (y > a.y + a.h - 50) d += (50 - (a.y + a.h - y)) / 50 * 2.5;

    for (const b of virtualBullets) {
      d += bulletDangerAt(b, x, y, pr);
    }

    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      let cx = c.x;
      let cy = c.y;
      for (let f = 0; f <= HORIZON; f += 12) {
        const toP = norm(ppx - cx, ppy - cy);
        if (f > 0) {
          cx += toP.x * c.spd * 12;
          cy += toP.y * c.spd * 12;
          cx = clamp(cx, ARENA.x + 20, ARENA.x + ARENA.w - 20);
          cy = clamp(cy, ARENA.y + 20, ARENA.y + ARENA.h - 20);
        }
        const dd = dist(x, y, cx, cy);
        const r = pr + c.r + 16;
        if (dd < r * 3) {
          d += ((r * 3 - dd) / (r * 3)) ** 2 * (2.2 - f / (HORIZON + 16));
        }
      }
    }

    for (const t of world.turrets) {
      if (t.hp <= 0) continue;
      for (let f = 0; f <= HORIZON; f += 24) {
        const pos = wander
          ? wanderAt(t.homeX, t.homeY, t.wanderPhase, t.wanderR, t.spd, f)
          : { x: t.x, y: t.y };
        const dd = dist(x, y, pos.x, pos.y);
        if (dd < 320) {
          const prox = ((320 - dd) / 320) ** 2;
          const timerAt = shooterTimerAt(t.timer, t.cd, f);
          const shotSoon = clamp(1 - timerAt / t.cd, 0, 1);
          const weight = f < 60 ? 1 : 0.55;
          d += prox * (5 + shotSoon * 10 + (t.telegraph ? 6 : 0)) * weight;
        }
      }
    }

    for (const s of world.sprayers) {
      if (s.hp <= 0) continue;
      for (let f = 0; f <= HORIZON; f += 24) {
        const pos = wander
          ? wanderAt(s.homeX, s.homeY, s.wanderPhase, s.wanderR, s.spd, f)
          : { x: s.x, y: s.y };
        const dd = dist(x, y, pos.x, pos.y);
        if (dd < 290) {
          const prox = ((290 - dd) / 290) ** 2;
          const timerAt = shooterTimerAt(s.timer, s.cd, f);
          const shotSoon = clamp(1 - timerAt / s.cd, 0, 1);
          const weight = f < 60 ? 1.1 : 0.6;
          d += prox * (6 + shotSoon * 12) * weight;
        }
      }
    }

    for (const o of world.orbiters) {
      if (o.hp <= 0) continue;
      for (let f = 0; f <= HORIZON; f += 20) {
        const pos = this.orbiterPosAt(o, f);
        const dd = dist(x, y, pos.x, pos.y);
        if (dd < 280) {
          const prox = ((280 - dd) / 280) ** 2;
          const timerAt = shooterTimerAt(o.timer, o.cd, f);
          const shotSoon = clamp(1 - timerAt / o.cd, 0, 1);
          d += prox * (5 + shotSoon * 11) * (f < 55 ? 1 : 0.55);
        }
      }
    }

    for (const sn of world.snipers) {
      if (sn.hp <= 0) continue;
      for (let f = 0; f <= HORIZON; f += 24) {
        const pos = wander
          ? wanderAt(sn.homeX, sn.homeY, sn.wanderPhase, sn.wanderR, 2.5, f)
          : { x: sn.x, y: sn.y };
        const dd = dist(x, y, pos.x, pos.y);
        if (dd < 330) {
          const prox = ((330 - dd) / 330) ** 2;
          const timerAt = shooterTimerAt(sn.timer, sn.cd, f);
          const shotSoon = clamp(1 - timerAt / sn.cd, 0, 1);
          d += prox * (7 + shotSoon * 14 + (sn.telegraph ? 8 : 0)) * (f < 50 ? 1.1 : 0.6);
        }
      }
    }

    for (const m of world.mines) {
      if (m.hp <= 0) continue;
      for (let f = 0; f <= HORIZON; f += 24) {
        const pos = wander
          ? wanderAt(m.homeX, m.homeY, m.wanderPhase, m.wanderR, 1.2, f)
          : { x: m.x, y: m.y };
        const dd = dist(x, y, pos.x, pos.y);
        if (dd < 250) {
          const prox = ((250 - dd) / 250) ** 2;
          const timerAt = shooterTimerAt(m.timer, m.cd, f);
          const shotSoon = clamp(1 - timerAt / m.cd, 0, 1);
          d += prox * (8 + shotSoon * 14) * (f < 45 ? 1.15 : 0.65);
        }
      }
    }

    const liveTurrets = world.turrets.filter(t => t.hp > 0);
    if (liveTurrets.length >= 2) {
      const left = liveTurrets.filter(t => t.x < ARENA.x + ARENA.w * 0.45).length;
      const right = liveTurrets.filter(t => t.x > ARENA.x + ARENA.w * 0.55).length;
      if (left > 0 && right > 0) {
        const midX = ARENA.x + ARENA.w / 2;
        d += Math.abs(x - midX) * 0.022;
      }
    }

    if (world.levelName() === 'RUPTURE' || world.levelName() === 'CHAOS') {
      const midX = ARENA.x + ARENA.w / 2;
      const midY = ARENA.y + ARENA.h * 0.48;
      d += Math.abs(x - midX) * 0.035;
      if (y > midY) d += (y - midY) * 0.028;
      if (y < ARENA.y + ARENA.h * 0.22) d += (ARENA.y + ARENA.h * 0.22 - y) * 0.02;
    }

    return d;
  }

  pickRetreatDash(px, py, pr, world, threats, dashBullets, virtualBullets) {
    let need = false;
    let urgency = 0;

    for (const th of threats) {
      if (!th.retreat) continue;
      if (th.urgency > urgency) urgency = th.urgency;
      need = true;
    }

    if (world.chasers.some(c => c.hp > 0)) {
      for (const c of world.chasers) {
        if (c.hp <= 0) continue;
        const dd = dist(px, py, c.x, c.y);
        if (dd < 140) need = true;
        urgency = Math.max(urgency, clamp(1 - dd / 160, 0, 1));
      }
    }

    if (!need || urgency < 0.12) return null;

    let bestDir = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 16; i++) {
      const ang = (Math.PI * 2 * i) / 16;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const score = this.scoreRetreatDash(px, py, pr, dir, world, dashBullets, virtualBullets);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestScore > -10 ? bestDir : null;
  }

  scoreRetreatDash(px, py, pr, dir, world, dashBullets, virtualBullets) {
    const a = ARENA;
    const endX = px + dir.x * P.dashSpd * P.dashLen;
    const endY = py + dir.y * P.dashSpd * P.dashLen;

    for (let f = 1; f <= P.dashLen; f++) {
      const x = px + dir.x * P.dashSpd * f;
      const y = py + dir.y * P.dashSpd * f;
      if (x < a.x + pr || x > a.x + a.w - pr || y < a.y + pr || y > a.y + a.h - pr) {
        return -999;
      }
    }

    if (this.pathHitsBullets(px, py, dir, dashBullets, pr) > 0) return -500;
    if (this.pathHitsChasers(px, py, dir, world, pr)) return -600;

    let score = -this.dangerAt(endX, endY, world, pr, virtualBullets, px, py) * 3;

    for (const st of this.chaserEndState(px, py, dir, world)) {
      score += (st.endDist - st.startDist) * 1.8;
    }

    for (const t of world.turrets) {
      if (t.hp <= 0) continue;
      score += (dist(endX, endY, t.x, t.y) - dist(px, py, t.x, t.y)) * 0.12;
    }
    for (const s of world.sprayers) {
      if (s.hp <= 0) continue;
      score += (dist(endX, endY, s.x, s.y) - dist(px, py, s.x, s.y)) * 0.13;
    }

    return score;
  }

  pickMove(px, py, pr, world, threats, virtualBullets, dashBullets, maxUrgency, locking, onDashCd, dangerous) {
    let best = null;
    let bestScore = Infinity;
    const rupture = world.levelName() === 'RUPTURE' || world.levelName() === 'CHAOS';
    const samples = dangerous ? (rupture ? 32 : 28) : 20;
    const lookAhead = dangerous ? (rupture ? 24 : 22) : 16;

    for (let i = 0; i < samples; i++) {
      const ang = (Math.PI * 2 * i) / samples;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const nx = px + dir.x * P.speed * lookAhead;
      const ny = py + dir.y * P.speed * lookAhead;
      let score = this.dangerAt(nx, ny, world, pr, virtualBullets, px, py);
      score += this.pathHitsBullets(px, py, dir, dashBullets, pr, 14, P.speed) * 45;
      score -= this.anchorBias(world, px, py, nx, ny);

      for (const th of threats) {
        const ahead = dir.x * th.fx + dir.y * th.fy;
        if (ahead < -0.1) score -= th.weight * 0.55;
        else if (ahead > 0.2) score += th.weight * 0.7;
      }

      if (score < bestScore) {
        bestScore = score;
        best = dir;
      }
    }

    if (maxUrgency < 0.2 && !dangerous) {
      this._drift += 0.018;
      const strafe = { x: Math.cos(this._drift), y: Math.sin(this._drift) };
      const anchor = this.idealAnchor(world, px, py);
      const toAnchor = norm(anchor.x - px, anchor.y - py);
      const anchorW = rupture ? 0.5 : 0.35;
      return norm(
        best.x * (1 - anchorW) + strafe.x * 0.15 + toAnchor.x * anchorW,
        best.y * (1 - anchorW) + strafe.y * 0.15 + toAnchor.y * anchorW,
      );
    }

    if (rupture && dangerous) {
      const anchor = this.idealAnchor(world, px, py);
      const toAnchor = norm(anchor.x - px, anchor.y - py);
      return norm(best.x * 0.55 + toAnchor.x * 0.45, best.y * 0.55 + toAnchor.y * 0.45);
    }

    return best || { x: 0, y: 0 };
  }

  pickDash(px, py, pr, world, threats, dashBullets, virtualBullets, locking) {
    const imminent = threats.filter(t =>
      t.urgency > 0.06 && t.t < 60,
    );
    if (!imminent.length) return null;

    let bestDir = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 32; i++) {
      const ang = (Math.PI * 2 * i) / 32;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, false);
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    for (const th of imminent) {
      if (th.vx !== undefined) {
        for (const dir of [norm(-th.vy, th.vx), norm(th.vy, -th.vx)]) {
          const score = this.scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, true);
          if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
          }
        }
      }
    }

    return bestScore > -900 ? bestDir : null;
  }

  scoreDash(px, py, pr, dir, world, threats, dashBullets, virtualBullets, bulletPriority) {
    const a = ARENA;

    for (let f = 1; f <= P.dashLen; f++) {
      const x = px + dir.x * P.dashSpd * f;
      const y = py + dir.y * P.dashSpd * f;
      if (x < a.x + pr || x > a.x + a.w - pr || y < a.y + pr || y > a.y + a.h - pr) {
        return -999;
      }
    }

    if (this.chaserContactAfterInvuln(this.straightDashPts(px, py, dir), world, pr)) return -1200;

    const bulletHits = this.pathHitsBullets(px, py, dir, dashBullets, pr);
    let score = -bulletHits * (bulletPriority ? 650 : 420);
    if (bulletHits > 0) score -= 1200;
    score -= this.chaserGapPenalty(px, py, dir, world, pr);

    const midX = px + dir.x * P.dashSpd * Math.ceil(P.dashLen * 0.5);
    const midY = py + dir.y * P.dashSpd * Math.ceil(P.dashLen * 0.5);
    score -= this.dangerAt(midX, midY, world, pr, virtualBullets, px, py) * 0.6;

    const endX = px + dir.x * P.dashSpd * P.dashLen;
    const endY = py + dir.y * P.dashSpd * P.dashLen;
    score -= this.dangerAt(endX, endY, world, pr, virtualBullets, px, py) * 3.2;

    for (const th of threats) {
      const dot = dir.x * th.fx + dir.y * th.fy;
      if (th.kind === 'chaser' || th.kind === 'chaser_path') {
        if (dot > 0.05) score -= th.urgency * 14;
        else score += th.urgency * 10;
      } else if (dot > 0.05) score -= th.urgency * 5;
      else score += th.urgency * 4;
    }

    if (bulletPriority) {
      for (const th of threats) {
        if (!th.vx) continue;
        const perp = Math.abs(dir.x * th.vx + dir.y * th.vy);
        score += (1 - perp) * th.urgency * 10;
      }
    }

    const target = world.priorityEnemy(px, py);
    if (target && bulletHits === 0 && target.type !== 'chaser'
      && this.nearestChaserDist(px, py, world) > 100) {
      const toward = norm(target.x - endX, target.y - endY);
      score += (dir.x * toward.x + dir.y * toward.y) * 90;
    }

    return score;
  }
}
