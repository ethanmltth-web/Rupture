import { showLayer, hideLayer, UI_MS } from './transitions.js';

export const COMBAT_INTEL = [
  {
    id: 'weave',
    name: 'Perfect Weave',
    tag: 'Core defense',
    color: '#ff3c50',
    desc: 'Dash frames 1–7 are a perfect window. Weave through bullets to destroy them, shave dash cooldown, and earn 5 WC per perfect weave. A perfect weave also resets your dash — chain weaves by staying in the window. Touch-lethal foes are deleted outright.',
    tip: 'Curve assist slows time while dashing — weave through dense patterns. Chain resets each sector if you go 3s without a perfect weave.',
  },
  {
    id: 'stomp',
    name: 'Stop Dash',
    tag: 'R — end dash early',
    color: '#ffd700',
    desc: 'Press stop-dash mid-dash to end your dash early. No combat effect — just control.',
    tip: 'Use it to bail out of a bad dash angle before you drift into danger.',
  },
  {
    id: 'chain',
    name: 'Chain Scoring',
    tag: 'Kill streak',
    color: '#ff3c50',
    desc: 'Perfect weaves earn 5 Weave Coins (WC) each and raise your chain counter. Higher chains boost audio pitch and HUD flair.',
    tip: 'Chain resets when you start a new sector. Complete challenges for 10–30 WC.',
  },
];

export class CombatIntel {
  constructor(input, audio = null) {
    this.input = input;
    this.audio = audio;
    this.el = document.getElementById('combat-intel');
    this.stage = document.getElementById('combat-intel-stage');
    this.pageLabel = document.getElementById('combat-intel-page-label');
    this.dots = document.getElementById('combat-intel-dots');
    this.open = false;
    this.page = 0;
    this.anim = null;

    const openBtn = document.getElementById('btn-combat-intel');
    if (openBtn) openBtn.addEventListener('click', () => this.show());
    document.getElementById('combat-intel-close')?.addEventListener('click', () => this.hide());
    document.getElementById('combat-intel-prev')?.addEventListener('click', () => this.prev());
    document.getElementById('combat-intel-next')?.addEventListener('click', () => this.next());
    this.el?.addEventListener('click', (e) => {
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
    if (!this.dots) return;
    this.dots.innerHTML = '';
    for (let i = 0; i < COMBAT_INTEL.length; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'codex-dot';
      dot.setAttribute('aria-label', `Page ${i + 1}`);
      dot.addEventListener('click', () => this.goTo(i));
      this.dots.appendChild(dot);
    }
  }

  syncDots() {
    if (!this.dots || !this.pageLabel) return;
    const children = this.dots.children;
    for (let i = 0; i < children.length; i++) {
      children[i].classList.toggle('active', i === this.page);
    }
    this.pageLabel.textContent = `${this.page + 1} / ${COMBAT_INTEL.length}`;
  }

  renderPage(idx, animate = true) {
    const entry = COMBAT_INTEL[idx];
    this.page = idx;
    this.syncDots();

    const doRender = () => {
      if (!this.stage) return;
      this.stage.innerHTML = '';
      this.stage.style.setProperty('--accent', entry.color);

      const card = document.createElement('article');
      card.className = 'codex-page combat-intel-page';

      const body = document.createElement('div');
      body.className = 'codex-page-body combat-intel-body';
      body.innerHTML = `
        <div class="codex-page-head">
          <span class="codex-page-index">0${idx + 1}</span>
          <h3>${entry.name}</h3>
          <span class="codex-tag">${entry.tag}</span>
        </div>
        <p class="codex-desc">${entry.desc}</p>
        <p class="codex-tip"><strong>Tactic</strong> ${entry.tip}</p>
      `;

      card.appendChild(body);
      this.stage.appendChild(card);
      if (animate) card.classList.add('enter');
    };

    if (animate && this.stage?.firstChild) {
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

  goTo(idx) {
    if (idx === this.page) return;
    this.audio?.play('ui_select');
    this.renderPage(idx, true);
  }

  prev() {
    const n = COMBAT_INTEL.length;
    this.goTo((this.page - 1 + n) % n);
  }

  next() {
    const n = COMBAT_INTEL.length;
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
    if (!this.el) return;
    this.open = true;
    this.input?.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.page = 0;
    this.renderPage(0, false);
    showLayer(this.el);
  }

  hide() {
    if (!this.el) return;
    this.open = false;
    this.input?.setBlocked(false);
    this.audio?.play('ui_close');
    hideLayer(this.el, { ms: UI_MS });
    clearTimeout(this.anim);
  }
}
