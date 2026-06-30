import { STYLES, STYLE_IDS, SKILL_LEVELS } from './styles.js';
import { challengeForStyle, challengeProgress } from './challenges.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class StylesUI {
  constructor(settings, profile, input, onEquip, audio = null) {
    this.settings = settings;
    this.profile = profile;
    this.input = input;
    this.onEquip = onEquip;
    this.audio = audio;
    this.open = false;

    this.el = document.getElementById('styles');
    this.list = document.getElementById('style-list');
    this.currentName = document.getElementById('style-current-name');

    document.getElementById('btn-styles').addEventListener('click', () => this.show());
    document.getElementById('styles-close').addEventListener('click', () => this.hide());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.syncCurrent();
    settings.onChange(() => {
      if (this.open) this.buildList();
      this.syncCurrent();
    });
  }

  isOpen() {
    return this.open;
  }

  syncCurrent() {
    const info = STYLES[this.settings.equippedStyle];
    if (this.currentName && info) {
      this.currentName.textContent = info.name;
    }
  }

  orderedIds() {
    const equipped = this.settings.equippedStyle;
    const owned = this.profile.ownedStyles.filter((id) => id !== equipped && STYLE_IDS.includes(id));
    const locked = STYLE_IDS.filter((id) => !this.profile.isStyleOwned(id));
    return [equipped, ...owned, ...locked];
  }

  buildList() {
    this.list.innerHTML = '';
    for (const id of this.orderedIds()) {
      const info = STYLES[id];
      const owned = this.profile.isStyleOwned(id);
      const equipped = this.settings.equippedStyle === id;

      const card = document.createElement('div');
      card.className = 'style-card';
      if (equipped) card.classList.add('equipped');
      if (!owned) card.classList.add('locked');

      const head = document.createElement('div');
      head.className = 'style-card-head';

      const title = document.createElement('span');
      title.className = 'style-card-name';
      title.textContent = info.name;

      const badge = document.createElement('span');
      badge.className = 'style-card-badge';
      if (equipped) badge.textContent = 'Equipped';
      else if (!owned) badge.textContent = 'Locked';
      else badge.textContent = 'Owned';

      head.append(title, badge);

      if (info.skillLevel) {
        const skill = document.createElement('span');
        skill.className = `style-skill style-skill-${info.skillLevel}`;
        skill.textContent = `${SKILL_LEVELS[info.skillLevel] ?? info.skillLevel} skill`;
        card.append(head, skill);
      } else {
        card.append(head);
      }

      const actions = document.createElement('div');
      actions.className = 'style-card-actions';

      if (equipped) {
        const label = document.createElement('span');
        label.className = 'style-equipped-label';
        label.textContent = 'Currently active';
        actions.appendChild(label);
      } else if (!owned) {
        const ch = challengeForStyle(id);
        const label = document.createElement('span');
        label.className = 'style-locked-label';
        if (ch) {
          const prog = challengeProgress(ch, this.profile);
          if (ch.type === 'counter' || ch.type === 'endless_wave') {
            label.textContent = `${ch.desc} (${Math.min(prog.current, prog.target)}/${prog.target})`;
          } else {
            label.textContent = ch.desc;
          }
        } else {
          label.textContent = 'Complete challenges to unlock';
        }
        actions.appendChild(label);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'style-equip-btn';
        btn.textContent = 'Equip';
        btn.addEventListener('click', () => {
          this.audio?.play('ui_select');
          this.onEquip(id);
          this.buildList();
          this.syncCurrent();
        });
        actions.appendChild(btn);
      }

      card.appendChild(actions);
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
