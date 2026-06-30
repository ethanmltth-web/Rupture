import { SKILL_LEVELS } from './styles.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export const STYLE_INTEL = [
  {
    id: 'linear_sniper',
    name: 'Linear Sniper',
    skillLevel: 'medium',
    skillWhy: 'Medium because you aim and commit to targets, but lock-on forgives some positioning — you don’t need frame-perfect offense every sector.',
    color: '#ff3c50',
    ability1: { key: 'E', name: 'Lock-on', desc: 'Charge a crosshair on the nearest enemy. Full charge fires a guaranteed beam for heavy damage (50% on most foes, 25% on sprayers). Slows you slightly while locking.' },
    ability2: { key: 'F', name: 'Quick', desc: 'Fires a homing shot (10% damage). Good for finishing wounded targets between lock cycles.' },
    pros: ['Reliable single-target kills', 'Lock-on is easy to understand', 'Strong vs snipers and orbiters'],
    cons: ['Weak vs dense bullet walls', 'Lock slow leaves you exposed', 'Low AoE — struggles in CHAOS sectors'],
  },
  {
    id: 'pulse_breaker',
    name: 'Pulse Breaker',
    skillLevel: 'low',
    skillWhy: 'Low skill — both abilities are point-and-press around your position. No charge timing, no chain requirements.',
    color: '#ff8040',
    ability1: { key: 'E', name: 'Shock', desc: 'Radial pulse (~80px). Clears nearby bullets and deals 12% damage to all enemies in range. 3s cooldown.' },
    ability2: { key: 'F', name: 'Breach', desc: 'Line slash along your last move direction. Clears bullets on the path and deals 18% to enemies crossed. 9s cooldown.' },
    pros: ['Forgiving AoE damage', 'Clears space without perfect weaves', 'Great for beginners in bullet hell'],
    cons: ['Needs enemies nearby to matter', 'Breach aims on last direction — easy to whiff', 'Lower burst than precision styles'],
  },
  {
    id: 'phase_runner',
    name: 'Phase Runner',
    skillLevel: 'low',
    skillWhy: 'Low skill — blink is a get-out button and trail passively chips while you move. Damage is automatic on contact.',
    color: '#e8f4ff',
    ability1: { key: 'E', name: 'Blink', desc: 'Teleport ~120px forward (move input or last direction). Brief i-frames and 8% AoE on arrival. 4s cooldown.' },
    ability2: { key: 'F', name: 'Trail', desc: '2s afterimage — drops damaging nodes along your path (5% per enemy touched). 11s cooldown.' },
    pros: ['Excellent escape tool', 'Hard to die from bad dashes', 'Chasers are easy to kite'],
    cons: ['Low kill speed', 'Trail needs you to move through enemies', 'No long-range pressure'],
  },
  {
    id: 'arc_scatter',
    name: 'Arc Scatter',
    skillLevel: 'low',
    skillWhy: 'Low skill — fan and ricochet auto-aim at nearest targets. Spread handles multiple foes without manual aim.',
    color: '#ffd700',
    ability1: { key: 'E', name: 'Fan', desc: 'Five shots in a 60° arc toward the nearest enemy. 8% damage each. 2.5s cooldown.' },
    ability2: { key: 'F', name: 'Rico', desc: 'One shot that bounces off arena walls up to three times. 15% per enemy hit (once each). 7s cooldown.' },
    pros: ['Chips groups quickly', 'Ricochet reaches around corners', 'Steady pressure with short fan CD'],
    cons: ['Spread damage is slow on high-HP mines', 'Ricochet needs wall angles', 'Less burst than lock-on'],
  },
  {
    id: 'null_suppressor',
    name: 'Null Suppressor',
    skillLevel: 'medium',
    skillWhy: 'Medium — you must step into danger to trap bullets and enemies in stasis, then time the shatter payoff.',
    color: '#9080ff',
    ability1: { key: 'E', name: 'Jam', desc: 'Cone (~90°) deletes bullets and deals 10% to enemies inside. 3.5s cooldown.' },
    ability2: { key: 'F', name: 'Stasis', desc: '~2.5s field traps bullets and pauses enemies, then shatters for 25% release damage. 12s cooldown.' },
    pros: ['Best bullet denial in the roster', 'Stasis setup wins chaotic sectors', 'Strong mine/sprayer counter'],
    cons: ['Must walk into clusters to stasis', 'Long stasis cooldown', 'Jam alone is low damage'],
  },
  {
    id: 'overclock',
    name: 'Overclock',
    skillLevel: 'high',
    skillWhy: 'High skill — rail requires chain ≥ 2, and the kit rewards chaining perfect weaves before spending your nuke.',
    color: '#ff3c50',
    ability1: { key: 'E', name: 'Amp', desc: '5s weave amp: wider perfect window (+2 frames), stronger dash CD shave, 6% pulse on cast. 8s cooldown.' },
    ability2: { key: 'F', name: 'Rail', desc: 'Piercing line through all enemies (22% each). Only fires when chain ≥ 2. 10s cooldown.' },
    pros: ['Highest skill ceiling payoff', 'Rail can wipe a whole line', 'Amp synergizes with core dash mastery'],
    cons: ['Useless rail without chain setup', 'Demands perfect weave consistency', 'Weak early in a sector before chain builds'],
  },
];

export class StyleIntel {
  constructor(input, audio = null) {
    this.input = input;
    this.audio = audio;
    this.el = document.getElementById('style-intel');
    this.stage = document.getElementById('style-intel-stage');
    this.pageLabel = document.getElementById('style-intel-page-label');
    this.dots = document.getElementById('style-intel-dots');
    this.open = false;
    this.page = 0;
    this.anim = null;

    document.getElementById('btn-style-intel')?.addEventListener('click', () => this.show());
    document.getElementById('style-intel-close')?.addEventListener('click', () => this.hide());
    document.getElementById('style-intel-prev')?.addEventListener('click', () => this.prev());
    document.getElementById('style-intel-next')?.addEventListener('click', () => this.next());
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
    for (let i = 0; i < STYLE_INTEL.length; i++) {
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
    for (let i = 0; i < this.dots.children.length; i++) {
      this.dots.children[i].classList.toggle('active', i === this.page);
    }
    this.pageLabel.textContent = `${this.page + 1} / ${STYLE_INTEL.length}`;
  }

  renderList(items) {
    return items.map((t) => `<li>${t}</li>`).join('');
  }

  renderPage(idx, animate = true) {
    const entry = STYLE_INTEL[idx];
    this.page = idx;
    this.syncDots();

    const doRender = () => {
      if (!this.stage) return;
      this.stage.innerHTML = '';
      this.stage.style.setProperty('--accent', entry.color);

      const skillLabel = SKILL_LEVELS[entry.skillLevel] ?? entry.skillLevel;
      const card = document.createElement('article');
      card.className = 'codex-page style-intel-page';
      card.innerHTML = `
        <div class="codex-page-body style-intel-body">
          <div class="codex-page-head">
            <span class="codex-page-index">0${idx + 1}</span>
            <h3>${entry.name}</h3>
            <span class="codex-tag style-skill-${entry.skillLevel}">${skillLabel} skill</span>
          </div>
          <p class="style-intel-why"><strong>Why ${skillLabel.toLowerCase()}?</strong> ${entry.skillWhy}</p>
          <div class="style-intel-abilities">
            <div class="style-intel-ability">
              <span class="style-intel-key">${entry.ability1.key}</span>
              <div>
                <strong>${entry.ability1.name}</strong>
                <p>${entry.ability1.desc}</p>
              </div>
            </div>
            <div class="style-intel-ability">
              <span class="style-intel-key">${entry.ability2.key}</span>
              <div>
                <strong>${entry.ability2.name}</strong>
                <p>${entry.ability2.desc}</p>
              </div>
            </div>
          </div>
          <div class="style-intel-columns">
            <div class="style-intel-col style-intel-pros">
              <strong>Pros</strong>
              <ul>${this.renderList(entry.pros)}</ul>
            </div>
            <div class="style-intel-col style-intel-cons">
              <strong>Cons</strong>
              <ul>${this.renderList(entry.cons)}</ul>
            </div>
          </div>
        </div>
      `;
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
    const n = STYLE_INTEL.length;
    this.goTo((this.page - 1 + n) % n);
  }

  next() {
    const n = STYLE_INTEL.length;
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
