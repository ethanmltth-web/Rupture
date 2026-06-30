import { TITLE_BY_ID, TITLES } from './titles.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class TitlesUI {
  constructor(profile, input, audio = null) {
    this.profile = profile;
    this.input = input;
    this.audio = audio;
    this.open = false;

    this.el = document.getElementById('titles');
    this.list = document.getElementById('title-list');
    this.currentLabel = document.getElementById('title-current-label');

    document.getElementById('btn-titles')?.addEventListener('click', () => this.show());
    document.getElementById('titles-close')?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.syncCurrent();
  }

  isOpen() {
    return this.open;
  }

  syncCurrent() {
    if (!this.currentLabel) return;
    const label = this.profile.equippedTitleLabel();
    this.currentLabel.textContent = label || 'None';
  }

  unlockedIds() {
    return TITLES.filter((t) => this.profile.isTitleUnlocked(t.id)).map((t) => t.id);
  }

  buildList() {
    if (!this.list) return;
    this.list.innerHTML = '';
    const unlocked = this.unlockedIds();
    if (!unlocked.length) {
      const empty = document.createElement('p');
      empty.className = 'titles-empty';
      empty.textContent = 'No titles unlocked yet — earn achievements, complete challenges, or buy badges in the shop.';
      this.list.appendChild(empty);
      return;
    }

    const equipped = this.profile.equippedTitle;
    const ordered = [
      ...(equipped && unlocked.includes(equipped) ? [equipped] : []),
      ...unlocked.filter((id) => id !== equipped),
    ];

    for (const id of ordered) {
      const def = TITLE_BY_ID[id];
      if (!def) continue;
      const isEquipped = this.profile.equippedTitle === id;

      const card = document.createElement('div');
      card.className = 'title-card';
      if (isEquipped) card.classList.add('equipped');

      const head = document.createElement('div');
      head.className = 'title-card-head';

      const name = document.createElement('span');
      name.className = 'title-card-name';
      name.textContent = def.label;

      const badge = document.createElement('span');
      badge.className = 'title-card-badge';
      badge.textContent = isEquipped ? 'Equipped' : 'Unlocked';

      head.append(name, badge);

      const desc = document.createElement('p');
      desc.className = 'title-card-desc';
      desc.textContent = def.desc;

      const actions = document.createElement('div');
      actions.className = 'title-card-actions';

      if (isEquipped) {
        const label = document.createElement('span');
        label.className = 'title-equipped-label';
        label.textContent = 'Currently displayed';
        actions.appendChild(label);
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'title-unequip-btn';
        clear.textContent = 'Clear';
        clear.addEventListener('click', () => {
          this.profile.equipTitle(null);
          this.audio?.play('ui_select');
          this.buildList();
          this.syncCurrent();
          this.onEquipChange?.();
        });
        actions.appendChild(clear);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'title-equip-btn';
        btn.textContent = 'Equip';
        btn.addEventListener('click', () => {
          this.profile.equipTitle(id);
          this.audio?.play('ui_select');
          this.buildList();
          this.syncCurrent();
          this.onEquipChange?.();
        });
        actions.appendChild(btn);
      }

      card.append(head, desc, actions);
      this.list.appendChild(card);
    }
  }

  show() {
    this.open = true;
    this.input.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.buildList();
    this.syncCurrent();
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
