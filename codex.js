import { ENEMY_HP } from './constants.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export const ENEMY_CODEX = [
  {
    id: 'turret',
    name: 'Turret',
    tag: 'Red shots',
    color: '#ff3c50',
    sectors: 'Sectors 1–10',
    desc: 'Box turret with a pulsing red eye. Telegraphs before firing aimed bursts — single shots or multi-burst spreads depending on the sector.',
    tip: 'Watch the white telegraph ring — reposition or dash once it fires.',
  },
  {
    id: 'sprayer',
    name: 'Sprayer',
    tag: 'Green stream',
    color: '#3dff7a',
    sectors: 'Sector 5+',
    desc: 'Hexagonal pod that spews fast green tracking shots. Wanders the arena in later sectors, keeping pressure from unexpected angles.',
    tip: 'Break line of sight behind corners; green shots curve toward you.',
  },
  {
    id: 'chaser',
    name: 'Chaser',
    tag: 'Melee pursuit',
    color: '#ff5080',
    sectors: 'Sector 4+',
    desc: 'Spinning star blade that relentlessly hunts you down. Contact is lethal — but a PERFECT weave in dash frames 1–5 deletes it instantly.',
    tip: 'Dash through it early in the perfect window for a one-shot kill; other enemies only take 5% on weave.',
  },
  {
    id: 'orbiter',
    name: 'Orbiter',
    tag: 'Purple spread',
    color: '#9080ff',
    sectors: 'Sector 6+',
    desc: 'Circles a fixed anchor point while firing three-shot purple spreads. Dodge the orbit path and burst gaps together.',
    tip: 'Predict its orbit ring — gaps in the spread open between passes.',
  },
  {
    id: 'sniper',
    name: 'Sniper',
    tag: 'Orange beam',
    color: '#ff6040',
    sectors: 'Sector 7+',
    desc: 'Long-range rail unit with a bright lens telegraph. One heavy orange shot after a long wind-up — reposition early or dash through the gap.',
    tip: 'The lens flares white before firing — use the full telegraph window.',
  },
  {
    id: 'mine',
    name: 'Mine',
    tag: 'Amber ring',
    color: '#ff9040',
    sectors: 'Sector 8+',
    desc: 'Spiked spinner that primes before unleashing a six-way amber burst. Spike arms extend when it is about to fire.',
    tip: 'Spikes extend when primed — clear the ring or dash through a gap.',
  },
];

export class Codex {
  constructor(render, input, audio = null) {
    this.render = render;
    this.input = input;
    this.audio = audio;
    this.el = document.getElementById('codex');
    this.stage = document.getElementById('codex-stage');
    this.pageLabel = document.getElementById('codex-page-label');
    this.dots = document.getElementById('codex-dots');
    this.open = false;
    this.raf = 0;
    this.page = 0;
    this.anim = null;
    this.canvas = null;

    document.getElementById('btn-info').addEventListener('click', () => this.show());
    document.getElementById('codex-close').addEventListener('click', () => this.hide());
    document.getElementById('codex-prev').addEventListener('click', () => this.prev());
    document.getElementById('codex-next').addEventListener('click', () => this.next());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.buildDots();
    this.renderPage(0, false);
  }

  isOpen() {
    return this.open;
  }

  buildDots() {
    this.dots.innerHTML = '';
    for (let i = 0; i < ENEMY_CODEX.length; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'codex-dot';
      dot.setAttribute('aria-label', `Page ${i + 1}`);
      dot.addEventListener('click', () => this.goTo(i));
      this.dots.appendChild(dot);
    }
  }

  syncDots() {
    const children = this.dots.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('active', i === this.page);
    }
    this.pageLabel.textContent = `${this.page + 1} / ${ENEMY_CODEX.length}`;
  }

  renderPage(idx, animate = true) {
    const entry = ENEMY_CODEX[idx];
    this.page = idx;
    this.syncDots();

    const doRender = () => {
      this.stage.innerHTML = '';
      this.stage.style.setProperty('--accent', entry.color);

      const card = document.createElement('article');
      card.className = 'codex-page';

      const visual = document.createElement('div');
      visual.className = 'codex-page-visual';

      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      canvas.className = 'codex-page-canvas';
      visual.appendChild(canvas);
      this.canvas = canvas;

      const glow = document.createElement('div');
      glow.className = 'codex-page-glow';
      visual.appendChild(glow);

      const body = document.createElement('div');
      body.className = 'codex-page-body';
      body.innerHTML = `
        <div class="codex-page-head">
          <span class="codex-page-index">0${idx + 1}</span>
          <h3>${entry.name}</h3>
          <span class="codex-tag">${entry.tag}</span>
        </div>
        <p class="codex-hp">HP ${ENEMY_HP[entry.id]} · ${entry.sectors}</p>
        <p class="codex-desc">${entry.desc}</p>
        <p class="codex-tip"><strong>Tactic</strong> ${entry.tip}</p>
      `;

      card.append(visual, body);
      this.stage.appendChild(card);
      if (animate) {
        card.classList.add('enter');
      }
      this.drawThumb();
    };

    if (animate && this.stage.firstChild) {
      this.stage.classList.add('leaving');
      clearTimeout(this.anim);
      this.anim = setTimeout(() => {
        this.stage.classList.remove('leaving');
        doRender();
      }, 220);
    } else {
      doRender();
    }
  }

  drawThumb() {
    if (!this.canvas || !this.open) return;
    const entry = ENEMY_CODEX[this.page];
    const ctx = this.canvas.getContext('2d');
    const w = 160;
    const h = 160;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(80, 80, 10, 80, 80, 80);
    g.addColorStop(0, '#1e1e2e');
    g.addColorStop(1, '#0a0a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = entry.color + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    this.render.drawEnemyPreview(ctx, entry.id, 80, 84);

    if (this.open) {
      this.raf = requestAnimationFrame(() => this.drawThumb());
    }
  }

  goTo(idx) {
    if (idx === this.page) return;
    this.audio?.play('ui_select');
    this.renderPage(idx, true);
  }

  prev() {
    const n = ENEMY_CODEX.length;
    this.goTo((this.page - 1 + n) % n);
  }

  next() {
    const n = ENEMY_CODEX.length;
    this.goTo((this.page + 1) % n);
  }

  onKey(e) {
    if (!this.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.next();
    }
  }

  show() {
    this.open = true;
    this.input?.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.page = 0;
    this.renderPage(0, false);
    showLayer(this.el);
    cancelAnimationFrame(this.raf);
    this.drawThumb();
  }

  hide() {
    this.open = false;
    this.input?.setBlocked(false);
    this.audio?.play('ui_close');
    hideLayer(this.el, { ms: UI_MS });
    cancelAnimationFrame(this.raf);
    clearTimeout(this.anim);
  }
}
