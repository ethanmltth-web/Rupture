/** Run up to `timeScale` worth of 0–1 logic slices per fixed tick. */
export function scaledSteps(timeScale, onStep) {
  let left = Math.max(0, timeScale);
  while (left > 1e-5) {
    const step = Math.min(1, left);
    onStep(step);
    left -= step;
  }
}

/** Decrement a timer by scaled delta; returns fired count and new timer value. */
export function advanceTimer(timer, cd, timeScale) {
  let t = timer - timeScale;
  let fired = 0;
  while (t <= 0) {
    fired++;
    t += cd;
  }
  return { timer: t, fired };
}
