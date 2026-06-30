import { STYLES, DEFAULT_EQUIPPED_STYLE, STYLE_IDS } from './styles.js';

const STORAGE_KEY = 'rupture_settings_v1';

export const CURVE_ASSIST_MAX = 1;

export const ACTION_LABELS = {
  move_up: 'Move up',
  move_down: 'Move down',
  move_left: 'Move left',
  move_right: 'Move right',
  dash: 'Dash',
  dash_stop: 'Stop dash',
  lock: 'Ability 1',
  quick: 'Ability 2',
  start: 'Start / retry',
  next: 'Next sector',
  level_prev: 'Previous sector',
  level_next: 'Next sector',
};

export const DEFAULT_BINDINGS = {
  move_up: ['KeyW', 'ArrowUp'],
  move_down: ['KeyS', 'ArrowDown'],
  move_left: ['KeyA', 'ArrowLeft'],
  move_right: ['KeyD', 'ArrowRight'],
  dash: ['KeyQ'],
  dash_stop: ['KeyR'],
  lock: ['KeyE'],
  quick: ['KeyF'],
  start: ['Enter'],
  next: ['Space'],
  level_prev: ['BracketLeft'],
  level_next: ['BracketRight'],
  robot_toggle: ['Backslash', 'IntlBackslash'],
};

/** Human-readable key label from KeyboardEvent.code */
export function codeLabel(code) {
  if (!code) return '—';
  if (code === 'Space') return 'Space';
  if (code === 'Enter') return 'Enter';
  if (code === 'Backslash' || code === 'IntlBackslash') return '\\';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  return code;
}

function cloneBindings(src) {
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = [...v];
  }
  return out;
}

export class Settings {
  constructor() {
    this.listeners = new Set();
    this.persist = false;
    this.resetToDefaults();
  }

  resetToDefaults() {
    this.bindings = cloneBindings(DEFAULT_BINDINGS);
    this.curveAssist = 0.6;
    this.sfxVolume = 0.85;
    this.muted = false;
    this.equippedStyle = DEFAULT_EQUIPPED_STYLE;
    this.ownedStyles = [DEFAULT_EQUIPPED_STYLE];
    this.persist = false;
    localStorage.removeItem(STORAGE_KEY);
    this.notifyListeners();
  }

  notifyListeners() {
    for (const fn of this.listeners) fn();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this.persist = true;
      this.fromSnapshot(JSON.parse(raw), { save: false });
    } catch {
      /* ignore corrupt storage */
    }
  }

  toSnapshot() {
    return {
      bindings: this.bindings,
      curveAssist: this.curveAssist,
      sfxVolume: this.sfxVolume,
      muted: this.muted,
      equippedStyle: this.equippedStyle,
      ownedStyles: this.ownedStyles,
    };
  }

  fromSnapshot(data, { save = true } = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid settings data.');
    }
    if (data.bindings) {
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        if (Array.isArray(data.bindings[action]) && data.bindings[action].length) {
          this.bindings[action] = [...data.bindings[action]];
        }
      }
    }
    const assist = data.curveAssist ?? data.dashSlowMo;
    if (typeof assist === 'number') {
      this.curveAssist = Math.max(0, Math.min(CURVE_ASSIST_MAX, assist));
    }
    if (typeof data.sfxVolume === 'number') {
      this.sfxVolume = Math.max(0, Math.min(1, data.sfxVolume));
    }
    if (typeof data.muted === 'boolean') {
      this.muted = data.muted;
    }
    if (typeof data.equippedStyle === 'string') {
      this.equippedStyle = data.equippedStyle;
    }
    if (Array.isArray(data.ownedStyles) && data.ownedStyles.length) {
      this.ownedStyles = [...data.ownedStyles];
    }
    if (!this.ownedStyles.includes(DEFAULT_EQUIPPED_STYLE)) {
      this.ownedStyles.unshift(DEFAULT_EQUIPPED_STYLE);
    }
    this.ownedStyles = this.ownedStyles.filter((id) => id !== 'gojo' && STYLE_IDS.includes(id));
    if (this.equippedStyle === 'gojo' || !STYLES[this.equippedStyle]) {
      this.equippedStyle = DEFAULT_EQUIPPED_STYLE;
    }
    if (save && this.persist) this.save();
  }

  save() {
    if (this.persist) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toSnapshot()));
    }
    this.notifyListeners();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setCurveAssist(v) {
    this.curveAssist = Math.max(0, Math.min(CURVE_ASSIST_MAX, v));
    this.save();
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    this.save();
  }

  setMuted(v) {
    this.muted = !!v;
    this.save();
  }

  isStyleOwned(id) {
    return this.ownedStyles.includes(id);
  }

  ownStyle(id) {
    if (!this.ownedStyles.includes(id)) {
      this.ownedStyles.push(id);
      this.save();
    }
  }

  setEquippedStyle(id) {
    if (!STYLES[id]) return;
    this.equippedStyle = id;
    this.save();
  }

  /** Time scale while dashing (lower = slower). Clamped so gameplay never fully freezes. */
  dashTimeScale() {
    if (this.curveAssist <= 0) return 1;
    return Math.max(0.05, 1 - this.curveAssist * 0.95);
  }

  primaryLabel(action) {
    const codes = this.bindings[action];
    return codes?.length ? codeLabel(codes[0]) : '—';
  }

  labelsFor(action) {
    return (this.bindings[action] || []).map(codeLabel).join(' / ');
  }

  setBinding(action, code) {
    if (!DEFAULT_BINDINGS[action]) return;
    const prev = this.findAction(code);
    if (prev && prev !== action) {
      this.bindings[prev] = this.bindings[prev].filter(c => c !== code);
      if (!this.bindings[prev].length) {
        this.bindings[prev] = [...DEFAULT_BINDINGS[prev]];
      }
    }
    this.bindings[action] = [code];
    this.save();
  }

  findAction(code) {
    for (const [action, codes] of Object.entries(this.bindings)) {
      if (codes.includes(code)) return action;
    }
    return null;
  }

  resetBindings() {
    this.bindings = cloneBindings(DEFAULT_BINDINGS);
    this.save();
  }

  resetAll() {
    this.bindings = cloneBindings(DEFAULT_BINDINGS);
    this.curveAssist = 0.6;
    this.sfxVolume = 0.85;
    this.muted = false;
    this.equippedStyle = DEFAULT_EQUIPPED_STYLE;
    this.ownedStyles = [DEFAULT_EQUIPPED_STYLE];
    this.save();
  }

  buildCodeMap() {
    const map = new Map();
    for (const [action, codes] of Object.entries(this.bindings)) {
      for (const code of codes) {
        if (!map.has(code)) map.set(code, []);
        map.get(code).push(action);
      }
    }
    return map;
  }
}
