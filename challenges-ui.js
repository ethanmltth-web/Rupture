import { CHALLENGES, challengeProgress } from './challenges.js';
import { getDailyChallenge } from './daily-challenge.js';
import { showLayer, hideLayer, UI_MS } from './transitions.js';

export class ChallengesUI {
  constructor(profile, input, audio = null, tracker = null) {
    this.profile = profile;
    this.tracker = tracker;
    this.input = input;
    this.audio = audio;
    this.open = false;

    this.el = document.getElementById('challenges');
    this.list = document.getElementById('challenge-list');
    this.dailyTitle = document.getElementById('daily-challenge-title');
    this.dailyDesc = document.getElementById('daily-challenge-desc');
    this.dailyStreak = document.getElementById('daily-streak');

    document.getElementById('btn-challenges')?.addEventListener('click', () => this.show());
    document.getElementById('challenges-close')?.addEventListener('click', () => this.hide());
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

    const daily = getDailyChallenge();
    if (this.dailyTitle) this.dailyTitle.textContent = daily.title;
    if (this.dailyDesc) this.dailyDesc.textContent = daily.desc;
    if (this.dailyStreak) {
      const done = this.profile.daily.lastCompletedDate === daily.dateKey;
      this.dailyStreak.textContent = done
        ? `Done today · streak ${this.profile.daily.streak}`
        : `Streak ${this.profile.daily.streak}`;
    }

    for (const ch of CHALLENGES) {
      const done = this.profile.isChallengeComplete(ch.id);
      const prog = challengeProgress(ch, this.profile, this.tracker?.getRunState?.() ?? {});
      const card = document.createElement('div');
      card.className = 'challenge-card';
      if (done) card.classList.add('done');

      const head = document.createElement('div');
      head.className = 'challenge-card-head';
      const title = document.createElement('span');
      title.className = 'challenge-card-title';
      title.textContent = ch.title;
      const badge = document.createElement('span');
      badge.className = 'challenge-card-badge';
      badge.textContent = done ? 'Complete' : 'Active';
      head.append(title, badge);

      const desc = document.createElement('p');
      desc.className = 'challenge-card-desc';
      desc.textContent = ch.desc;

      card.append(head, desc);

      if (ch.type === 'counter' || ch.type === 'endless_wave') {
        const track = document.createElement('div');
        track.className = 'challenge-progress-track';
        const bar = document.createElement('div');
        bar.className = 'challenge-progress-bar';
        const pct = Math.min(1, prog.current / prog.target);
        bar.style.width = `${pct * 100}%`;
        track.appendChild(bar);
        const label = document.createElement('span');
        label.className = 'challenge-progress-label';
        label.textContent = `${Math.min(prog.current, prog.target)} / ${prog.target}`;
        card.append(track, label);
      }

      if (ch.reward || ch.wc) {
        const reward = document.createElement('p');
        reward.className = 'challenge-card-reward';
        const parts = [];
        if (ch.wc) parts.push(`+${ch.wc} WC`);
        if (ch.reward) {
          const kind = ch.reward.kind;
          parts.push(`Unlocks: ${kind === 'style' ? ch.reward.id.replace(/_/g, ' ') : kind === 'sector' ? `Sector ${ch.reward.id}` : ch.reward.id}`);
        }
        reward.textContent = parts.join(' · ');
        card.appendChild(reward);
      }

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
