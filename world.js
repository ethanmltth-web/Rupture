import {
  ARENA, FIRE, ENEMY_HP, TURRET_TELEGRAPH, SNIPER_TELEGRAPH,
  SPRAYER_TELEGRAPH, ORBITER_TELEGRAPH, MINE_TELEGRAPH,
  BULLET_SPD_SCALE, CHASER_SPD_SCALE, ENEMY, P, SECTOR_LOAD_STAGGER,
  FPS, WAVE_MIN_SEC, PERFECT_WEAVE_DMG, TOUCH_LETHAL_ENEMIES, PERFECT_WEAVE_HIT_PAD,
} from './constants.js';
import { advanceTimer } from './gameTime.js';
import { pickMutatorForWave } from './mutators.js';

function distPt(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function norm(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** Steps player + bullet forward and returns frame of contact, or null. */
function dashPositions(player, maxF) {
  const pts = [{ x: player.x, y: player.y }];
  if (!player.dashing) return pts;

  const path = player.dashPath || [];
  for (let f = 1; f <= maxF; f++) {
    if (path[f]) {
      pts.push({ x: path[f].x, y: path[f].y });
    } else {
      const prev = pts[pts.length - 1];
      pts.push({
        x: prev.x + player.dashDir.x * P.dashSpd,
        y: prev.y + player.dashDir.y * P.dashSpd,
      });
    }
  }
  return pts;
}

function weaveHitRadius(player) {
  return player.hit.r + PERFECT_WEAVE_HIT_PAD;
}

function framesUntilBulletHit(b, player, maxF) {
  const pr = weaveHitRadius(player);
  const ppts = dashPositions(player, maxF);

  for (let f = 0; f <= maxF; f++) {
    const bx = b.x + b.vx * f;
    const by = b.y + b.vy * f;
    const p = ppts[Math.min(f, ppts.length - 1)];
    if (distPt(p.x, p.y, bx, by) < pr + b.r) return f;
  }
  return null;
}

function framesUntilChaserHit(c, player, maxF) {
  const pr = weaveHitRadius(player);
  let px = player.x;
  let py = player.y;
  let cx = c.x;
  let cy = c.y;
  const dash = player.dashing;
  const ddx = dash ? player.dashDir.x * P.dashSpd : 0;
  const ddy = dash ? player.dashDir.y * P.dashSpd : 0;

  for (let f = 0; f <= maxF; f++) {
    if (distPt(px, py, cx, cy) < pr + c.r) return f;
    const toP = norm(px - cx, py - cy);
    cx += toP.x * c.spd;
    cy += toP.y * c.spd;
    px += ddx;
    py += ddy;
  }
  return null;
}

function enemyBodyRadius(type, ref) {
  if (type === 'chaser') return ref.r;
  return 14;
}

function framesUntilPointHit(px, py, radius, player, maxF) {
  const pr = weaveHitRadius(player);
  const path = dashPositions(player, maxF);
  for (let f = 0; f < path.length; f++) {
    if (distPt(path[f].x, path[f].y, px, py) < pr + radius) return f;
  }
  return null;
}

function framesUntilOrbiterHit(o, player, maxF) {
  const pr = weaveHitRadius(player);
  const path = dashPositions(player, maxF);
  for (let f = 0; f < path.length; f++) {
    const pos = orbiterPos(o, f);
    if (distPt(path[f].x, path[f].y, pos.x, pos.y) < pr + 14) return f;
  }
  return null;
}

function framesUntilEnemyWeaveHit(entry, player, maxF) {
  const { type, ref, x, y } = entry;
  if (type === 'chaser') return framesUntilChaserHit(ref, player, maxF);
  if (type === 'orbiter') return framesUntilOrbiterHit(ref, player, maxF);
  return framesUntilPointHit(x, y, enemyBodyRadius(type, ref), player, maxF);
}

function spawnTurret(x, y, burst, spd, spread, elite = false) {
  const hp = elite ? ENEMY_HP.turret * 2 : ENEMY_HP.turret;
  return {
    x, y, homeX: x, homeY: y,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderR: 32 + Math.random() * 28,
    cd: FIRE.turret, timer: FIRE.turret, telegraph: 0,
    burst: burst || 1, spd: spd || 3.6, spread: spread || 0,
    hp, maxHp: hp, elite: !!elite,
  };
}

function applyElite(ref) {
  ref.elite = true;
  ref.maxHp = Math.round(ref.maxHp * 2);
  ref.hp = ref.maxHp;
}

function spawnSprayer(x, y, spd, elite = false) {
  const hp = elite ? ENEMY_HP.sprayer * 2 : ENEMY_HP.sprayer;
  return {
    x, y, homeX: x, homeY: y,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderR: 28 + Math.random() * 22,
    cd: FIRE.sprayer, timer: FIRE.sprayer, telegraph: 0, spd: spd || 4.2,
    hp, maxHp: hp, elite: !!elite,
  };
}

function spawnChaser(x, y, spd, elite = false) {
  const hp = elite ? ENEMY_HP.chaser * 2 : ENEMY_HP.chaser;
  return {
    x, y, spd: (spd || 1.8) * CHASER_SPD_SCALE, r: 14,
    hp, maxHp: hp, elite: !!elite,
  };
}

function spawnOrbiter(x, y, orbitR, orbitSpd, bulletSpd, elite = false) {
  const hp = elite ? ENEMY_HP.orbiter * 2 : ENEMY_HP.orbiter;
  return {
    x, y, homeX: x, homeY: y,
    orbitR: orbitR || 48,
    orbitSpd: orbitSpd || 0.024,
    phase: Math.random() * Math.PI * 2,
    cd: FIRE.orbiter, timer: FIRE.orbiter, telegraph: 0,
    spd: bulletSpd || 3.5,
    hp, maxHp: hp, elite: !!elite,
  };
}

function spawnSniper(x, y, elite = false) {
  const hp = elite ? ENEMY_HP.sniper * 2 : ENEMY_HP.sniper;
  return {
    x, y, homeX: x, homeY: y,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderR: 18 + Math.random() * 14,
    cd: FIRE.sniper, timer: FIRE.sniper, telegraph: 0,
    spd: 5.4,
    hp, maxHp: hp, elite: !!elite,
  };
}

function spawnMine(x, y, elite = false) {
  const hp = elite ? ENEMY_HP.mine * 2 : ENEMY_HP.mine;
  return {
    x, y, homeX: x, homeY: y,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderR: 12 + Math.random() * 10,
    cd: FIRE.mine, timer: FIRE.mine, telegraph: 0,
    spin: Math.random() * Math.PI * 2,
    hp, maxHp: hp, elite: !!elite,
  };
}

function orbiterPos(o, frames = 0) {
  const ang = o.phase + o.orbitSpd * frames;
  return {
    x: o.homeX + Math.cos(ang) * o.orbitR,
    y: o.homeY + Math.sin(ang) * o.orbitR,
    ang,
  };
}

function spawnFromEntry(entry) {
  const { type, args: a } = entry;
  const ax = ARENA.x + a[0] * ARENA.w;
  const ay = ARENA.y + a[1] * ARENA.h;
  switch (type) {
    case 'turret': return { type, ref: spawnTurret(ax, ay, a[2], a[3], a[4]) };
    case 'sprayer': return { type, ref: spawnSprayer(ax, ay, a[2]) };
    case 'chaser': return { type, ref: spawnChaser(ax, ay, a[2]) };
    case 'orbiter': return { type, ref: spawnOrbiter(ax, ay, a[2], a[3], a[4]) };
    case 'sniper': return { type, ref: spawnSniper(ax, ay) };
    case 'mine': return { type, ref: spawnMine(ax, ay) };
    default: return null;
  }
}

function pushSpawn(world, entry) {
  const spawned = spawnFromEntry(entry);
  if (!spawned) return;
  switch (spawned.type) {
    case 'turret': world.turrets.push(spawned.ref); break;
    case 'sprayer': world.sprayers.push(spawned.ref); break;
    case 'chaser': world.chasers.push(spawned.ref); break;
    case 'orbiter': world.orbiters.push(spawned.ref); break;
    case 'sniper': world.snipers.push(spawned.ref); break;
    case 'mine': world.mines.push(spawned.ref); break;
    default: break;
  }
}

const ENDLESS_ENEMY_TYPES = ['turret', 'sprayer', 'chaser', 'orbiter', 'sniper', 'mine'];

function randomArenaNorm(pad = 0.12) {
  return pad + Math.random() * (1 - pad * 2);
}

function randomEndlessSpawn() {
  const type = ENDLESS_ENEMY_TYPES[Math.floor(Math.random() * ENDLESS_ENEMY_TYPES.length)];
  const nx = randomArenaNorm();
  const ny = randomArenaNorm();
  switch (type) {
    case 'turret':
      return {
        type,
        args: [nx, ny, 1 + Math.floor(Math.random() * 2), 3.2 + Math.random() * 1.2, Math.random() * 0.35],
      };
    case 'sprayer':
      return { type, args: [nx, ny, 4 + Math.random() * 1.2] };
    case 'chaser':
      return { type, args: [nx, ny, 1.4 + Math.random() * 0.8] };
    case 'orbiter':
      return {
        type,
        args: [nx, ny, 36 + Math.random() * 16, 0.016 + Math.random() * 0.012, 3.2 + Math.random() * 0.6],
      };
    case 'sniper':
      return { type, args: [nx, ny] };
    case 'mine':
      return { type, args: [nx, ny] };
    default:
      return randomEndlessSpawn();
  }
}

export class World {
  constructor() {
    this.bullets = [];
    this.turrets = [];
    this.sprayers = [];
    this.chasers = [];
    this.orbiters = [];
    this.snipers = [];
    this.mines = [];
    this.timer = 0;
    this.levelIdx = 0;
    this.cleared = false;
    this.clearTimer = 0;
    this.modifier = 'classic';
    this.endlessWave = 0;
    this.endlessCleared = 0;
    this.ngPlus = false;
    this.telegraphMult = 1;
    this.onEnemyKill = null;
    this.runMutator = null;
    this.bossSpawned = false;
  }

  reset(startLevel = 0, modifier = 'classic') {
    this.bullets = [];
    this.turrets = [];
    this.sprayers = [];
    this.chasers = [];
    this.orbiters = [];
    this.snipers = [];
    this.mines = [];
    this.timer = 0;
    this.levelIdx = 0;
    this.cleared = false;
    this.clearTimer = 0;
    this.modifier = modifier;
    this.ngPlus = modifier === 'newgameplus';
    this.telegraphMult = this.ngPlus ? 0.72 : 1;
    this.endlessWave = 0;
    this.endlessCleared = 0;
    this.runMutator = null;
    this.bossSpawned = false;
    if (modifier === 'endless') {
      this.loadEndlessWave(1);
      return;
    }
    this.loadLevel(startLevel);
  }

  loadEndlessWave(wave) {
    this.endlessWave = wave;
    this.bullets = [];
    this.turrets = [];
    this.sprayers = [];
    this.chasers = [];
    this.orbiters = [];
    this.snipers = [];
    this.mines = [];
    this.timer = 0;
    this.cleared = false;
    this.clearTimer = 0;
    this.levelIdx = -1;

    this.runMutator = pickMutatorForWave(wave);
    let count = Math.min(3 + Math.floor(wave * 0.8), 8);
    if (this.runMutator === 'double_density') count = Math.min(count * 2, 14);
    for (let i = 0; i < count; i++) {
      pushSpawn(this, randomEndlessSpawn());
    }
    if (wave >= 4 && Math.random() < 0.35) {
      const all = this.allEnemies();
      if (all.length) applyElite(all[Math.floor(Math.random() * all.length)].ref);
    }
    const breath = Math.floor(FPS * WAVE_MIN_SEC * 0.12 * Math.min(wave, 5));
    this._goal = null;
    this.staggerEnemyTimers(SECTOR_LOAD_STAGGER + breath);
  }

  isEndless() {
    return this.modifier === 'endless';
  }

  loadLevel(i) {
    this.levelIdx = i;
    this.bullets = [];
    this.turrets = [];
    this.sprayers = [];
    this.chasers = [];
    this.orbiters = [];
    this.snipers = [];
    this.mines = [];
    this.timer = 0;
    this.cleared = false;
    this.clearTimer = 0;
    this.bossSpawned = false;

    const lv = LEVELS[i] || LEVELS[LEVELS.length - 1];

    for (const t of lv.turrets || []) {
      this.turrets.push(spawnTurret(
        ARENA.x + t[0] * ARENA.w, ARENA.y + t[1] * ARENA.h, t[2], t[3], t[4],
      ));
    }
    for (const s of (lv.sprayers || [])) {
      this.sprayers.push(spawnSprayer(
        ARENA.x + s[0] * ARENA.w, ARENA.y + s[1] * ARENA.h, s[2],
      ));
    }
    for (const c of (lv.chasers || [])) {
      this.chasers.push(spawnChaser(
        ARENA.x + c[0] * ARENA.w, ARENA.y + c[1] * ARENA.h, c[2],
      ));
    }
    for (const o of (lv.orbiters || [])) {
      this.orbiters.push(spawnOrbiter(
        ARENA.x + o[0] * ARENA.w, ARENA.y + o[1] * ARENA.h, o[2], o[3], o[4],
      ));
    }
    for (const sn of (lv.snipers || [])) {
      this.snipers.push(spawnSniper(
        ARENA.x + sn[0] * ARENA.w, ARENA.y + sn[1] * ARENA.h,
      ));
    }
    for (const m of (lv.mines || [])) {
      this.mines.push(spawnMine(
        ARENA.x + m[0] * ARENA.w, ARENA.y + m[1] * ARENA.h,
      ));
    }

    this._goal = null;
    this.staggerEnemyTimers(SECTOR_LOAD_STAGGER);

    if (this.ngPlus) {
      const extra = randomEndlessSpawn();
      pushSpawn(this, extra);
      const all = this.allEnemies();
      if (all.length > 0) {
        const pick = all[Math.floor(Math.random() * all.length)];
        if (pick?.ref) applyElite(pick.ref);
      }
    }

    if (i === LEVELS.length - 1 && this.modifier !== 'endless') {
      this.spawnBoss();
    }
  }

  spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const cx = ARENA.x + ARENA.w * 0.5;
    const cy = ARENA.y + ARENA.h * 0.42;
    const boss = spawnSprayer(cx, cy, 3.2, true);
    boss.boss = true;
    boss.maxHp = ENEMY_HP.sprayer * 10;
    boss.hp = boss.maxHp;
    boss.wanderR = 18;
    this.sprayers.push(boss);
  }

  weaveOnly() {
    return this.runMutator === 'weave_only';
  }

  bulletSpeedMult() {
    return this.runMutator === 'glass_cannon' ? 1.35 : 1;
  }

  weaveDamageMult() {
    return this.runMutator === 'glass_cannon' ? 2 : 1;
  }

  mutatorLabel() {
    if (!this.runMutator) return '';
    return this.runMutator.replace(/_/g, ' ').toUpperCase();
  }

  nextLevel() {
    if (this.modifier === 'endless') {
      this.endlessCleared++;
      this.loadEndlessWave(this.endlessWave + 1);
      return;
    }
    if (this.levelIdx + 1 >= LEVELS.length) {
      this.loadLevel(LEVELS.length - 1);
      for (const s of this.sprayers) s.spd = Math.min(7, s.spd + 0.2);
      return;
    }
    this.loadLevel(this.levelIdx + 1);
  }

  allEnemies() {
    const list = [];
    for (const t of this.turrets) if (t.hp > 0) list.push({ ref: t, type: 'turret', x: t.x, y: t.y });
    for (const s of this.sprayers) if (s.hp > 0) list.push({ ref: s, type: 'sprayer', x: s.x, y: s.y });
    for (const c of this.chasers) if (c.hp > 0) list.push({ ref: c, type: 'chaser', x: c.x, y: c.y });
    for (const o of this.orbiters) if (o.hp > 0) list.push({ ref: o, type: 'orbiter', x: o.x, y: o.y });
    for (const sn of this.snipers) if (sn.hp > 0) list.push({ ref: sn, type: 'sniper', x: sn.x, y: sn.y });
    for (const m of this.mines) if (m.hp > 0) list.push({ ref: m, type: 'mine', x: m.x, y: m.y });
    return list;
  }

  nearestEnemy(px, py) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.allEnemies()) {
      const d = dist({ x: px, y: py }, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  priorityEnemy(px, py) {
    let best = null;
    let bestScore = -Infinity;
    const rupture = LEVELS[this.levelIdx]?.name === 'RUPTURE';
    const weights = {
      sprayer: 120, mine: 115, sniper: 105, chaser: rupture ? 75 : 90,
      orbiter: 88, turret: 70,
    };
    for (const e of this.allEnemies()) {
      const d = dist({ x: px, y: py }, e);
      let priority = weights[e.type] || 70;
      if (e.type === 'turret') {
        priority += (e.ref.burst || 1) * 12 + e.ref.spd * 2;
      }
      if (e.type === 'sprayer' && rupture) {
        priority += 30 - Math.abs(e.y - (ARENA.y + ARENA.h * 0.5)) * 0.06;
      }
      const score = priority - d * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  levelCount() {
    return LEVELS.length;
  }

  removeEnemy(_type, ref) {
    if (ref._removed) return;
    ref._removed = true;
    ref.hp = 0;
    this.onEnemyKill?.(_type, ref);
    this.turrets = this.turrets.filter(t => t.hp > 0);
    this.sprayers = this.sprayers.filter(s => s.hp > 0);
    this.chasers = this.chasers.filter(c => c.hp > 0);
    this.orbiters = this.orbiters.filter(o => o.hp > 0);
    this.snipers = this.snipers.filter(s => s.hp > 0);
    this.mines = this.mines.filter(m => m.hp > 0);
  }

  enemyCount() {
    return this.allEnemies().length;
  }

  update(player, combatActive = true, timeScale = 1, audio = null) {
    const ts = Math.max(0, timeScale);
    this._audio = audio;

    if (this.cleared) {
      this.clearTimer += ts;
      return;
    }

    if (combatActive) {
      this.timer += ts;
      this.moveEnemies(ts);
      audio?.pollTelegraphs(this);
    }

    for (const t of this.turrets) {
      if (t.hp <= 0 || !combatActive || t.frozen) continue;
      const adv = advanceTimer(t.timer, t.cd, ts);
      t.timer = adv.timer;
      t.telegraph = t.timer <= TURRET_TELEGRAPH * this.telegraphMult && t.timer > 0 ? 1 : 0;
      for (let i = 0; i < adv.fired; i++) {
        t.telegraph = 0;
        this.fireTurret(t, player);
      }
    }

    for (const s of this.sprayers) {
      if (s.hp <= 0 || !combatActive || s.frozen) continue;
      if (s.slowT > 0) s.slowT -= ts;
      const adv = advanceTimer(s.timer, s.cd, ts);
      s.timer = adv.timer;
      s.telegraph = s.timer <= SPRAYER_TELEGRAPH * this.telegraphMult && s.timer > 0 ? 1 : 0;
      for (let i = 0; i < adv.fired; i++) {
        s.telegraph = 0;
        this.fireSprayer(s, player);
      }
    }

    for (const o of this.orbiters) {
      if (o.hp <= 0 || !combatActive || o.frozen) continue;
      const adv = advanceTimer(o.timer, o.cd, ts);
      o.timer = adv.timer;
      o.telegraph = o.timer <= ORBITER_TELEGRAPH * this.telegraphMult && o.timer > 0 ? 1 : 0;
      for (let i = 0; i < adv.fired; i++) {
        o.telegraph = 0;
        this.fireOrbiter(o, player);
      }
    }

    for (const sn of this.snipers) {
      if (sn.hp <= 0 || !combatActive || sn.frozen) continue;
      const adv = advanceTimer(sn.timer, sn.cd, ts);
      sn.timer = adv.timer;
      sn.telegraph = sn.timer <= SNIPER_TELEGRAPH * this.telegraphMult && sn.timer > 0 ? 1 : 0;
      for (let i = 0; i < adv.fired; i++) {
        sn.telegraph = 0;
        this.fireSniper(sn, player);
      }
    }

    for (const m of this.mines) {
      if (m.hp <= 0 || !combatActive || m.frozen) continue;
      const adv = advanceTimer(m.timer, m.cd, ts);
      m.timer = adv.timer;
      m.telegraph = m.timer <= MINE_TELEGRAPH * this.telegraphMult && m.timer > 0 ? 1 : 0;
      for (let i = 0; i < adv.fired; i++) {
        m.telegraph = 0;
        m.spin += 0.35;
        this.fireMine(m);
      }
    }

    for (const c of this.chasers) {
      if (c.hp <= 0 || !combatActive || c.frozen) continue;
      const d = norm(player.x - c.x, player.y - c.y);
      c.x += d.x * c.spd * ts;
      c.y += d.y * c.spd * ts;
      c.x = Math.max(ARENA.x + 20, Math.min(ARENA.x + ARENA.w - 20, c.x));
      c.y = Math.max(ARENA.y + 20, Math.min(ARENA.y + ARENA.h - 20, c.y));
    }

    for (const b of this.bullets) {
      if (b.frozen) continue;
      if (b.homing && combatActive) {
        const turn = (b.turn ?? 0.05) * ts;
        const d = norm(player.x - b.x, player.y - b.y);
        const spd = Math.hypot(b.vx, b.vy) || 1;
        b.vx = b.vx * (1 - turn) + d.x * spd * turn;
        b.vy = b.vy * (1 - turn) + d.y * spd * turn;
      }
      b.x += b.vx * ts;
      b.y += b.vy * ts;
      b.life -= ts;
    }
    this.bullets = this.bullets.filter(b =>
      b.life > 0 &&
      b.x > ARENA.x - 20 && b.x < ARENA.x + ARENA.w + 20 &&
      b.y > ARENA.y - 20 && b.y < ARENA.y + ARENA.h + 20
    );

    if (combatActive && this.enemyCount() === 0) {
      this.cleared = true;
      this.clearTimer = 0;
    }
  }

  moveEnemies(timeScale = 1) {
    if (this.levelIdx === 0) return;

    const ts = Math.max(0, timeScale);
    const a = ARENA;
    const wanderScale = Math.min(1, 0.35 + this.levelIdx * 0.12);
    const moveWander = (e, speed) => {
      const slow = e.slowT > 0 ? 0.55 : 1;
      e.wanderPhase += (0.018 + speed * 0.002) * ts * slow;
      e.x = e.homeX + Math.cos(e.wanderPhase) * e.wanderR * wanderScale;
      e.y = e.homeY + Math.sin(e.wanderPhase * 0.85) * e.wanderR * 0.75 * wanderScale;
      e.x = Math.max(a.x + 24, Math.min(a.x + a.w - 24, e.x));
      e.y = Math.max(a.y + 24, Math.min(a.y + a.h - 24, e.y));
    };

    for (const t of this.turrets) {
      if (t.hp <= 0 || t.frozen) continue;
      moveWander(t, t.spd);
    }
    for (const s of this.sprayers) {
      if (s.hp <= 0 || s.frozen) continue;
      moveWander(s, s.spd);
    }
    for (const sn of this.snipers) {
      if (sn.hp <= 0 || sn.frozen) continue;
      moveWander(sn, 2.5);
    }
    for (const m of this.mines) {
      if (m.hp <= 0 || m.frozen) continue;
      moveWander(m, 1.2);
    }
    for (const o of this.orbiters) {
      if (o.hp <= 0 || o.frozen) continue;
      o.phase += o.orbitSpd * ts;
      const pos = orbiterPos(o);
      o.x = pos.x;
      o.y = pos.y;
      o.x = Math.max(a.x + 24, Math.min(a.x + a.w - 24, o.x));
      o.y = Math.max(a.y + 24, Math.min(a.y + a.h - 24, o.y));
    }
  }

  fireTurret(t, player) {
    this._audio?.play('enemy_fire', { kind: 'turret' });
    const base = norm(player.x - t.x, player.y - t.y);
    const bulletSpd = t.spd * BULLET_SPD_SCALE * this.bulletSpeedMult();
    for (let i = 0; i < t.burst; i++) {
      const ang = Math.atan2(base.y, base.x) + (i - (t.burst - 1) / 2) * t.spread;
      this.bullets.push({
        x: t.x, y: t.y,
        vx: Math.cos(ang) * bulletSpd,
        vy: Math.sin(ang) * bulletSpd,
        r: 5, life: 180, kind: 'red',
      });
    }
  }

  fireSprayer(s, player) {
    this._audio?.play('enemy_fire', { kind: 'sprayer' });
    const base = norm(player.x - s.x, player.y - s.y);
    const bulletSpd = s.spd * BULLET_SPD_SCALE;
    const spdMult = this.bulletSpeedMult();
    this.bullets.push({
      x: s.x, y: s.y,
      vx: base.x * bulletSpd * spdMult, vy: base.y * bulletSpd * spdMult,
      r: 4, life: 150, kind: 'green', homing: true, turn: 0.06,
    });
  }

  fireOrbiter(o, player) {
    this._audio?.play('enemy_fire', { kind: 'orbiter' });
    const base = norm(player.x - o.x, player.y - o.y);
    const bulletSpd = o.spd * BULLET_SPD_SCALE * this.bulletSpeedMult();
    const burst = ENEMY.orbiter.burst;
    const spread = ENEMY.orbiter.spread;
    for (let i = 0; i < burst; i++) {
      const ang = Math.atan2(base.y, base.x) + (i - (burst - 1) / 2) * spread;
      this.bullets.push({
        x: o.x, y: o.y,
        vx: Math.cos(ang) * bulletSpd,
        vy: Math.sin(ang) * bulletSpd,
        r: ENEMY.orbiter.bulletR, life: 160, kind: 'purple',
      });
    }
  }

  fireSniper(sn, player) {
    this._audio?.play('enemy_fire', { kind: 'sniper' });
    const base = norm(player.x - sn.x, player.y - sn.y);
    const bulletSpd = sn.spd * BULLET_SPD_SCALE * this.bulletSpeedMult();
    this.bullets.push({
      x: sn.x, y: sn.y,
      vx: base.x * bulletSpd, vy: base.y * bulletSpd,
      r: ENEMY.sniper.bulletR, life: 200, kind: 'orange',
    });
  }

  fireMine(m) {
    this._audio?.play('enemy_fire', { kind: 'mine' });
    const bulletSpd = 3.9 * BULLET_SPD_SCALE * this.bulletSpeedMult();
    const burst = ENEMY.mine.burst;
    for (let i = 0; i < burst; i++) {
      const ang = m.spin + (Math.PI * 2 * i) / burst;
      this.bullets.push({
        x: m.x, y: m.y,
        vx: Math.cos(ang) * bulletSpd,
        vy: Math.sin(ang) * bulletSpd,
        r: ENEMY.mine.bulletR, life: 140, kind: 'amber',
      });
    }
  }

  checkCollisions(player, fx) {
    const h = player.hit;

    if (!player.invuln()) {
      for (const b of this.bullets) {
        if (b.frozen) continue;
        if (distPt(player.x, player.y, b.x, b.y) < h.r + b.r) return { dead: true };
      }
      for (const c of this.chasers) {
        if (c.hp <= 0 || c.frozen) continue;
        if (distPt(player.x, player.y, c.x, c.y) < h.r + c.r) return { dead: true };
      }
    }

    return { dead: false };
  }

  cullPerfect(player, fx) {
    if (!player.inPerfectWindow()) return;

    const lethalIn = P.perfectLethalFrames;
    let weaved = false;
    const triggerWeave = () => {
      if (weaved) return;
      player.perfectWeave();
      fx.perfect(player.x, player.y);
      weaved = true;
    };

    for (const b of this.bullets) {
      const t = framesUntilBulletHit(b, player, lethalIn);
      if (t === null) continue;
      b.life = 0;
      fx.pop(b.x, b.y);
      triggerWeave();
    }

    for (const e of this.allEnemies()) {
      const ref = e.ref;
      if (ref.hp <= 0 || ref.frozen) continue;
      if (player.weaveHit.has(ref)) continue;
      const t = framesUntilEnemyWeaveHit(e, player, lethalIn);
      if (t === null) continue;

      player.weaveHit.add(ref);
      if (TOUCH_LETHAL_ENEMIES.has(e.type)) {
        const kx = e.x;
        const ky = e.y;
        ref.hp = 0;
        this.removeEnemy(e.type, ref);
        fx.killFrameAt(kx, ky);
      } else {
        ref.hp -= ref.maxHp * PERFECT_WEAVE_DMG * this.weaveDamageMult();
        fx.quickHit(e.x, e.y);
        if (ref.hp <= 0) this.removeEnemy(e.type, ref);
      }
      triggerWeave();
    }

    this.bullets = this.bullets.filter(b => b.life > 0);
  }

  enemiesLeft() {
    return this.enemyCount();
  }

  staggerEnemyTimers(frames = SECTOR_LOAD_STAGGER) {
    const bump = (e) => {
      if (e.hp > 0) e.timer = Math.max(e.timer, frames);
    };
    for (const t of this.turrets) bump(t);
    for (const s of this.sprayers) bump(s);
    for (const o of this.orbiters) bump(o);
    for (const sn of this.snipers) bump(sn);
    for (const m of this.mines) bump(m);
  }

  levelName() {
    if (this.modifier === 'endless') {
      return `WAVE ${this.endlessWave}`;
    }
    return LEVELS[this.levelIdx]?.name || `SECTOR ${this.levelIdx + 1}`;
  }
}

const LEVELS = [
  { name: 'DRIFT', turrets: [[0.5, 0.25, 1, 3.0, 0]] },
  { name: 'CROSSFIRE', turrets: [[0.2, 0.5, 1, 3.5, 0], [0.8, 0.5, 1, 3.5, 0]] },
  { name: 'SPIRAL', turrets: [[0.5, 0.5, 2, 3.2, 0.28]] },
  { name: 'HUNT', turrets: [[0.5, 0.2, 1, 3.8, 0.2]], chasers: [[0.5, 0.85, 1.4]] },
  { name: 'BURST', turrets: [[0.15, 0.3, 1, 4, 0], [0.85, 0.3, 1, 4, 0]], sprayers: [[0.5, 0.75, 4.2]] },
  { name: 'ORBIT', turrets: [[0.5, 0.5, 1, 3.5, 0]], orbiters: [[0.25, 0.3, 46, 0.02, 3.4], [0.75, 0.7, 42, 0.018, 3.4]] },
  { name: 'SNIPER', snipers: [[0.2, 0.35], [0.8, 0.35]], sprayers: [[0.5, 0.78, 4.5]] },
  { name: 'MINES', mines: [[0.3, 0.55], [0.7, 0.55]], chasers: [[0.5, 0.18, 1.7]] },
  {
    name: 'CHAOS',
    turrets: [[0.15, 0.25, 1, 4, 0], [0.85, 0.25, 1, 4, 0]],
    sprayers: [[0.5, 0.82, 4.6]],
    orbiters: [[0.22, 0.68, 38, 0.02, 3.5]],
    mines: [[0.5, 0.42]],
  },
  {
    name: 'RUPTURE',
    turrets: [[0.15, 0.25, 1, 4, 0.22], [0.85, 0.25, 1, 4, 0.22]],
    sprayers: [[0.5, 0.55, 4.6]],
    chasers: [[0.5, 0.15, 1.9]],
    orbiters: [[0.12, 0.72, 44, 0.019, 3.6]],
    snipers: [[0.88, 0.72]],
    mines: [[0.5, 0.38]],
  },
];

export { LEVELS };
