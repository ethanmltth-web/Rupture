import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES } from './achievements.js';
import { LEVELS } from './world.js';
import { STYLES, STYLE_IDS } from './styles.js';
import { FPS } from './constants.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class RecordsUI {
  constructor(profile, tracker, input, audio = null) {
    this.profile = profile;
    this.tracker = tracker;
    this.input = input;
    this.audio = audio;
    this.open = false;
    this.tab = 'achievements';

    this.el = document.getElementById('records');
    this.tabs = document.getElementById('records-tabs');
    this.body = document.getElementById('records-body');

    document.getElementById('btn-records')?.addEventListener('click', () => this.show());
    document.getElementById('records-close')?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    this.tabs?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-records-tab]');
      if (!btn) return;
      this.tab = btn.dataset.recordsTab;
      this.buildContent();
      this.syncTabs();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  isOpen() {
    return this.open;
  }

  syncTabs() {
    if (!this.tabs) return;
    for (const btn of this.tabs.querySelectorAll('[data-records-tab]')) {
      btn.classList.toggle('active', btn.dataset.recordsTab === this.tab);
    }
  }

  buildContent() {
    if (!this.body) return;
    this.body.innerHTML = '';

    if (this.tab === 'achievements') {
      for (const cat of ACHIEVEMENT_CATEGORIES) {
        const items = ACHIEVEMENTS.filter((a) => a.category === cat.id);
        if (!items.length) continue;
        const section = document.createElement('section');
        section.className = 'records-section';
        const h = document.createElement('h3');
        h.textContent = cat.label;
        section.appendChild(h);
        const grid = document.createElement('div');
        grid.className = 'records-grid';
        for (const ach of items) {
          const done = this.profile.isAchievementComplete(ach.id);
          const card = document.createElement('div');
          card.className = 'records-badge';
          if (done) card.classList.add('done');
          card.innerHTML = `<strong>${ach.title}</strong><span>${ach.desc}</span>`;
          grid.appendChild(card);
        }
        section.appendChild(grid);
        this.body.appendChild(section);
      }
      return;
    }

    if (this.tab === 'sectors') {
      const table = document.createElement('div');
      table.className = 'records-sector-table';
      for (let i = 1; i <= LEVELS.length; i++) {
        const best = this.profile.stats.sectorBests[i];
        const row = document.createElement('div');
        row.className = 'records-sector-row';
        const name = LEVELS[i - 1]?.name ?? `Sector ${i}`;
        const time = best?.time != null ? `${(best.time / FPS).toFixed(2)}s` : '—';
        const grade = best?.grade ?? '—';
        row.innerHTML = `<span>${i}. ${name}</span><span>${grade}</span><span>${time}</span><span>${best?.perfects ?? 0} weave</span>`;
        table.appendChild(row);
      }
      this.body.appendChild(table);
      return;
    }

    if (this.tab === 'mastery') {
      const grid = document.createElement('div');
      grid.className = 'records-grid';
      for (const id of STYLE_IDS) {
        const info = STYLES[id];
        const m = this.profile.masteryFor(id);
        const lvl = this.tracker.masteryLevel(id);
        const card = document.createElement('div');
        card.className = 'records-badge';
        card.innerHTML = `<strong>${info.name}</strong><span>Lv ${lvl} · ${m.clears} clears · ${Math.round(m.kills)} kills</span>`;
        grid.appendChild(card);
      }
      this.body.appendChild(grid);
    }
  }

  show() {
    if (!this.el) return;
    this.open = true;
    this.input.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.buildContent();
    this.syncTabs();
    showLayer(this.el);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.input.setBlocked(false);
    this.audio?.play('ui_close');
    hideLayer(this.el, { ms: UI_MS });
  }

  onKey(e) {
    if (!this.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }
}
