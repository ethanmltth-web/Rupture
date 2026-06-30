import { P } from './constants.js';

function normAng(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function angOf(v) {
  return Math.atan2(v.y, v.x);
}

/** Smooth 0–1 ease (fade in/out). */
export function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Signed angle from `from` to `to`. */
export function angleFromTo(from, to) {
  return normAng(angOf(to) - angOf(from));
}

/**
 * One frame of dash curve toward WASD steer input.
 * Hold duration ramps turn rate; total bend from dash start is capped.
 */
export function curveDashStep(dashDir, dashStartDir, curveHold, steer, stepFrac = 1) {
  const frac = Math.max(0, Math.min(1, stepFrac));
  if (!steer.x && !steer.y) {
    return { dir: dashDir, hold: curveHold * (1 - 0.18 * frac), turned: 0 };
  }

  const hold = curveHold + frac;
  const sl = Math.hypot(steer.x, steer.y) || 1;
  const desired = { x: steer.x / sl, y: steer.y / sl };

  const holdFactor = Math.min(1, hold / Math.max(1, P.dashLen * 0.32));
  const maxStep = P.dashCurveRate * (0.5 + 0.5 * holdFactor) * frac;

  const curAng = angOf(dashDir);
  const targetAng = angOf(desired);
  let delta = normAng(targetAng - curAng);
  const step = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);

  const startAng = angOf(dashStartDir);
  let offset = normAng(curAng + step - startAng);
  const bendCap = P.dashCurveMax;
  offset = Math.max(-bendCap, Math.min(bendCap, offset));
  const newAng = startAng + offset;

  return {
    dir: { x: Math.cos(newAng), y: Math.sin(newAng) },
    hold,
    turned: Math.abs(step),
  };
}

/** Single dash logic-frame: curve steer, then advance along heading. */
export function dashFrameStep(px, py, dashDir, dashStartDir, curveHold, steer, stepSpd, stepFrac = 1) {
  const frac = stepSpd / P.dashSpd;
  const turn = curveDashStep(dashDir, dashStartDir, curveHold, steer, frac);
  return {
    x: px + turn.dir.x * stepSpd,
    y: py + turn.dir.y * stepSpd,
    dir: turn.dir,
    hold: turn.hold,
  };
}

/** Simulate remaining dash frames with constant steer input. */
export function simulateDashPath(x, y, dashDir, dashStartDir, curveHold, steer, frames, stepSpd) {
  let px = x;
  let py = y;
  let dir = { x: dashDir.x, y: dashDir.y };
  let hold = curveHold;
  const start = { x: dashStartDir.x, y: dashStartDir.y };
  const pts = [{ x: px, y: py }];

  for (let f = 0; f < frames; f++) {
    const next = dashFrameStep(px, py, dir, start, hold, steer, stepSpd);
    px = next.x;
    py = next.y;
    dir = next.dir;
    hold = next.hold;
    pts.push({ x: px, y: py });
  }

  return { x: px, y: py, dir, pts };
}

/** Denser points along the same simulated path (for smooth trajectory drawing). */
export function densifyPath(pts, slicesPerSeg = 3) {
  if (!pts || pts.length < 2) return pts || [];
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    for (let s = 1; s <= slicesPerSeg; s++) {
      const t = s / slicesPerSeg;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }
  return out;
}

/** Polyline preview for the full dash arc (traveled + projected). */
export function dashPreviewPoints(p, steer, stepSpd = P.dashSpd) {
  if (!p.alive || !p.dashing) return null;

  const traveled = p.dashPath?.length
    ? p.dashPath
    : [{ x: p.x, y: p.y }];

  const frames = Math.ceil(Math.max(0, p.dashT));
  if (frames <= 0) return densifyPath(traveled, 4);

  const { pts } = simulateDashPath(
    p.x, p.y, p.dashDir, p.dashStartDir, p.dashCurveHold,
    steer || { x: 0, y: 0 }, frames, stepSpd,
  );

  const combined = [...traveled];
  if (pts.length > 1) combined.push(...pts.slice(1));
  return densifyPath(combined, 4);
}

/** Curve-assist envelope: quick fade in, short fade out (0–1). */
export function dashAssistEnvelope(dashFrame, dashT, dashLen = P.dashLen) {
  const fadeInFrames = Math.max(1, dashLen * 0.1);
  const fadeOutFrames = Math.max(2, dashLen * 0.18);
  const fadeIn = smoothstep(Math.min(1, dashFrame / fadeInFrames));
  const fadeOut = smoothstep(Math.min(1, dashT / fadeOutFrames));
  return fadeIn * fadeOut;
}
