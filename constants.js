export const FPS = 60;
export const FRAME = 1000 / FPS;
export const WAVE_MIN_SEC = 10;
export const WAVE_MAX_SEC = 30;
export const waveFrames = (sec) => sec * FPS;

export const COUNTDOWN_SEC = 3;
export const COMBAT_GRACE_FRAMES = 50;
export const SECTOR_LOAD_STAGGER = 30;
export const CLEAR_CELEBRATION_FRAMES = 40;
export const SAVE_REMINDER_CLEARS = 3; /** sector or endless wave clears per session */

export const LOCKON = {
  lockFrames: 120,
  hitChance: 1,
  normalDmg: 0.5,
  greenDmg: 0.25,
  cooldown: 4 * FPS,
  lockSlow: 0.78,
};

export const TURRET_TELEGRAPH = 12;
export const SNIPER_TELEGRAPH = 22;
export const SPRAYER_TELEGRAPH = 12;
export const ORBITER_TELEGRAPH = 14;
export const MINE_TELEGRAPH = 16;

export const FIRE = {
  turret: 78,
  sprayer: 62,
  orbiter: 82,
  sniper: 112,
  mine: 98,
};

/** Multiplier applied to enemy bullet velocity at fire time. */
export const BULLET_SPD_SCALE = 0.70;

/** Multiplier applied to chaser (star enemy) move speed. */
export const CHASER_SPD_SCALE = 0.62;

export const ENEMY = {
  turret: {
    cd: FIRE.turret,
    telegraph: TURRET_TELEGRAPH,
    bulletR: 5,
    maxLead: FIRE.turret,
  },
  sprayer: {
    cd: FIRE.sprayer,
    telegraph: SPRAYER_TELEGRAPH,
    bulletR: 4,
    maxLead: FIRE.sprayer,
  },
  chaser: {
    r: 14,
    maxRange: 220,
  },
  orbiter: {
    bulletR: 4,
    burst: 2,
    spread: 0.32,
    telegraph: ORBITER_TELEGRAPH,
  },
  sniper: {
    bulletR: 5,
    telegraph: SNIPER_TELEGRAPH,
  },
  mine: {
    bulletR: 4,
    burst: 5,
    telegraph: MINE_TELEGRAPH,
  },
};

export const QUICK = {
  spd: 6.2,
  dmg: 0.1,
  cooldown: 3 * FPS,
  radius: 4,
  homing: 0.22,
};

export const ENEMY_HP = {
  turret: 80,
  sprayer: 95,
  chaser: 62,
  orbiter: 72,
  sniper: 68,
  mine: 98,
};

export const W = 960;
export const H = 540;
export const ARENA = { x: 80, y: 60, w: 800, h: 420 };

export const C = {
  bg: '#050508',
  floor: '#0e0e16',
  floorLight: '#161622',
  grid: '#1e1e2a',
  gridAccent: '#ff3c50',
  wall: '#ff3048',
  wallGlow: '#ff304888',
  wallInner: '#ff607044',

  playerBody: '#242030',
  playerSuit: '#363448',
  playerHighlight: '#524e68',
  playerCore: '#5ecfff',
  playerCoreBright: '#a8e8ff',
  playerVisor: '#e8f4ff',
  playerShadow: '#00000055',
  playerTrim: '#ff5070',

  bullet: '#ff3c50',
  bulletCore: '#ffb040',
  bulletGlow: '#ff3c5066',
  greenBullet: '#3dff7a',
  greenBulletCore: '#b8ffd0',
  greenGlow: '#3dff7a44',

  telegraph: '#ffffff',
  perfect: '#5ecfff',

  turretBase: '#1e1e28',
  turretMetal: '#404058',
  turretAccent: '#ff3c50',
  turretEye: '#ff6060',
  turretEyeHot: '#ffffff',

  chaserBody: '#581028',
  chaserBlade: '#c03060',
  chaserCore: '#ff5080',

  sprayerBody: '#0f3820',
  sprayerPod: '#1a5030',
  sprayerVein: '#3dff7a',
  sprayerCore: '#7affaa',

  orbiterBody: '#222040',
  orbiterRing: '#9080ff',
  orbiterCore: '#c8b8ff',

  sniperBody: '#141420',
  sniperLens: '#ff6040',
  sniperRail: '#505068',

  mineBody: '#322018',
  mineSpike: '#ff9040',
  mineCore: '#ffc060',

  healthBg: '#180808',
  healthFg: '#ff3c50',
  healthBorder: '#ff3c5044',
  healthLow: '#ff8080',

  lockYellow: '#ffd700',
  crosshair: '#ff3048',
  playerShot: '#5ecfff',
  playerShotCore: '#e8f8ff',
  playerDashTrail: '#5ecfff55',
  playerRim: '#c8e8ff',

  fxWhite: '#fff4f6',
  fxKill: '#ffe8ec',
  fxMuted: '#686878',
  fxStomp: '#e8f4ff',

  arenaAccent: '#ff3c5033',
  arenaInner: '#0c0c14',
  vignette: 'rgba(4, 2, 6, 0.58)',
  nebulaRed: 'rgba(255, 48, 72, 0.09)',
  nebulaCool: 'rgba(94, 207, 255, 0.05)',
};

export const DASH_CD_SEC = 0.45;
export const PERFECT_DASH_CD_REDUCE = 0.5;
export const CHAIN_DECAY_FRAMES = 180;
export const PERFECT_WEAVE_DMG = 0.05;
/** Extra collision radius for perfect weave detection (not the timing window). */
export const PERFECT_WEAVE_HIT_PAD = 5;
export const WC_PER_PERFECT_WEAVE = 5;
export const WC_CHALLENGE_MIN = 10;
export const WC_CHALLENGE_MAX = 30;

/** Enemy types that kill the player on contact — perfect weave deletes them. */
export const TOUCH_LETHAL_ENEMIES = new Set(['chaser']);

export const P = {
  r: 10,
  speed: 4.9,
  accel: 0.85,
  friction: 0.84,
  dashSpd: 13,
  dashLen: 9,
  dashIFrame: 8,
  dashCD: Math.round(DASH_CD_SEC * FPS),
  perfectWindow: 7,
  perfectCD: 0,
  perfectLethalFrames: 7,
  dashCurveRate: 0.42,
  dashCurveMax: Math.PI * 2 * 0.55,
};
