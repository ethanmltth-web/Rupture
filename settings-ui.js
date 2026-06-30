import { Settings, ACTION_LABELS } from './settings.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class SettingsUI {
  constructor(settings, input, audio = null) {
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.el = document.getElementById('settings');
    this.list = document.getElementById('settings-binds');
    this.assistSlider = document.getElementById('curve-assist');
    this.assistVal = document.getElementById('curve-assist-val');
    this.sfxSlider = document.getElementById('sfx-volume');
    this.sfxVal = document.getElementById('sfx-volume-val');
    this.muteToggle = document.getElementById('sfx-mute');
    this.previewTimer = 0;
    this.open = false;
    this.rebinding = null;

    document.getElementById('btn-settings').addEventListener('click', () => this.show());
    document.getElementById('settings-close').addEventListener('click', () => this.hide());
    document.getElementById('settings-reset-binds')?.addEventListener('click', () => {
      if (confirm('Reset all keybinds to defaults?')) {
        this.settings.resetBindings();
        this.buildList();
        this.audio?.play('ui_select');
      }
    });
    document.getElementById('settings-reset').addEventListener('click', () => {
      if (confirm('Reset all settings including keybinds, volume, and equipped style?')) {
        this.settings.resetAll();
        this.syncSliders();
        this.buildList();
        this.audio?.play('ui_select');
      }
    });
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.assistSlider.addEventListener('input', () => {
      this.settings.setCurveAssist(parseFloat(this.assistSlider.value));
      this.syncSliders();
    });

    this.sfxSlider.addEventListener('input', () => {
      this.audio?.unlock();
      this.settings.setSfxVolume(parseFloat(this.sfxSlider.value));
      this.syncSliders();
      const now = performance.now();
      if (now - this.previewTimer > 120) {
        this.previewTimer = now;
        this.audio?.play('sfx_preview');
      }
    });

    if (this.muteToggle) {
      this.muteToggle.addEventListener('change', () => {
        this.settings.setMuted(this.muteToggle.checked);
        this.syncSliders();
      });
    }

    this.buildList();
    this.syncSliders();
    settings.onChange(() => {
      if (this.open) {
        this.buildList();
        this.syncSliders();
      }
    });
  }

  isOpen() {
    return this.open;
  }

  isRebinding() {
    return this.rebinding !== null;
  }

  buildList() {
    this.list.innerHTML = '';
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      if (action === 'robot_toggle') continue;
      const row = document.createElement('div');
      row.className = 'settings-row';

      const name = document.createElement('span');
      name.className = 'settings-label';
      name.textContent = label;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-key';
      btn.dataset.action = action;
      btn.textContent = this.settings.labelsFor(action);
      btn.addEventListener('click', () => this.beginRebind(action, btn));

      row.append(name, btn);
      this.list.appendChild(row);
    }
  }

  beginRebind(action, btn) {
    this.rebinding = action;
    this.input.setBlocked(true);
    this.list.querySelectorAll('.settings-key').forEach(b => {
      b.classList.toggle('listening', b === btn);
    });
    btn.textContent = 'Press key…';
  }

  cancelRebind() {
    if (!this.rebinding) return;
    this.rebinding = null;
    this.input.setBlocked(this.open);
    this.buildList();
  }

  onKey(e) {
    if (!this.open) return;
    if (e.key === 'Escape') {
      if (this.rebinding) {
        e.preventDefault();
        this.cancelRebind();
        return;
      }
      this.hide();
      return;
    }
    if (!this.rebinding) return;
    e.preventDefault();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    this.settings.setBinding(this.rebinding, e.code);
    this.audio?.play('key_rebind');
    this.rebinding = null;
    this.input.setBlocked(this.open);
    this.buildList();
  }

  syncSliders() {
    const assist = this.settings.curveAssist;
    this.assistSlider.value = String(assist);
    if (assist <= 0) {
      this.assistVal.textContent = 'Off';
    } else {
      const speed = Math.round(this.settings.dashTimeScale() * 100);
      this.assistVal.textContent = `${assist.toFixed(2)} · ${speed}% speed`;
    }

    const vol = this.settings.sfxVolume;
    this.sfxSlider.value = String(vol);
    if (this.settings.muted) {
      this.sfxVal.textContent = 'Muted';
    } else {
      this.sfxVal.textContent = vol <= 0 ? '0%' : `${Math.round(vol * 100)}%`;
    }
    if (this.muteToggle) {
      this.muteToggle.checked = this.settings.muted;
    }
  }

  show() {
    this.open = true;
    this.cancelRebind();
    this.input.setBlocked(true);
    this.audio?.unlock();
    this.audio?.play('ui_open');
    this.buildList();
    this.syncSliders();
    showLayer(this.el);
  }

  hide() {
    this.open = false;
    this.cancelRebind();
    this.input.setBlocked(false);
    this.audio?.play('ui_close');
    hideLayer(this.el, { ms: UI_MS });
  }
}

/** Update in-game HUD key labels from settings. */
export function syncHudKeys(settings) {
  const lockKbd = document.querySelector('#ability-hud .ability-slot:nth-child(1) kbd');
  const quickKbd = document.querySelector('#ability-hud .ability-slot:nth-child(2) kbd');
  if (lockKbd) lockKbd.textContent = settings.primaryLabel('lock');
  if (quickKbd) quickKbd.textContent = settings.primaryLabel('quick');
}

/** Refresh static menu / overlay key hints. */
export function syncMenuHints(settings) {
  const grid = document.getElementById('menu-control-grid');
  if (grid) {
    const arrows = [
      settings.primaryLabel('move_up'),
      settings.primaryLabel('move_left'),
      settings.primaryLabel('move_down'),
      settings.primaryLabel('move_right'),
    ].join(' / ');
    grid.innerHTML = `
      <div class="control-item"><kbd>${arrows}</kbd><span>Move</span></div>
      <div class="control-item"><kbd>${settings.primaryLabel('dash')}</kbd><span>Dash · curve while moving</span></div>
      <div class="control-item"><kbd>${settings.primaryLabel('dash_stop')}</kbd><span>Stop dash early</span></div>
      <div class="control-item"><kbd>${settings.primaryLabel('lock')}</kbd><span>Ability 1</span></div>
      <div class="control-item"><kbd>${settings.primaryLabel('quick')}</kbd><span>Ability 2</span></div>
      <div class="control-item"><kbd>${settings.primaryLabel('level_prev')}</kbd><kbd>${settings.primaryLabel('level_next')}</kbd><span>Sector prev / next</span></div>
    `;
  }
  const start = document.getElementById('hint-start');
  const retry = document.getElementById('hint-retry');
  const next = document.getElementById('hint-next');
  const space = document.getElementById('hint-space');
  if (start) start.textContent = settings.primaryLabel('start');
  if (retry) retry.textContent = settings.primaryLabel('start');
  if (next) next.textContent = settings.primaryLabel('start');
  if (space) space.textContent = settings.primaryLabel('next');
}
