/** Procedural game audio via Web Audio API — no external assets. */

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function nowMs() {
  return performance.now();
}

function makeImpulse(ctx, duration = 1.6, decay = 2.8) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * duration);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function makeNoiseBuffer(ctx, seconds = 1) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  return buf;
}

export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.reverbSend = null;
    this.reverbReturn = null;
    this.noiseBuf = null;
    this.unlocked = false;
    this.cooldowns = new Map();
    this.lockCharge = null;
    this.lockMilestones = new Set();
    this._lastTurretTele = new WeakMap();
    this._lastSniperTele = new WeakMap();
    this._lastSprayerTele = new WeakMap();
    this._lastOrbiterTele = new WeakMap();
    this._lastMineTele = new WeakMap();
    this.bgmActive = false;
    this.bgmOscs = null;
    this.bgmGain = null;
    this.bgmPulse = null;

    this._unlockBound = () => this.unlock();
    window.addEventListener('pointerdown', this._unlockBound, { once: true });
    window.addEventListener('keydown', this._unlockBound, { once: true });
  }

  unlock() {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.noiseBuf = makeNoiseBuffer(this.ctx, 2);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.sfxVolume;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;

    const conv = this.ctx.createConvolver();
    conv.buffer = makeImpulse(this.ctx);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.62;

    const shelf = this.ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 3200;
    shelf.gain.value = 2.5;

    this.sfxBus.connect(shelf);
    shelf.connect(comp);
    comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.sfxBus.connect(this.reverbSend);
    this.reverbSend.connect(conv);
    conv.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    this.unlocked = true;
    this.applyVolume();
    this.settings.onChange(() => this.applyVolume());
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  applyVolume() {
    if (!this.master) return;
    const v = this.settings.muted ? 0 : this.settings.sfxVolume;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  t() {
    return this.ctx?.currentTime ?? 0;
  }

  canPlay(id, ms) {
    const last = this.cooldowns.get(id) ?? 0;
    if (nowMs() - last < ms) return false;
    this.cooldowns.set(id, nowMs());
    return true;
  }

  out(gain = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.sfxBus);
    return g;
  }

  env(param, a, d, s, r, peak = 1) {
    const t0 = this.t();
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + a);
    param.exponentialRampToValueAtTime(Math.max(s * peak, 0.0001), t0 + a + d);
    param.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  noiseBurst({ dur = 0.08, type = 'bandpass', freq = 1200, q = 0.9, gain = 0.35, pan = 0 } = {}) {
    if (!this.unlocked) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.out(gain, pan);
    src.connect(filt);
    filt.connect(g);
    this.env(g.gain, 0.001, dur * 0.15, 0.4, dur * 0.85, gain);
    src.start();
    src.stop(this.t() + dur + 0.05);
  }

  tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, pan = 0,
    attack = 0.004, decay = 0.06, sustain = 0.3, release = 0.12,
    freqEnd = null, detune = 0 } = {}) {
    if (!this.unlocked) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t());
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), this.t() + dur);
    }
    osc.detune.value = detune;
    const g = this.out(gain, pan);
    osc.connect(g);
    this.env(g.gain, attack, decay, sustain, release, gain);
    osc.start();
    osc.stop(this.t() + dur + release + 0.05);
  }

  play(id, opts = {}) {
    if (!this.unlocked) return;
    const handlers = {
      dash_start: () => this.dashStart(opts),
      dash_stomp: () => this.dashStomp(opts),
      perfect_weave: () => this.perfectWeave(opts),
      bullet_pop: () => this.bulletPop(opts),
      enemy_kill: () => this.enemyKill(opts),
      lock_start: () => this.lockStart(opts),
      lock_hit: () => this.lockHit(opts),
      lock_kill: () => this.lockKill(opts),
      lock_miss: () => this.lockMiss(opts),
      quick_fire: () => this.quickFire(opts),
      quick_hit: () => this.quickHit(opts),
      quick_kill: () => this.quickKill(opts),
      player_death: () => this.playerDeath(opts),
      countdown_tick: () => this.countdownTick(opts),
      countdown_go: () => this.countdownGo(opts),
      sector_clear: () => this.sectorClear(opts),
      unlock_fanfare: () => this.unlockFanfare(opts),
      game_start: () => this.gameStart(opts),
      sector_advance: () => this.sectorAdvance(opts),
      ui_open: () => this.uiOpen(opts),
      ui_close: () => this.uiClose(opts),
      ui_select: () => this.uiSelect(opts),
      menu_confirm: () => this.menuConfirm(opts),
      key_rebind: () => this.keyRebind(opts),
      telegraph_turret: () => this.telegraphTurret(opts),
      telegraph_sniper: () => this.telegraphSniper(opts),
      orb_red: () => this.orbRed(opts),
      orb_blue: () => this.orbBlue(opts),
      freeze_start: () => this.freezeStart(opts),
      freeze_shatter: () => this.freezeShatter(opts),
      pulse_shock: () => this.orbRed(opts),
      pulse_breach: () => this.orbRed(opts),
      phase_blink: () => this.orbBlue(opts),
      phase_trail: () => this.freezeStart(opts),
      arc_fan: () => this.quickFire(opts),
      arc_ricochet: () => this.orbBlue(opts),
      jam_pulse: () => this.orbBlue(opts),
      stasis_start: () => this.freezeStart(opts),
      stasis_shatter: () => this.freezeShatter(opts),
      overclock_amp: () => this.chainUp(opts),
      overclock_rail: () => this.orbRed(opts),
      telegraph_sprayer: () => this.telegraphSprayer(opts),
      telegraph_orbiter: () => this.telegraphOrbiter(opts),
      telegraph_mine: () => this.telegraphMine(opts),
      sfx_preview: () => this.uiSelect(opts),
      enemy_fire: () => this.enemyFire(opts.kind),
      chain_up: () => this.chainUp(opts),
      ability_ready: () => this.abilityReady(opts),
    };
    const fn = handlers[id];
    if (fn) fn();
  }

  dashStart() {
    if (!this.canPlay('dash_start', 80)) return;
    const t0 = this.t();
    const g = this.out(0.42);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2800, t0);
    bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.14);
    bp.Q.value = 1.2;
    n.connect(bp);
    bp.connect(g);
    this.env(g.gain, 0.002, 0.04, 0.2, 0.1, 0.42);

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, t0);
    sub.frequency.exponentialRampToValueAtTime(55, t0 + 0.1);
    const sg = this.out(0.28);
    sub.connect(sg);
    this.env(sg.gain, 0.001, 0.03, 0.15, 0.08, 0.28);

    n.start(t0);
    sub.start(t0);
    n.stop(t0 + 0.2);
    sub.stop(t0 + 0.16);
  }

  dashStomp() {
    if (!this.canPlay('dash_stomp', 120)) return;
    const t0 = this.t();
    const kick = this.ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(165, t0);
    kick.frequency.exponentialRampToValueAtTime(38, t0 + 0.22);
    const kg = this.out(0.65);
    kick.connect(kg);
    this.env(kg.gain, 0.001, 0.05, 0.25, 0.28, 0.65);

    this.noiseBurst({ dur: 0.06, type: 'highpass', freq: 900, gain: 0.22 });
    this.tone({ freq: 80, type: 'triangle', dur: 0.18, gain: 0.18, attack: 0.002, release: 0.2, freqEnd: 45 });

    kick.start(t0);
    kick.stop(t0 + 0.35);
  }

  perfectWeave() {
    if (!this.canPlay('perfect_weave', 60)) return;
    const base = 880 + rand(-40, 40);
    const notes = [base, base * 1.25, base * 1.5];
    notes.forEach((f, i) => {
      this.tone({
        freq: f, type: 'sine', dur: 0.14, gain: 0.14 - i * 0.02,
        attack: 0.002, decay: 0.04, sustain: 0.2, release: 0.1,
        pan: rand(-0.2, 0.2), detune: rand(-8, 8),
      });
    });
    this.noiseBurst({ dur: 0.05, type: 'highpass', freq: 4000, q: 0.6, gain: 0.12 });
    this.tone({ freq: 1760, type: 'triangle', dur: 0.22, gain: 0.08, attack: 0.001, release: 0.18 });
  }

  bulletPop() {
    if (!this.canPlay('bullet_pop', 25)) return;
    this.tone({ freq: rand(900, 1200), type: 'square', dur: 0.04, gain: 0.08, attack: 0.001, decay: 0.01, sustain: 0.1, release: 0.03 });
    this.noiseBurst({ dur: 0.03, type: 'bandpass', freq: 2200, gain: 0.1 });
  }

  enemyKill() {
    if (!this.canPlay('enemy_kill', 80)) return;
    this.tone({ freq: 220, type: 'sawtooth', dur: 0.12, gain: 0.12, freqEnd: 880, attack: 0.002, release: 0.1 });
    this.noiseBurst({ dur: 0.1, type: 'bandpass', freq: 1800, gain: 0.2 });
    this.tone({ freq: 1320, type: 'sine', dur: 0.25, gain: 0.1, attack: 0.003, release: 0.2 });
  }

  lockStart() {
    if (!this.canPlay('lock_start', 100)) return;
    this.stopLockCharge();
    this.lockMilestones.clear();
    const t0 = this.t();
    [660, 880].forEach((f, i) => {
      this.tone({ freq: f, type: 'sine', dur: 0.07, gain: 0.14, attack: 0.002, release: 0.05, pan: -0.15 + i * 0.3 });
    });

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t0);
    const g = this.out(0.04);
    osc.connect(g);
    osc.start(t0);
    this.lockCharge = { osc, g, started: t0 };
  }

  updateLockCharge(ratio) {
    if (!this.lockCharge || !this.unlocked) return;
    const { osc, g } = this.lockCharge;
    const t0 = this.t();
    const freq = 320 + ratio * 680;
    osc.frequency.setTargetAtTime(freq, t0, 0.04);
    g.gain.setTargetAtTime(0.04 + ratio * 0.06, t0, 0.05);

    for (const m of [0.25, 0.5, 0.75]) {
      if (ratio >= m && !this.lockMilestones.has(m)) {
        this.lockMilestones.add(m);
        this.tone({ freq: 520 + m * 400, type: 'triangle', dur: 0.05, gain: 0.1, attack: 0.001, release: 0.04 });
      }
    }
  }

  stopLockCharge() {
    if (!this.lockCharge) return;
    const { osc, g } = this.lockCharge;
    const t0 = this.t();
    g.gain.setTargetAtTime(0.0001, t0, 0.03);
    try { osc.stop(t0 + 0.08); } catch { /* already stopped */ }
    this.lockCharge = null;
    this.lockMilestones.clear();
  }

  lockHit() {
    this.stopLockCharge();
    if (!this.canPlay('lock_hit', 60)) return;
    const t0 = this.t();
    const zap = this.ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(2400, t0);
    zap.frequency.exponentialRampToValueAtTime(600, t0 + 0.09);
    const zg = this.out(0.2);
    zap.connect(zg);
    this.env(zg.gain, 0.001, 0.02, 0.3, 0.08, 0.2);

    this.noiseBurst({ dur: 0.07, type: 'bandpass', freq: 3200, q: 1.4, gain: 0.28 });
    this.tone({ freq: 440, type: 'sine', dur: 0.15, gain: 0.16, attack: 0.002, release: 0.12, freqEnd: 220 });

    zap.start(t0);
    zap.stop(t0 + 0.14);
  }

  lockKill() {
    this.stopLockCharge();
    if (!this.canPlay('lock_kill', 100)) return;
    this.lockHit();
    const t0 = this.t() + 0.04;
    const playAt = (fn) => {
      const delay = Math.max(0, (t0 - this.t()) * 1000);
      if (delay < 5) fn();
      else setTimeout(fn, delay);
    };
    playAt(() => {
      if (!this.unlocked) return;
      this.tone({ freq: 523, type: 'sine', dur: 0.35, gain: 0.14, attack: 0.003, release: 0.28 });
      this.tone({ freq: 784, type: 'sine', dur: 0.35, gain: 0.1, attack: 0.005, release: 0.3 });
      this.noiseBurst({ dur: 0.08, type: 'bandpass', freq: 2000, gain: 0.15 });
    });
  }

  lockMiss() {
    this.stopLockCharge();
    if (!this.canPlay('lock_miss', 80)) return;
    this.tone({ freq: 420, type: 'sine', dur: 0.2, gain: 0.12, freqEnd: 180, attack: 0.002, release: 0.16 });
    this.noiseBurst({ dur: 0.08, type: 'lowpass', freq: 800, gain: 0.1 });
  }

  quickFire() {
    if (!this.canPlay('quick_fire', 70)) return;
    const t0 = this.t();
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.06);
    const g = this.out(0.18);
    osc.connect(g);
    this.env(g.gain, 0.001, 0.015, 0.35, 0.05, 0.18);

    this.noiseBurst({ dur: 0.04, type: 'highpass', freq: 2500, gain: 0.1, pan: 0.1 });
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  quickHit() {
    if (!this.canPlay('quick_hit', 40)) return;
    this.tone({ freq: rand(600, 800), type: 'triangle', dur: 0.06, gain: 0.12, attack: 0.001, release: 0.05 });
    this.noiseBurst({ dur: 0.035, type: 'bandpass', freq: 1600, gain: 0.14 });
  }

  quickKill() {
    if (!this.canPlay('quick_kill', 80)) return;
    this.tone({ freq: 660, type: 'sine', dur: 0.2, gain: 0.12, release: 0.15 });
    this.tone({ freq: 990, type: 'triangle', dur: 0.15, gain: 0.08, release: 0.12 });
  }

  playerDeath() {
    if (!this.canPlay('player_death', 500)) return;
    this.stopLockCharge();
    const t0 = this.t();
    const layers = [
      { dur: 0.12, type: 'lowpass', freq: 400, gain: 0.35, pan: -0.3 },
      { dur: 0.14, type: 'bandpass', freq: 750, gain: 0.3, pan: 0.2 },
      { dur: 0.16, type: 'bandpass', freq: 1100, gain: 0.25, pan: -0.15 },
      { dur: 0.18, type: 'highpass', freq: 1800, gain: 0.2, pan: 0.35 },
    ];
    layers.forEach((L, i) => {
      const when = t0 + i * 0.035;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = L.type;
      filt.frequency.value = L.freq;
      const g = this.out(L.gain, L.pan);
      src.connect(filt);
      filt.connect(g);
      const peak = L.gain;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + L.dur);
      src.start(when);
      src.stop(when + L.dur + 0.02);
    });

    const rumble = this.ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(90, t0);
    rumble.frequency.exponentialRampToValueAtTime(28, t0 + 0.6);
    const rg = this.out(0.5);
    rumble.connect(rg);
    this.env(rg.gain, 0.005, 0.08, 0.4, 0.55, 0.5);
    rumble.start(t0);
    rumble.stop(t0 + 0.75);

    this.tone({ freq: 180, type: 'sawtooth', dur: 0.5, gain: 0.15, freqEnd: 60, attack: 0.003, release: 0.45 });
  }

  countdownTick() {
    if (!this.canPlay('countdown_tick', 200)) return;
    this.tone({ freq: 880, type: 'sine', dur: 0.08, gain: 0.16, attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.05 });
    this.noiseBurst({ dur: 0.02, type: 'highpass', freq: 3000, gain: 0.06 });
  }

  countdownGo() {
    if (!this.canPlay('countdown_go', 300)) return;
    this.tone({ freq: 440, type: 'square', dur: 0.06, gain: 0.2, attack: 0.001, release: 0.05 });
    this.noiseBurst({ dur: 0.04, type: 'bandpass', freq: 1800, gain: 0.14 });
  }

  sectorClear() {
    if (!this.canPlay('sector_clear', 800)) return;
    const t0 = this.t();
    const chord = [392, 494, 587, 784];
    chord.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.out(0.12, (i - 1.5) * 0.15);
      osc.connect(g);
      const start = t0 + i * 0.055;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.006);
      g.gain.setValueAtTime(0.08, start + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.start(start);
      osc.stop(start + 0.6);
    });
    const shine = this.ctx.createOscillator();
    shine.type = 'triangle';
    shine.frequency.value = 1047;
    const sg = this.out(0.1);
    shine.connect(sg);
    const s0 = t0 + 0.28;
    sg.gain.setValueAtTime(0.0001, s0);
    sg.gain.exponentialRampToValueAtTime(0.1, s0 + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.4);
    shine.start(s0);
    shine.stop(s0 + 0.45);
    this.noiseBurst({ dur: 0.1, type: 'highpass', freq: 2500, gain: 0.08 });
  }

  gameStart() {
    if (!this.canPlay('game_start', 400)) return;
    this.tone({ freq: 220, type: 'sine', dur: 0.35, gain: 0.14, freqEnd: 440, attack: 0.005, release: 0.25 });
    this.noiseBurst({ dur: 0.2, type: 'bandpass', freq: 600, gain: 0.15 });
  }

  sectorAdvance() {
    if (!this.canPlay('sector_advance', 400)) return;
    this.tone({ freq: 330, type: 'sine', dur: 0.25, gain: 0.12, freqEnd: 660, attack: 0.003, release: 0.2 });
    this.tone({ freq: 495, type: 'triangle', dur: 0.3, gain: 0.08, attack: 0.005, release: 0.22 });
  }

  uiOpen() {
    if (!this.canPlay('ui_open', 80)) return;
    this.tone({ freq: 520, type: 'sine', dur: 0.1, gain: 0.08, freqEnd: 780, attack: 0.002, release: 0.08 });
    this.noiseBurst({ dur: 0.04, type: 'highpass', freq: 3500, gain: 0.05 });
  }

  uiClose() {
    if (!this.canPlay('ui_close', 80)) return;
    this.tone({ freq: 680, type: 'sine', dur: 0.08, gain: 0.07, freqEnd: 420, attack: 0.002, release: 0.07 });
  }

  uiSelect() {
    if (!this.canPlay('ui_select', 50)) return;
    this.tone({ freq: rand(640, 720), type: 'sine', dur: 0.05, gain: 0.09, attack: 0.001, release: 0.04 });
  }

  menuConfirm() {
    if (!this.canPlay('menu_confirm', 100)) return;
    this.tone({ freq: 440, type: 'sine', dur: 0.1, gain: 0.12, attack: 0.002, release: 0.08 });
    this.tone({ freq: 660, type: 'sine', dur: 0.12, gain: 0.08, attack: 0.004, release: 0.1 });
  }

  keyRebind() {
    if (!this.canPlay('key_rebind', 80)) return;
    this.tone({ freq: 880, type: 'sine', dur: 0.07, gain: 0.1, attack: 0.001, release: 0.06 });
  }

  telegraphTurret() {
    if (!this.canPlay('telegraph_turret', 150)) return;
    this.tone({ freq: 380, type: 'square', dur: 0.06, gain: 0.07, attack: 0.001, release: 0.05 });
  }

  telegraphSniper() {
    if (!this.canPlay('telegraph_sniper', 150)) return;
    this.tone({ freq: 620, type: 'sawtooth', dur: 0.08, gain: 0.08, attack: 0.001, release: 0.06 });
    this.tone({ freq: 930, type: 'sine', dur: 0.1, gain: 0.05, attack: 0.002, release: 0.08 });
  }

  enemyFire(kind = 'default') {
    if (!this.canPlay(`enemy_fire_${kind}`, 45)) return;
    const profiles = {
      turret: { f: 300, type: 'triangle', dur: 0.055, gain: 0.07, noise: 1200 },
      sprayer: { f: 420, type: 'sawtooth', dur: 0.045, gain: 0.065, noise: 1800 },
      sniper: { f: 180, type: 'sine', dur: 0.12, gain: 0.1, noise: 600 },
      orbiter: { f: 340, type: 'square', dur: 0.05, gain: 0.06, noise: 1500 },
      mine: { f: 220, type: 'triangle', dur: 0.08, gain: 0.085, noise: 900 },
    };
    const p = profiles[kind] ?? { f: 260, type: 'triangle', dur: 0.05, gain: 0.06, noise: 1400 };
    this.tone({
      freq: p.f, type: p.type, dur: p.dur, gain: p.gain,
      freqEnd: p.f * 0.55, attack: 0.001, release: 0.04,
      pan: rand(-0.15, 0.15),
    });
    this.noiseBurst({ dur: p.dur * 0.6, type: 'bandpass', freq: p.noise, gain: p.gain * 0.85 });
  }

  chainUp({ chain = 2 } = {}) {
    if (!this.canPlay('chain_up', 120)) return;
    const f = 440 + Math.min(8, chain - 1) * 55;
    this.tone({ freq: f + rand(0, 40), type: 'sine', dur: 0.1, gain: 0.1, attack: 0.002, release: 0.08 });
  }

  abilityReady() {
    if (!this.canPlay('ability_ready', 300)) return;
    this.tone({ freq: 587, type: 'sine', dur: 0.12, gain: 0.08, attack: 0.003, release: 0.1 });
  }

  /** Edge-detect telegraph warnings from world update. */
  telegraphMine() {
    if (!this.canPlay('telegraph_mine', 150)) return;
    this.tone({ freq: 300, type: 'triangle', dur: 0.1, gain: 0.08, attack: 0.002, release: 0.08 });
  }

  telegraphSprayer() {
    if (!this.canPlay('telegraph_sprayer', 150)) return;
    this.tone({ freq: 520, type: 'sine', dur: 0.07, gain: 0.07, attack: 0.001, release: 0.06 });
  }

  telegraphOrbiter() {
    if (!this.canPlay('telegraph_orbiter', 150)) return;
    this.tone({ freq: 480, type: 'sawtooth', dur: 0.07, gain: 0.07, attack: 0.001, release: 0.06 });
  }

  orbRed() {
    if (!this.canPlay('orb_red', 70)) return;
    this.tone({ freq: 320, type: 'sawtooth', dur: 0.12, gain: 0.16, freqEnd: 180, attack: 0.002, release: 0.1 });
    this.noiseBurst({ dur: 0.06, type: 'bandpass', freq: 900, gain: 0.14 });
  }

  orbBlue() {
    if (!this.canPlay('orb_blue', 70)) return;
    this.tone({ freq: 680, type: 'sine', dur: 0.14, gain: 0.14, freqEnd: 1200, attack: 0.002, release: 0.12 });
    this.noiseBurst({ dur: 0.05, type: 'highpass', freq: 2000, gain: 0.1 });
  }

  freezeStart() {
    if (!this.canPlay('freeze_start', 200)) return;
    this.tone({ freq: 220, type: 'sine', dur: 0.25, gain: 0.12, freqEnd: 440, attack: 0.005, release: 0.2 });
    this.noiseBurst({ dur: 0.08, type: 'lowpass', freq: 1200, gain: 0.1 });
  }

  freezeShatter() {
    if (!this.canPlay('freeze_shatter', 200)) return;
    this.tone({ freq: 880, type: 'triangle', dur: 0.2, gain: 0.14, attack: 0.002, release: 0.18 });
    this.noiseBurst({ dur: 0.12, type: 'bandpass', freq: 2400, gain: 0.18 });
  }

  unlockFanfare() {
    if (!this.canPlay('unlock_fanfare', 600)) return;
    this.tone({ freq: 440, type: 'sine', dur: 0.12, gain: 0.12, attack: 0.002, release: 0.1 });
    setTimeout(() => {
      this.tone({ freq: 554, type: 'sine', dur: 0.14, gain: 0.11, attack: 0.01, release: 0.12 });
    }, 80);
    setTimeout(() => {
      this.tone({ freq: 659, type: 'triangle', dur: 0.2, gain: 0.14, attack: 0.01, release: 0.16 });
      this.noiseBurst({ dur: 0.06, type: 'highpass', freq: 1800, gain: 0.08 });
    }, 160);
  }

  startBgm() {
    if (!this.unlocked || this.bgmActive || !this.ctx) return;
    this.bgmActive = true;
    const ctx = this.ctx;
    this.bgmGain = ctx.createGain();
    const vol = this.settings.muted ? 0 : 0.07 * this.settings.sfxVolume;
    this.bgmGain.gain.value = vol;
    this.bgmGain.connect(this.master);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 82.5;
    osc1.connect(this.bgmGain);
    osc2.connect(this.bgmGain);
    osc1.start();
    osc2.start();
    this.bgmOscs = [osc1, osc2];

    this.bgmPulse = setInterval(() => {
      if (!this.bgmGain || !this.ctx) return;
      const t = this.ctx.currentTime;
      const target = (this.settings.muted ? 0 : 0.05 + Math.sin(t * 0.35) * 0.025) * this.settings.sfxVolume;
      this.bgmGain.gain.setTargetAtTime(target, t, 0.5);
    }, 3000);
  }

  stopBgm() {
    this.bgmActive = false;
    if (this.bgmPulse) {
      clearInterval(this.bgmPulse);
      this.bgmPulse = null;
    }
    for (const o of this.bgmOscs || []) {
      try { o.stop(); } catch { /* already stopped */ }
    }
    this.bgmOscs = null;
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  }

  pollTelegraphs(world) {
    if (!this.unlocked || !world) return;
    const edge = (list, map, playId) => {
      for (const e of list) {
        if (e.hp <= 0) continue;
        const was = map.get(e) ?? 0;
        if (e.telegraph && !was) this.play(playId);
        map.set(e, e.telegraph);
      }
    };
    edge(world.turrets, this._lastTurretTele, 'telegraph_turret');
    edge(world.snipers, this._lastSniperTele, 'telegraph_sniper');
    edge(world.sprayers, this._lastSprayerTele, 'telegraph_sprayer');
    edge(world.orbiters, this._lastOrbiterTele, 'telegraph_orbiter');
    edge(world.mines, this._lastMineTele, 'telegraph_mine');
  }
}
