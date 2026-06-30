import { SHOP_ITEMS } from './shop.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class ShopUI {
  constructor(profile, input, onChange, audio = null) {
    this.profile = profile;
    this.input = input;
    this.onChange = onChange;
    this.audio = audio;
    this.open = false;

    this.el = document.getElementById('shop');
    this.list = document.getElementById('shop-list');

    document.getElementById('btn-shop')?.addEventListener('click', () => this.show());
    document.getElementById('shop-close')?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  isOpen() {
    return this.open;
  }

  buildList() {
    if (!this.list) return;
    this.list.innerHTML = '';

    for (const item of SHOP_ITEMS) {
      const owned = this.profile.ownsCosmetic(item.id);
      const equipped = this.profile.isCosmeticEquipped(item.id);

      const card = document.createElement('div');
      card.className = 'shop-card';
      if (owned) card.classList.add('owned');
      if (equipped) card.classList.add('equipped');

      const head = document.createElement('div');
      head.className = 'shop-card-head';
      const title = document.createElement('span');
      title.className = 'shop-card-title';
      title.textContent = item.label;
      const badge = document.createElement('span');
      badge.className = 'shop-card-badge';
      if (equipped) badge.textContent = 'Equipped';
      else if (owned) badge.textContent = 'Owned';
      else badge.textContent = `${item.cost} WC`;
      head.append(title, badge);

      const desc = document.createElement('p');
      desc.className = 'shop-card-desc';
      desc.textContent = item.desc;

      card.append(head, desc);

      const actions = document.createElement('div');
      actions.className = 'shop-card-actions';

      if (!owned) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-buy-btn';
        btn.textContent = `Buy · ${item.cost} WC`;
        btn.disabled = this.profile.credits < item.cost;
        btn.addEventListener('click', () => {
          if (this.profile.buyCosmetic(item.id, item.cost)) {
            this.audio?.play('ui_select');
            this.onChange?.();
            this.buildList();
          }
        });
        actions.appendChild(btn);
      } else if (!equipped) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-equip-btn';
        btn.textContent = 'Equip';
        btn.addEventListener('click', () => {
          this.profile.equipCosmetic(item.id);
          this.audio?.play('ui_select');
          this.onChange?.();
          this.buildList();
        });
        actions.appendChild(btn);
      } else {
        const label = document.createElement('span');
        label.className = 'shop-equipped-label';
        label.textContent = 'Active';
        actions.appendChild(label);
      }

      card.appendChild(actions);
      this.list.appendChild(card);
    }
  }

  show() {
    if (!this.el) return;
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
