import { Settings } from './settings.js';

const INTERNAL = {
  move_up: 'u',
  move_down: 'd',
  move_left: 'l',
  move_right: 'r',
  dash: 'dash',
  dash_stop: 'dash_stop',
  lock: 'lock',
  quick: 'quick',
  start: 'start',
  next: 'next',
  level_prev: 'level_prev',
  level_next: 'level_next',
  robot_toggle: 'robot_toggle',
};

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.press = new Set();
    this.codeMap = settings.buildCodeMap();
    this.blocked = false;

    this._onSettings = () => {
      this.codeMap = settings.buildCodeMap();
    };
    settings.onChange(this._onSettings);

    this._keydown = (e) => this.handleKeyDown(e);
    this._keyup = (e) => this.handleKeyUp(e);
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
  }

  setBlocked(v) {
    this.blocked = v;
  }

  handleKeyDown(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.blocked) return;
    const actions = this.codeMap.get(e.code);
    if (!actions?.length) return;
    e.preventDefault();
    for (const action of actions) {
      const id = INTERNAL[action];
      if (!id) continue;
      if (!this.down.has(id)) this.press.add(id);
      this.down.add(id);
    }
  }

  handleKeyUp(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.blocked) return;
    const actions = this.codeMap.get(e.code);
    if (!actions?.length) return;
    e.preventDefault();
    for (const action of actions) {
      const id = INTERNAL[action];
      if (id) this.down.delete(id);
    }
  }

  axis() {
    let x = 0; let y = 0;
    if (this.down.has('l')) x--;
    if (this.down.has('r')) x++;
    if (this.down.has('u')) y--;
    if (this.down.has('d')) y++;
    return { x, y };
  }

  wantDash() { return this.press.has('dash'); }
  wantDashStop() { return this.press.has('dash_stop'); }
  wantLock() { return this.press.has('lock'); }
  wantQuick() { return this.press.has('quick'); }
  wantStart() { return this.press.has('start'); }
  wantNext() { return this.press.has('next') || this.press.has('start'); }
  wantRobotToggle() { return this.press.has('robot_toggle'); }
  wantLevelPrev() { return this.press.has('level_prev') || this.press.has('u'); }
  wantLevelNext() { return this.press.has('level_next') || this.press.has('d'); }

  end() {
    this.press.clear();
  }
}
