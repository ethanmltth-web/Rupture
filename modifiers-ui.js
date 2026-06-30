import { MODIFIERS, MODIFIER_IDS } from './modifiers.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class ModifierUI {
  constructor(profile, input, onSelect, audio = null) {
    this.profile = profile;
    this.input = input;
    this.onSelect = onSelect;
    this.audio = audio;
    this.open = false;
    this.selected = 'classic';

    this.el = document.getElementById('modifiers');
    this.list = document.getElementById('modifier-list');
    this.currentName = document.getElementById('modifier-current-name');
    this.openBtn = document.getElementById('modifier-open');

    document.getElementById('modifiers-close').addEventListener('click', () => this.hide());
    this.openBtn.addEventListener('click', () => this.show());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.buildList();
    this.syncCurrent();
  }

  isOpen() {
    return this.open;
  }

  setSelected(id) {
    if (!this.profile.isModifierUnlocked(id)) return;
    this.selected = id;
    this.syncCurrent();
    this.buildList();
  }

  syncCurrent() {
    const info = MODIFIERS[this.selected];
    if (this.currentName && info) {
      this.currentName.textContent = info.name;
    }
  }

  buildList() {
    this.list.innerHTML = '';
    for (const id of MODIFIER_IDS) {
      const info = MODIFIERS[id];
      const active = id === this.selected;
      const unlocked = this.profile.isModifierUnlocked(id);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'picker-card modifier-card';
      if (active) card.classList.add('active');
      if (!unlocked) card.classList.add('locked');
      card.dataset.modifier = id;
      card.disabled = !unlocked;

      const head = document.createElement('div');
      head.className = 'picker-card-head';

      const title = document.createElement('span');
      title.className = 'picker-card-name';
      title.textContent = info.name;

      const badge = document.createElement('span');
      badge.className = 'picker-card-badge';
      if (!unlocked) badge.textContent = 'Locked';
      else if (active) badge.textContent = 'Selected';
      else badge.textContent = 'Available';

      head.append(title, badge);

      const desc = document.createElement('p');
      desc.className = 'picker-card-desc';
      desc.textContent = unlocked ? info.desc : `Locked — complete challenges to unlock ${info.name}.`;

      card.append(head, desc);
      if (unlocked) {
        card.addEventListener('click', () => {
          this.audio?.play('ui_select');
          this.onSelect(id);
          this.hide();
        });
      }
      this.list.appendChild(card);
    }
  }

  show() {
    this.open = true;
    this.input.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.buildList();
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
