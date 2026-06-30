import { FPS } from './constants.js';
import { LockOn } from './lockon.js';
import { QuickShot } from './quickshot.js';
import { ShockRing, BreachCharge } from './pulse-breaker.js';
import { PhaseBlink, AfterimageTrail } from './phase-runner.js';
import { FanBurst, RicochetShot } from './arc-scatter.js';
import { JamPulse, StasisField } from './null-suppressor.js';
import { WeaveAmp, RailShot } from './overclock.js';

function cooldownHud(cd, maxCd) {
  if (cd <= 0) {
    return { mode: 'ready', ratio: 1, text: 'READY', ready: true };
  }
  return {
    mode: 'cooldown',
    ratio: Math.max(0, 1 - cd / maxCd),
    text: `${Math.ceil(cd / FPS)}s`,
    ready: false,
  };
}

function activeHud(timer, max, text) {
  return {
    mode: 'active',
    ratio: Math.max(0, timer / max),
    text,
    ready: false,
  };
}

export class LinearSniperKit {
  constructor(audio = null) {
    this.styleId = 'linear_sniper';
    this.lockon = new LockOn(audio);
    this.quickshot = new QuickShot(audio);
  }

  reset() {
    this.lockon.reset();
    this.quickshot.reset();
  }

  tryAbility1(world, player, usePriority = false) {
    return this.lockon.tryStart(world, player, usePriority);
  }

  tryAbility2(player, world, usePriority = false) {
    return this.quickshot.tryFire(player, world, usePriority);
  }

  update(world, player, fx, timeScale = 1) {
    this.lockon.update(world, player, fx, timeScale);
    this.quickshot.update(world, fx, timeScale);
  }

  isLocking() { return this.lockon.active; }
  lockSlowMult() { return this.lockon.active ? this.lockon.lockSlowMult() : 1; }
  crosshairPos() { return this.lockon.crosshairPos(); }
  ready1() { return this.lockon.ready(); }
  ready2() { return this.quickshot.ready(); }

  ability1Hud() {
    if (this.lockon.active) {
      return {
        mode: 'charging',
        ratio: this.lockon.timer / this.lockon.lockFramesMax,
        text: 'CHARGING',
        ready: false,
      };
    }
    return cooldownHud(this.lockon.cd, this.lockon.cooldownMax);
  }

  ability2Hud() { return cooldownHud(this.quickshot.cd, this.quickshot.cooldownMax); }
  hudLabel1() { return 'LOCK-ON'; }
  hudLabel2() { return 'QUICK'; }
  renderExtras() { return { quickshot: this.quickshot }; }
}

export class PulseBreakerKit {
  constructor(audio = null) {
    this.styleId = 'pulse_breaker';
    this.shock = new ShockRing(audio);
    this.breach = new BreachCharge(audio);
  }

  reset() { this.shock.reset(); this.breach.reset(); }
  tryAbility1(_world, player, _prio, fx) { return this.shock.tryFire(player, _world, fx); }
  tryAbility2(player, world, _prio, fx) { return this.breach.tryFire(player, world, fx); }
  update(world, player, fx, timeScale = 1) {
    this.shock.update(world, fx, timeScale);
    this.breach.update(world, fx, timeScale);
  }
  isLocking() { return false; }
  lockSlowMult() { return 1; }
  crosshairPos() { return null; }
  ready1() { return this.shock.ready(); }
  ready2() { return this.breach.ready(); }
  ability1Hud() { return cooldownHud(this.shock.cd, this.shock.cooldownMax); }
  ability2Hud() { return cooldownHud(this.breach.cd, this.breach.cooldownMax); }
  hudLabel1() { return 'SHOCK'; }
  hudLabel2() { return 'BREACH'; }
  renderExtras() { return { pulses: this.shock.pulses, blasts: this.breach.blasts }; }
}

export class PhaseRunnerKit {
  constructor(audio = null) {
    this.styleId = 'phase_runner';
    this.blink = new PhaseBlink(audio);
    this.trail = new AfterimageTrail(audio);
  }

  reset() { this.blink.reset(); this.trail.reset(); }
  tryAbility1(world, player, _prio, fx) { return this.blink.tryFire(player, world, fx); }
  tryAbility2(_player, world, _prio, fx) { return this.trail.tryFire(_player, world, fx); }
  update(world, player, fx, timeScale = 1) {
    this.blink.update(world, fx, timeScale);
    this.trail.update(player, world, fx, timeScale);
  }
  isLocking() { return false; }
  lockSlowMult() { return 1; }
  crosshairPos() { return null; }
  ready1() { return this.blink.ready(); }
  ready2() { return this.trail.ready(); }
  ability1Hud() { return cooldownHud(this.blink.cd, this.blink.cooldownMax); }
  ability2Hud() {
    if (this.trail.active) return activeHud(this.trail.timer, this.trail.durationMax, 'TRAIL');
    return cooldownHud(this.trail.cd, this.trail.cooldownMax);
  }
  hudLabel1() { return 'BLINK'; }
  hudLabel2() { return 'TRAIL'; }
  renderExtras() { return { flashes: this.blink.flashes, trailNodes: this.trail.nodes, trailActive: this.trail.active }; }
}

export class ArcScatterKit {
  constructor(audio = null) {
    this.styleId = 'arc_scatter';
    this.fan = new FanBurst(audio);
    this.rico = new RicochetShot(audio);
  }

  reset() { this.fan.reset(); this.rico.reset(); }
  tryAbility1(world, player, usePriority = false) { return this.fan.tryFire(player, world, usePriority); }
  tryAbility2(player, world, usePriority = false) { return this.rico.tryFire(player, world, usePriority); }
  update(world, player, fx, timeScale = 1) {
    this.fan.update(world, fx, timeScale);
    this.rico.update(world, fx, timeScale);
  }
  isLocking() { return false; }
  lockSlowMult() { return 1; }
  crosshairPos() { return null; }
  ready1() { return this.fan.ready(); }
  ready2() { return this.rico.ready(); }
  ability1Hud() { return cooldownHud(this.fan.cd, this.fan.cooldownMax); }
  ability2Hud() { return cooldownHud(this.rico.cd, this.rico.cooldownMax); }
  hudLabel1() { return 'FAN'; }
  hudLabel2() { return 'RICO'; }
  renderExtras() {
    return { playerBullets: [...this.fan.bullets, ...this.rico.bullets] };
  }
}

export class NullSuppressorKit {
  constructor(audio = null) {
    this.styleId = 'null_suppressor';
    this.jam = new JamPulse(audio);
    this.stasis = new StasisField(audio);
  }

  reset() { this.jam.reset(); this.stasis.reset(); }
  tryAbility1(world, player, usePriority = false, fx) { return this.jam.tryFire(player, world, fx, usePriority); }
  tryAbility2(player, world) { return this.stasis.tryActivate(player, world); }
  update(world, player, fx, timeScale = 1) {
    this.jam.update(world, fx, timeScale);
    this.stasis.update(player, world, fx, timeScale);
  }
  isLocking() { return false; }
  lockSlowMult() { return 1; }
  crosshairPos() { return null; }
  ready1() { return this.jam.ready(); }
  ready2() { return this.stasis.ready(); }
  ability1Hud() { return cooldownHud(this.jam.cd, this.jam.cooldownMax); }
  ability2Hud() {
    if (this.stasis.active) return activeHud(this.stasis.timer, this.stasis.durationMax, 'STASIS');
    return cooldownHud(this.stasis.cd, this.stasis.cooldownMax);
  }
  hudLabel1() { return 'JAM'; }
  hudLabel2() { return 'STASIS'; }
  renderExtras() { return { jamBursts: this.jam.bursts, stasis: this.stasis }; }
}

export class OverclockKit {
  constructor(audio = null) {
    this.styleId = 'overclock';
    this.amp = new WeaveAmp(audio);
    this.rail = new RailShot(audio);
  }

  reset() {
    this.amp.reset();
    this.rail.reset();
  }

  tryAbility1(world, player, _prio, fx) { return this.amp.tryFire(player, world, fx); }
  tryAbility2(player, world, _prio, fx) { return this.rail.tryFire(player, world, fx); }
  update(world, player, fx, timeScale = 1) {
    this.amp.update(player, world, fx, timeScale);
    this.rail.update(world, fx, timeScale);
  }
  isLocking() { return false; }
  lockSlowMult() { return 1; }
  crosshairPos() { return null; }
  ready1() { return this.amp.ready(); }
  ready2() { return this.rail.ready(); }
  ability1Hud() {
    if (this.amp.active) return activeHud(this.amp.timer, this.amp.durationMax, 'AMPED');
    return cooldownHud(this.amp.cd, this.amp.cooldownMax);
  }

  ability2Hud(player) {
    if (player?.chain < 2 && this.rail.cd <= 0) {
      return { mode: 'cooldown', ratio: 0, text: 'CHAIN', ready: false };
    }
    return cooldownHud(this.rail.cd, this.rail.cooldownMax);
  }
  hudLabel1() { return 'AMP'; }
  hudLabel2() { return 'RAIL'; }
  renderExtras() { return { railBeams: this.rail.beams, ampActive: this.amp.active }; }
}

const KITS = {
  linear_sniper: LinearSniperKit,
  pulse_breaker: PulseBreakerKit,
  phase_runner: PhaseRunnerKit,
  arc_scatter: ArcScatterKit,
  null_suppressor: NullSuppressorKit,
  overclock: OverclockKit,
};

export function createAbilityKit(styleId, audio = null) {
  const Kit = KITS[styleId] || LinearSniperKit;
  return new Kit(audio);
}
