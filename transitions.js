import { W, H } from './constants.js';

export const HUD_MS = 200;
export const UI_MS = 420;

const layerTimers = new WeakMap();

function clearLayerTimer(el) {
  const t = layerTimers.get(el);
  if (t) {
    clearTimeout(t);
    layerTimers.delete(el);
  }
}

/** Fade / slide a DOM overlay in. */
export function showLayer(el, { delay = 0 } = {}) {
  if (!el) return;
  if (el.classList.contains('ui-drawer')) {
    document.querySelectorAll('.ui-drawer').forEach((drawer) => {
      if (drawer !== el && !drawer.classList.contains('hide')) {
        hideLayer(drawer);
      }
    });
  }
  clearLayerTimer(el);
  el.classList.remove('hide', 'ui-hiding');
  const apply = () => requestAnimationFrame(() => el.classList.add('ui-visible'));
  if (delay > 0) {
    layerTimers.set(el, setTimeout(apply, delay));
  } else {
    apply();
  }
}

/** Fade / slide a DOM overlay out, then `display:none`. */
export function hideLayer(el, { ms = UI_MS } = {}) {
  if (!el) return;
  clearLayerTimer(el);
  el.classList.remove('ui-visible');
  el.classList.add('ui-hiding');
  layerTimers.set(el, setTimeout(() => {
    el.classList.add('hide');
    el.classList.remove('ui-hiding');
    layerTimers.delete(el);
  }, ms));
}

export function toggleLayer(el, visible, opts = {}) {
  if (visible) showLayer(el, opts);
  else hideLayer(el, opts);
}

/** Full-screen canvas fade (menu ↔ gameplay, death, sector change). */
export class SceneFade {
  constructor() {
    this.alpha = 0;
    this.target = 0;
    this.onMid = null;
    this.midFired = false;
  }

  fadeTo(v) {
    this.target = Math.max(0, Math.min(1, v));
    if (v < 1) this.midFired = false;
  }

  snap(v) {
    this.alpha = this.target = Math.max(0, Math.min(1, v));
    this.midFired = false;
  }

  through(midFn) {
    this.onMid = midFn;
    this.midFired = false;
    this.fadeTo(1);
  }

  update(dtSec) {
    const k = 1 - Math.exp(-9 * dtSec);
    this.alpha += (this.target - this.alpha) * k;
    if (Math.abs(this.alpha - this.target) < 0.003) {
      this.alpha = this.target;
    }

    if (this.onMid && !this.midFired && this.target === 1 && this.alpha >= 0.92) {
      this.midFired = true;
      const fn = this.onMid;
      this.onMid = null;
      fn();
      this.fadeTo(0);
    }
  }

  draw(ctx, alpha = this.alpha) {
    if (alpha <= 0.001) return;
    ctx.fillStyle = `rgba(6, 6, 10, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  get busy() {
    return this.onMid !== null || Math.abs(this.alpha - this.target) > 0.02;
  }
}
