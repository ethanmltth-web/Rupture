import { W, H, ARENA, C, P } from './constants.js';
import { dashPreviewPoints } from './dashCurve.js';

const T = () => performance.now() * 0.001;

export class Render {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.25,
        a: Math.random() * 0.35 + 0.08,
        tw: Math.random() * Math.PI * 2,
        spd: Math.random() * 0.4 + 0.1,
      });
    }

    this._bgCache = document.createElement('canvas');
    this._bgCache.width = W;
    this._bgCache.height = H;
    this._bgCacheCtx = this._bgCache.getContext('2d');
    this._bgStaticReady = false;

    this._menuBuf = document.createElement('canvas');
    this._menuBuf.width = W;
    this._menuBuf.height = H;
    this._menuBufCtx = this._menuBuf.getContext('2d');
    this._menuBackdropReady = false;
    this._scanPattern = null;
  }

  draw(state) {
    const {
      player, world, fx, abilities, robotMode, countdown,
      countdownT = 0,
      steer = { x: 0, y: 0 },
    } = state;
    const lockon = abilities?.lockon ?? null;
    const quickshot = abilities?.quickshot ?? null;
    const extras = abilities?.renderExtras?.() ?? {};
    const styleBullets = extras.quickshot?.bullets ?? extras.playerBullets ?? [];
    const pulses = extras.pulses ?? [];
    const blasts = extras.blasts ?? [];
    const flashes = extras.flashes ?? [];
    const trailNodes = extras.trailNodes ?? [];
    const jamBursts = extras.jamBursts ?? [];
    const stasis = extras.stasis ?? null;
    const railBeams = extras.railBeams ?? [];
    const ctx = this.ctx;
    const shake = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake * 0.8 : 0;

    ctx.save();
    ctx.translate(shake, shake);

    this.bg(ctx);
    this.arena(ctx);

    for (const t of world.turrets) {
      if (t.hp <= 0) continue;
      this.shadow(ctx, t.x, t.y, 14);
      if (t.elite) this.eliteRing(ctx, t.x, t.y, 16);
      this.turret(ctx, t);
      this.healthBar(ctx, t.x, t.y - 26, t.hp, t.maxHp);
    }
    for (const s of world.sprayers) {
      if (s.hp <= 0) continue;
      this.shadow(ctx, s.x, s.y, s.boss ? 18 : 13);
      if (s.elite || s.boss) this.eliteRing(ctx, s.x, s.y, s.boss ? 24 : 18);
      this.sprayer(ctx, s);
      this.healthBar(ctx, s.x, s.y - (s.boss ? 32 : 26), s.hp, s.maxHp, s.boss ? 44 : 32, C.sprayerVein);
    }
    for (const c of world.chasers) {
      if (c.hp <= 0) continue;
      this.shadow(ctx, c.x, c.y, c.r);
      if (c.elite) this.eliteRing(ctx, c.x, c.y, c.r + 6);
      this.chaser(ctx, c);
      this.healthBar(ctx, c.x, c.y - c.r - 16, c.hp, c.maxHp);
    }
    for (const o of world.orbiters) {
      if (o.hp <= 0) continue;
      this.shadow(ctx, o.x, o.y, 14);
      if (o.elite) this.eliteRing(ctx, o.x, o.y, 18);
      this.orbiter(ctx, o);
      this.healthBar(ctx, o.x, o.y - 24, o.hp, o.maxHp, 28, C.orbiterRing);
    }
    for (const sn of world.snipers) {
      if (sn.hp <= 0) continue;
      this.shadow(ctx, sn.x, sn.y, 13);
      if (sn.elite) this.eliteRing(ctx, sn.x, sn.y, 16);
      this.sniper(ctx, sn);
      this.healthBar(ctx, sn.x, sn.y - 24, sn.hp, sn.maxHp);
    }
    for (const m of world.mines) {
      if (m.hp <= 0) continue;
      this.shadow(ctx, m.x, m.y, 14);
      if (m.elite) this.eliteRing(ctx, m.x, m.y, 16);
      this.mine(ctx, m);
      this.healthBar(ctx, m.x, m.y - 24, m.hp, m.maxHp, 30, C.mineSpike);
    }

    for (const b of world.bullets) this.bullet(ctx, b);
    if (quickshot) {
      for (const b of quickshot.bullets) this.playerBullet(ctx, b);
    }
    for (const b of styleBullets) this.playerBullet(ctx, b);

    for (const p of pulses) this.stylePulse(ctx, p, '#ff8040');
    for (const b of blasts) this.styleLineBlast(ctx, b, '#ff8040');
    for (const f of flashes) this.stylePulse(ctx, f, '#e8f4ff');
    for (const n of trailNodes) this.styleTrailNode(ctx, n);
    for (const j of jamBursts) this.styleJamCone(ctx, j);
    if (stasis?.active) {
      this.stasisField(ctx, player, stasis);
      for (const fr of stasis.frozen) {
        if (!fr.ref) continue;
        ctx.save();
        ctx.strokeStyle = 'rgba(144, 128, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fr.ref.x, fr.ref.y, (fr.ref.r || 12) + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const beam of railBeams) this.styleLineBlast(ctx, beam, '#ff3c50');

    for (const beam of fx.beams) {
      const g = ctx.createLinearGradient(beam.x1, beam.y1, beam.x2, beam.y2);
      g.addColorStop(0, '#fff8c0');
      g.addColorStop(0.5, C.lockYellow);
      g.addColorStop(1, '#ff9500');
      ctx.strokeStyle = g;
      ctx.globalAlpha = beam.life / 10;
      ctx.lineWidth = 4;
      ctx.shadowColor = C.lockYellow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    this.player(ctx, player, state.steer);

    const ch = abilities?.crosshairPos?.();
    if (ch) this.crosshair(ctx, ch.x, ch.y, 0.85 + ch.t * 0.15);

    this.drawFx(ctx, fx);
    this.drawKillFrames(ctx, fx);

    if (countdown) {
      const pulse = 0.5 + 0.5 * Math.sin(countdownT * Math.PI * 2);
      const a = 0.18 + pulse * 0.22;
      ctx.fillStyle = `rgba(8, 8, 12, ${a})`;
      ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    }

    const ts = state.timeScale ?? 1;
    if (ts < 0.98) {
      const slow = 1 - ts;
      ctx.fillStyle = `rgba(94, 207, 255, ${slow * 0.06})`;
      ctx.fillRect(0, 0, W, H);
    }

    this.vignette(ctx);
    this.cyberOverlay(ctx);

    ctx.restore();
  }

  drawFx(ctx, fx) {
    for (const p of fx.parts) {
      const life = p.life / p.max;
      ctx.globalAlpha = life;
      if (p.spark) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.sz * 0.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.glow ? 6 : 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * (0.6 + life * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;

    for (const r of fx.rings) {
      const maxLife = r.maxLife || 14;
      const alpha = (r.life / maxLife) * (r.stomp ? 0.95 : 0.75);
      ctx.strokeStyle = r.color || C.perfect;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = r.stomp ? (r.inner ? 2.5 : 3.5) : 2;
      if (r.stomp || r.glow) {
        ctx.shadowColor = r.color || C.fxStomp;
        ctx.shadowBlur = r.inner ? 6 : 14;
      }
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      if (!r.inner && r.stomp) {
        ctx.globalAlpha = alpha * 0.15;
        ctx.fillStyle = r.color || C.fxStomp;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    for (const s of fx.stomps) {
      const t = s.life / s.maxLife;
      ctx.strokeStyle = C.fxStomp;
      ctx.globalAlpha = t * 0.65;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.perfect;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = C.perfect;
      ctx.globalAlpha = t * 0.1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const t of fx.texts) {
      const life = t.life / (t.maxLife || 35);
      ctx.font = `bold ${t.size || 12}px "Orbitron", "JetBrains Mono", Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = life;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = t.glow ? 10 : 0;
      if (t.stroke) {
        ctx.strokeStyle = t.stroke;
        ctx.lineWidth = 3;
        ctx.strokeText(t.t, t.x, t.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.t, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    if (fx.flash > 0 && fx.killFrames <= 0) {
      const flashCol = fx.flashColor || C.perfect;
      ctx.fillStyle = flashCol;
      ctx.globalAlpha = fx.flash / 8 * 0.14;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  drawKillFrames(ctx, fx) {
    if (fx.killFrames <= 0 || !fx.killFrameMax) return;

    const progress = (fx.killFrameMax - fx.killFrames) / fx.killFrameMax;
    const fade = 1 - progress * progress;
    const kx = fx.killX;
    const ky = fx.killY;

    ctx.save();

    const starR = 24 + progress * 140;
    const vg = ctx.createRadialGradient(kx, ky, 0, kx, ky, starR);
    vg.addColorStop(0, `rgba(255,255,255,${fade * 0.9})`);
    vg.addColorStop(0.35, `rgba(255,255,255,${fade * 0.35})`);
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = fade * 0.45;
    const spread = 30 + progress * 110;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      ctx.beginPath();
      ctx.moveTo(kx + Math.cos(a) * 8, ky + Math.sin(a) * 8);
      ctx.lineTo(kx + Math.cos(a) * spread, ky + Math.sin(a) * spread);
      ctx.stroke();
    }

    if (progress > 0.55) {
      const strobe = Math.floor(progress * 8) % 2;
      ctx.fillStyle = strobe ? '#fff' : '#000';
      ctx.globalAlpha = fade * 0.5;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  drawMenuBackdrop(ctx) {
    if (!this._menuBackdropReady) this.prepareMenuBackdrop();
    ctx.drawImage(this._menuBuf, 0, 0);
    this.cyberOverlay(ctx, { strength: 0.42 });
  }

  prepareMenuBackdrop() {
    const mc = this._menuBufCtx;
    this.bg(mc);
    this.arena(mc);

    const g = mc.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 540);
    g.addColorStop(0, 'rgba(8, 10, 24, 0.08)');
    g.addColorStop(0.5, 'rgba(4, 4, 14, 0.52)');
    g.addColorStop(1, 'rgba(2, 2, 8, 0.92)');
    mc.fillStyle = g;
    mc.fillRect(0, 0, W, H);

    this.vignette(mc, 0.72);
    this._menuBackdropReady = true;
  }

  invalidateMenuBackdrop() {
    this._menuBackdropReady = false;
  }

  _ensureScanPattern(ctx) {
    if (this._scanPattern) return;
    const tile = document.createElement('canvas');
    tile.width = 2;
    tile.height = 4;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = 'rgba(255, 48, 72, 0.14)';
    tctx.fillRect(0, 0, 2, 2);
    this._scanPattern = ctx.createPattern(tile, 'repeat');
  }

  cyberOverlay(ctx, { strength = 0.38 } = {}) {
    const t = T();
    this._ensureScanPattern(ctx);

    ctx.save();
    ctx.globalAlpha = 0.32 * strength;
    ctx.fillStyle = this._scanPattern;
    ctx.fillRect(0, 0, W, H);

    const scanY = (t * 42) % (H + 60) - 30;
    const sg = ctx.createLinearGradient(0, scanY - 24, 0, scanY + 24);
    sg.addColorStop(0, 'rgba(255, 48, 72, 0)');
    sg.addColorStop(0.5, `rgba(255, 80, 96, ${0.09 * strength})`);
    sg.addColorStop(1, 'rgba(255, 48, 72, 0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  vignette(ctx, strength = 1) {
    const a = ARENA;
    const vg = ctx.createRadialGradient(
      a.x + a.w / 2, a.y + a.h / 2, a.w * 0.18,
      a.x + a.w / 2, a.y + a.h / 2, a.w * 0.78,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.55, `rgba(8, 2, 4, ${0.22 * strength})`);
    vg.addColorStop(0.85, `rgba(12, 0, 4, ${0.38 * strength})`);
    vg.addColorStop(1, `rgba(4, 0, 2, ${0.62 * strength})`);
    ctx.fillStyle = vg;
    ctx.fillRect(a.x, a.y, a.w, a.h);

    const edge = ctx.createLinearGradient(a.x, a.y, a.x, a.y + 40);
    edge.addColorStop(0, `rgba(255, 48, 72, ${0.04 * strength})`);
    edge.addColorStop(1, 'rgba(255, 48, 72, 0)');
    ctx.fillStyle = edge;
    ctx.fillRect(a.x, a.y, a.w, 40);
  }

  drawEnemyPreview(ctx, type, cx, cy) {
    switch (type) {
      case 'turret':
        this.shadow(ctx, cx, cy, 14);
        this.turret(ctx, { x: cx, y: cy, telegraph: 0 });
        break;
      case 'sprayer':
        this.shadow(ctx, cx, cy, 13);
        this.sprayer(ctx, { x: cx, y: cy });
        break;
      case 'chaser':
        this.shadow(ctx, cx, cy, 14);
        this.chaser(ctx, { x: cx, y: cy, r: 14 });
        break;
      case 'orbiter':
        this.shadow(ctx, cx, cy, 12);
        this.orbiter(ctx, {
          x: cx, y: cy, homeX: cx, homeY: cy + 18, orbitR: 26,
        });
        break;
      case 'sniper':
        this.shadow(ctx, cx, cy, 13);
        this.sniper(ctx, { x: cx, y: cy, telegraph: 0 });
        break;
      case 'mine':
        this.shadow(ctx, cx, cy, 14);
        this.mine(ctx, { x: cx, y: cy, spin: T() * 2.2, timer: 30 });
        break;
      default:
        break;
    }
  }

  _buildBgStatic() {
    const ctx = this._bgCacheCtx;
    const g = ctx.createRadialGradient(W / 2, H / 2 - 40, 40, W / 2, H / 2, 580);
    g.addColorStop(0, '#101028');
    g.addColorStop(0.4, '#080818');
    g.addColorStop(1, C.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 48, 72, 0.022)';
    ctx.lineWidth = 1;
    const hex = 48;
    for (let row = -1; row < H / hex + 2; row++) {
      for (let col = -1; col < W / hex + 2; col++) {
        const ox = col * hex * 1.75 + (row % 2) * hex * 0.875;
        const oy = row * hex * 0.866;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = ox + Math.cos(a) * hex * 0.45;
          const py = oy + Math.sin(a) * hex * 0.45;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    const nebula = ctx.createRadialGradient(W * 0.72, H * 0.28, 0, W * 0.72, H * 0.28, 240);
    nebula.addColorStop(0, C.nebulaRed);
    nebula.addColorStop(1, 'rgba(255, 48, 72, 0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, W, H);

    const nebula2 = ctx.createRadialGradient(W * 0.22, H * 0.68, 0, W * 0.22, H * 0.68, 200);
    nebula2.addColorStop(0, C.nebulaCool);
    nebula2.addColorStop(1, 'rgba(94, 207, 255, 0)');
    ctx.fillStyle = nebula2;
    ctx.fillRect(0, 0, W, H);

    const nebula3 = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, 320);
    nebula3.addColorStop(0, 'rgba(255, 32, 48, 0.04)');
    nebula3.addColorStop(1, 'rgba(255, 32, 48, 0)');
    ctx.fillStyle = nebula3;
    ctx.fillRect(0, 0, W, H);

    this._bgStaticReady = true;
  }

  bg(ctx) {
    if (!this._bgStaticReady) this._buildBgStatic();
    ctx.drawImage(this._bgCache, 0, 0);

    const t = T();
    for (const s of this.stars) {
      const tw = s.a + Math.sin(t * s.spd * 3 + s.tw) * 0.14;
      ctx.globalAlpha = tw;
      const hue = s.r > 1 ? '#ffc8d0' : '#988088';
      ctx.fillStyle = hue;
      if (s.r > 1) {
        ctx.shadowColor = hue;
        ctx.shadowBlur = 2;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  arena(ctx) {
    const a = ARENA;
    const pulse = 0.82 + Math.sin(T() * 1.4) * 0.18;
    const t = T();

    ctx.fillStyle = C.arenaInner;
    ctx.fillRect(a.x, a.y, a.w, a.h);

    const fg = ctx.createRadialGradient(
      a.x + a.w / 2, a.y + a.h / 2, 20,
      a.x + a.w / 2, a.y + a.h / 2, a.w * 0.62,
    );
    fg.addColorStop(0, C.floorLight);
    fg.addColorStop(0.45, C.floor);
    fg.addColorStop(1, '#060610');
    ctx.fillStyle = fg;
    ctx.fillRect(a.x, a.y, a.w, a.h);

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let x = a.x; x <= a.x + a.w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); ctx.stroke();
    }
    for (let y = a.y; y <= a.y + a.h; y += 40) {
      ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); ctx.stroke();
    }

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = C.gridAccent;
    for (let x = a.x; x <= a.x + a.w; x += 80) {
      for (let y = a.y; y <= a.y + a.h; y += 80) {
        ctx.beginPath();
        ctx.moveTo(x + 18, y);
        ctx.lineTo(x + 42, y);
        ctx.moveTo(x, y + 18);
        ctx.lineTo(x, y + 42);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = C.arenaAccent;
    ctx.globalAlpha = 0.45 + Math.sin(t * 2.5) * 0.15;
    ctx.fillRect(a.x + 2, a.y + 2, a.w - 4, 2);
    ctx.fillRect(a.x + 2, a.y + a.h - 4, a.w - 4, 2);
    ctx.globalAlpha = 0.25 + Math.sin(t * 3 + 1) * 0.1;
    ctx.fillStyle = C.wallInner;
    ctx.fillRect(a.x + 2, a.y + 5, a.w - 4, 1);
    ctx.fillRect(a.x + 2, a.y + a.h - 6, a.w - 4, 1);
    ctx.globalAlpha = 1;

    for (let i = 0; i < 12; i++) {
      const px = a.x + 8 + i * ((a.w - 16) / 11);
      const tick = 0.4 + Math.sin(t * 4 + i * 0.7) * 0.3;
      ctx.fillStyle = `rgba(255, 48, 72, ${tick * 0.35})`;
      ctx.fillRect(px, a.y + 1, 2, 4);
      ctx.fillRect(px, a.y + a.h - 5, 2, 4);
    }

    this.cornerBracket(ctx, a.x, a.y, 1, 1);
    this.cornerBracket(ctx, a.x + a.w, a.y, -1, 1);
    this.cornerBracket(ctx, a.x, a.y + a.h, 1, -1);
    this.cornerBracket(ctx, a.x + a.w, a.y + a.h, -1, -1);

    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 2;
    ctx.shadowColor = C.wallGlow;
    ctx.shadowBlur = 14 * pulse;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = C.wallInner;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(a.x + 4, a.y + 4, a.w - 8, a.h - 8);
    ctx.globalAlpha = 1;
  }

  cornerBracket(ctx, x, y, sx, sy) {
    const len = 26;
    const pulse = 0.65 + Math.sin(T() * 3.2) * 0.35;
    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = C.wallGlow;
    ctx.shadowBlur = 8 * pulse;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * len, y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.wallInner;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.wall;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  shadow(ctx, x, y, r) {
    const sg = ctx.createRadialGradient(x, y + r * 0.5, 0, x, y + r * 0.55, r * 1.1);
    sg.addColorStop(0, 'rgba(0,0,0,0.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.55, r * 1.0, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  eliteRing(ctx, x, y, r = 18) {
    ctx.strokeStyle = '#ffd54a';
    ctx.globalAlpha = 0.5 + Math.sin(T() * 8) * 0.25;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd54a';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, r + 4 + Math.sin(T() * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  healthBar(ctx, x, y, hp, maxHp, w = 30, color = C.healthFg) {
    const pct = Math.max(0, hp / maxHp);
    const h = 5;
    const low = pct < 0.35;
    const barColor = low ? C.healthLow : color;

    ctx.fillStyle = C.healthBg;
    ctx.fillRect(x - w / 2 - 3, y - 3, w + 6, h + 6);

    ctx.strokeStyle = C.healthBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2 - 2, y - 2, w + 4, h + 4);

    ctx.fillStyle = '#000000aa';
    ctx.fillRect(x - w / 2, y, w, h);

    if (pct > 0) {
      const barGrad = ctx.createLinearGradient(x - w / 2, y, x - w / 2 + w * pct, y);
      barGrad.addColorStop(0, barColor);
      barGrad.addColorStop(0.6, barColor);
      barGrad.addColorStop(1, low ? '#ff80c0' : C.playerCoreBright);
      ctx.fillStyle = barGrad;
      ctx.shadowColor = barColor;
      ctx.shadowBlur = low ? 8 + Math.sin(T() * 14) * 4 : 4;
      ctx.fillRect(x - w / 2, y, w * pct, h);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff44';
      ctx.fillRect(x - w / 2, y, w * pct, 1);

      const segW = 6;
      ctx.fillStyle = '#00000055';
      for (let sx = x - w / 2 + segW; sx < x - w / 2 + w * pct; sx += segW) {
        ctx.fillRect(sx, y, 1, h);
      }
    }

    ctx.fillStyle = barColor;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x - w / 2 - 2, y + 1, 2, h - 2);
    ctx.fillRect(x + w / 2, y + 1, 2, h - 2);
    ctx.globalAlpha = 1;
  }

  crosshair(ctx, x, y, scale = 1) {
    const col = C.crosshair;
    const rOut = 26 * scale;
    const rIn = 15 * scale;
    const pulse = 0.82 + Math.sin(T() * 12) * 0.18;

    ctx.strokeStyle = `rgba(255, 48, 72, ${0.2 * pulse})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, rOut, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, rOut, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, rIn, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - rOut, y); ctx.lineTo(x + rOut, y);
    ctx.moveTo(x, y - rOut); ctx.lineTo(x, y + rOut);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const bar = 7 * scale, thick = 3 * scale, gap = rOut + 3 * scale;
    ctx.fillRect(x - thick / 2, y - gap - bar, thick, bar);
    ctx.fillRect(x - thick / 2, y + gap, thick, bar);
    ctx.fillRect(x - gap - bar, y - thick / 2, bar, thick);
    ctx.fillRect(x + gap, y - thick / 2, bar, thick);
  }

  turret(ctx, t) {
    const x = t.x, y = t.y;
    const pulse = Math.sin(T() * 4) * 0.15 + 0.85;

    if (t.telegraph) {
      ctx.strokeStyle = C.turretAccent;
      ctx.globalAlpha = 0.35 + Math.sin(T() * 22) * 0.3;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.turretAccent;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#1e1e2a';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.turretBase;
    this.roundRect(ctx, x - 14, y - 14, 28, 28, 5);
    ctx.fill();

    ctx.strokeStyle = C.turretAccent;
    ctx.lineWidth = 2;
    this.roundRect(ctx, x - 14, y - 14, 28, 28, 5);
    ctx.stroke();

    ctx.fillStyle = C.turretMetal;
    ctx.fillRect(x - 3, y - 18, 6, 8);

    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      ctx.fillStyle = C.turretMetal;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a5a70';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const eyeR = 7.5 * (t.telegraph ? 1.2 : 1);
    const eg = ctx.createRadialGradient(x, y, 0, x, y, eyeR);
    eg.addColorStop(0, t.telegraph ? '#fff' : C.turretEyeHot);
    eg.addColorStop(0.6, t.telegraph ? C.turretAccent : C.turretEye);
    eg.addColorStop(1, '#880020');
    ctx.fillStyle = eg;
    ctx.shadowColor = C.turretAccent;
    ctx.shadowBlur = t.telegraph ? 20 : 10;
    ctx.beginPath();
    ctx.arc(x, y, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = t.telegraph ? '#fff' : '#ffcccc';
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, eyeR * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = C.turretMetal;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + T() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      ctx.lineTo(x + Math.cos(a) * (15 + pulse * 2.5), y + Math.sin(a) * (15 + pulse * 2.5));
      ctx.stroke();
    }
  }

  sprayer(ctx, s) {
    const x = s.x, y = s.y;
    const scale = s.boss ? 1.45 : 1;
    const pulse = Math.sin(T() * 6) * 0.2 + 0.8;

    if (s.telegraph) {
      ctx.strokeStyle = C.sprayerVein;
      ctx.globalAlpha = 0.45 + Math.sin(T() * 20) * 0.25;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = C.sprayerBody;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * 13 * scale;
      const py = y + Math.sin(a) * 13 * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 / 3) * i + T() * 0.8;
      const px = x + Math.cos(a) * 10 * scale;
      const py = y + Math.sin(a) * 10 * scale;
      ctx.fillStyle = C.sprayerPod;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.sprayerVein;
      ctx.globalAlpha = 0.5 + pulse * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = s.telegraph ? '#b8ffd0' : C.sprayerCore;
    ctx.shadowColor = C.sprayerVein;
    ctx.shadowBlur = s.telegraph ? 18 + pulse * 8 : 10 + pulse * 6;
    ctx.beginPath();
    ctx.arc(x, y, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (s.boss) {
      ctx.font = '600 9px Orbitron, sans-serif';
      ctx.fillStyle = '#ffd54a';
      ctx.textAlign = 'center';
      ctx.fillText('CORE', x, y - 22 * scale);
    }

    ctx.strokeStyle = C.sprayerVein;
    ctx.globalAlpha = 0.25 + pulse * 0.15;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, (16 + pulse * 3) * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  chaser(ctx, c) {
    const x = c.x, y = c.y, r = c.r;
    const spin = T() * 9;
    const danger = 0.5 + Math.sin(T() * 6) * 0.2;

    ctx.strokeStyle = C.chaserCore;
    ctx.globalAlpha = 0.15 * danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      const bg = ctx.createLinearGradient(0, -r * 1.2, 0, r * 0.2);
      bg.addColorStop(0, '#ff6090');
      bg.addColorStop(1, C.chaserBlade);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15);
      ctx.lineTo(r * 0.38, -r * 0.15);
      ctx.lineTo(0, r * 0.2);
      ctx.lineTo(-r * 0.38, -r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff90b0';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = C.chaserBody;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.75);
    ctx.lineTo(x + r * 0.7, y + r * 0.5);
    ctx.lineTo(x, y + r * 0.28);
    ctx.lineTo(x - r * 0.7, y + r * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = C.chaserCore;
    ctx.shadowColor = C.chaserCore;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff55';
    ctx.beginPath();
    ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  orbiter(ctx, o) {
    const x = o.x, y = o.y;
    const hx = o.homeX ?? x;
    const hy = o.homeY ?? y;
    const orbitR = o.orbitR ?? 44;
    const pulse = Math.sin(T() * 5) * 0.15 + 0.85;
    const spin = T() * 2.2;

    if (o.telegraph) {
      ctx.strokeStyle = C.orbiterRing;
      ctx.globalAlpha = 0.4 + Math.sin(T() * 18) * 0.3;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.orbiterRing;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = C.orbiterRing;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.22;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.arc(hx, hy, orbitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, orbitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const ag = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10);
    ag.addColorStop(0, '#3a3860');
    ag.addColorStop(1, '#1a1830');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(hx, hy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.orbiterRing;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.orbiterCore;
    ctx.shadowColor = C.orbiterRing;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(144, 128, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    ctx.fillStyle = '#1e1c38';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.orbiterBody;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = Math.cos(a) * 11;
      const py = Math.sin(a) * 9;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.orbiterRing;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let side = -1; side <= 1; side += 2) {
      ctx.fillStyle = '#2a2848';
      ctx.fillRect(side * 8 - 2, -3, 5, 6);
      ctx.fillStyle = C.orbiterCore;
      ctx.shadowColor = C.orbiterRing;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(side * 10, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    const cg = ctx.createRadialGradient(x, y, 0, x, y, 7);
    cg.addColorStop(0, '#fff');
    cg.addColorStop(0.4, C.orbiterCore);
    cg.addColorStop(1, C.orbiterRing);
    ctx.fillStyle = cg;
    ctx.shadowColor = C.orbiterRing;
    ctx.shadowBlur = 10 + pulse * 5;
    ctx.beginPath();
    ctx.arc(x, y, 5.5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  sniper(ctx, sn) {
    const x = sn.x, y = sn.y;
    const aim = sn.telegraph ? Math.sin(T() * 24) * 0.04 : 0;

    if (sn.telegraph) {
      ctx.strokeStyle = C.sniperLens;
      ctx.globalAlpha = 0.5 + Math.sin(T() * 22) * 0.35;
      ctx.lineWidth = 3;
      ctx.shadowColor = C.sniperLens;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      const beamLen = 140;
      const grad = ctx.createLinearGradient(x - beamLen, y, x + beamLen, y);
      grad.addColorStop(0, 'rgba(255, 96, 64, 0)');
      grad.addColorStop(0.45, 'rgba(255, 96, 64, 0.15)');
      grad.addColorStop(0.5, 'rgba(255, 180, 140, 0.55)');
      grad.addColorStop(0.55, 'rgba(255, 96, 64, 0.15)');
      grad.addColorStop(1, 'rgba(255, 96, 64, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2 + Math.sin(T() * 30) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - beamLen, y + aim * 20);
      ctx.lineTo(x + beamLen, y - aim * 20);
      ctx.stroke();
    }

    ctx.fillStyle = '#0e0e16';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.55;
      ctx.strokeStyle = '#3a3a50';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 4, y + 4);
      ctx.lineTo(x + Math.cos(a) * 14, y + 12 + Math.sin(a) * 4);
      ctx.stroke();
    }

    ctx.fillStyle = C.sniperBody;
    this.roundRect(ctx, x - 13, y - 11, 26, 22, 4);
    ctx.fill();
    ctx.strokeStyle = '#3a3a52';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, x - 13, y - 11, 26, 22, 4);
    ctx.stroke();

    ctx.fillStyle = '#252538';
    this.roundRect(ctx, x - 5, y - 14, 10, 6, 2);
    ctx.fill();
    ctx.fillStyle = C.sniperLens;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x - 3, y - 12, 6, 2);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(x - 26, y - 1, 52, 7);
    ctx.fillStyle = C.sniperRail;
    ctx.fillRect(x - 24, y, 48, 5);
    ctx.fillStyle = '#484860';
    ctx.fillRect(x - 22, y + 1, 44, 1.5);

    const barrelGrad = ctx.createLinearGradient(x - 20, y, x + 28, y);
    barrelGrad.addColorStop(0, '#3a3a50');
    barrelGrad.addColorStop(0.5, '#5a5a70');
    barrelGrad.addColorStop(1, '#2a2a38');
    ctx.fillStyle = barrelGrad;
    ctx.fillRect(x + 8, y - 2, 22, 5);
    ctx.fillStyle = '#1a1a28';
    ctx.fillRect(x + 28, y - 1, 4, 3);

    const lensR = sn.telegraph ? 6 : 5;
    const lx = x + 12;
    const lg = ctx.createRadialGradient(lx, y, 0, lx, y, lensR);
    lg.addColorStop(0, sn.telegraph ? '#fff' : '#ffccaa');
    lg.addColorStop(0.45, C.sniperLens);
    lg.addColorStop(1, '#601808');
    ctx.fillStyle = lg;
    ctx.shadowColor = C.sniperLens;
    ctx.shadowBlur = sn.telegraph ? 22 : 10;
    ctx.beginPath();
    ctx.arc(lx, y, lensR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffffaa';
    ctx.beginPath();
    ctx.arc(lx - 1.5, y - 1.5, lensR * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  mine(ctx, m) {
    const x = m.x, y = m.y;
    const pulse = Math.sin(T() * 7 + m.spin) * 0.2 + 0.8;
    const primed = m.telegraph || m.timer <= 14;

    if (m.telegraph) {
      ctx.strokeStyle = C.mineSpike;
      ctx.globalAlpha = 0.5 + Math.sin(T() * 16) * 0.3;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.mineCore;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (primed) {
      ctx.strokeStyle = C.mineCore;
      ctx.globalAlpha = 0.2 + pulse * 0.15;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 20 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.ellipse(x, y + 9, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.mineBody;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = m.spin * 0.3 + (Math.PI * 2 * i) / 6;
      const r = 11;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const a = m.spin + (Math.PI * 2 * i) / 6;
      const ext = primed ? 18 + pulse * 3 : 14;
      const col = primed ? C.mineCore : C.mineSpike;
      ctx.strokeStyle = col;
      ctx.lineWidth = primed ? 2.5 : 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = primed ? 0.95 : 0.6;
      ctx.shadowColor = col;
      ctx.shadowBlur = primed ? 8 : 0;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
      ctx.lineTo(x + Math.cos(a) * ext, y + Math.sin(a) * ext);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * ext, y + Math.sin(a) * ext, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    const mg = ctx.createRadialGradient(x, y, 0, x, y, 8);
    mg.addColorStop(0, primed ? '#fff8d0' : C.mineCore);
    mg.addColorStop(0.5, primed ? C.mineCore : C.mineSpike);
    mg.addColorStop(1, '#804010');
    ctx.fillStyle = mg;
    ctx.shadowColor = C.mineCore;
    ctx.shadowBlur = primed ? 16 : 6;
    ctx.beginPath();
    ctx.arc(x, y, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (primed) {
      ctx.strokeStyle = '#ffffff55';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const a = m.spin * 2 + i * 2.1;
        ctx.beginPath();
        ctx.arc(x, y, 9 + i * 3, a, a + 0.8);
        ctx.stroke();
      }
    }
  }

  bullet(ctx, b) {
    if (b.frozen) {
      ctx.save();
      ctx.globalAlpha = 0.55;
    }
    let col = C.bullet;
    let core = C.bulletCore;
    let glow = C.bulletGlow;
    if (b.kind === 'green') {
      col = C.greenBullet;
      core = C.greenBulletCore;
      glow = C.greenGlow;
    } else if (b.kind === 'purple') {
      col = C.orbiterRing;
      core = C.orbiterCore;
      glow = '#9080ff44';
    } else if (b.kind === 'orange') {
      col = C.sniperLens;
      core = '#ffaa80';
      glow = '#ff604044';
    } else if (b.kind === 'amber') {
      col = C.mineSpike;
      core = C.mineCore;
      glow = '#ff904044';
    }

    const spd = Math.hypot(b.vx, b.vy) || 1;
    const tx = b.x - (b.vx / spd) * (b.r + 10);
    const ty = b.y - (b.vy / spd) * (b.r + 10);

    const trail = ctx.createLinearGradient(tx, ty, b.x, b.y);
    trail.addColorStop(0, 'rgba(0,0,0,0)');
    trail.addColorStop(0.4, glow);
    trail.addColorStop(1, col);
    ctx.strokeStyle = trail;
    ctx.lineWidth = b.r * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    if (b.frozen) ctx.restore();
  }

  playerBullet(ctx, b) {
    const spd = Math.hypot(b.vx, b.vy) || 1;
    const tx = b.x - (b.vx / spd) * 8;
    const ty = b.y - (b.vy / spd) * 8;
    const trail = ctx.createLinearGradient(tx, ty, b.x, b.y);
    trail.addColorStop(0, 'rgba(94, 207, 255, 0)');
    trail.addColorStop(0.5, C.playerDashTrail);
    trail.addColorStop(1, C.playerShot);
    ctx.strokeStyle = trail;
    ctx.lineWidth = b.r * 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = C.playerShot;
    ctx.shadowColor = C.playerShot;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.playerShotCore;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  dashTrajectory(ctx, p, steer) {
    const pts = dashPreviewPoints(p, steer, P.dashSpd);
    if (!pts || pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = C.perfect;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.72;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = C.perfect;
    ctx.shadowBlur = 6;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = C.playerCoreBright;
    ctx.globalAlpha = 0.85;
    const end = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = C.perfect;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  player(ctx, p, steer = { x: 0, y: 0 }) {
    if (!p.alive) return;

    const x = p.x, y = p.y;
    const dir = p.dashing ? p.dashDir : p.lastDir;
    const ang = Math.atan2(dir.y, dir.x);
    const spd = Math.hypot(p.vx, p.vy);
    const bob = spd > 0.5 ? Math.sin(T() * 14) * 1.5 : 0;
    const corePulse = 0.85 + Math.sin(T() * 9) * 0.15;

    if (p.dashing) {
      this.dashTrajectory(ctx, p, steer);
      for (let i = 1; i <= 3; i++) {
        const t = i * 0.22;
        ctx.save();
        ctx.globalAlpha = 0.12 / i;
        ctx.fillStyle = C.perfect;
        ctx.beginPath();
        ctx.arc(x - dir.x * i * 7, y - dir.y * i * 7, 10 - i, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (p.dashing) {
      const dg = ctx.createRadialGradient(x, y, 0, x, y, 22);
      dg.addColorStop(0, 'rgba(94, 207, 255, 0.24)');
      dg.addColorStop(0.5, 'rgba(255, 48, 72, 0.06)');
      dg.addColorStop(1, 'rgba(94, 207, 255, 0)');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.dashing && p.dashFrame <= P.perfectWindow) {
      ctx.strokeStyle = C.perfect;
      ctx.globalAlpha = 0.55 + Math.sin(T() * 24) * 0.2;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = C.perfect;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else if (p.dashCD <= 0 && !p.dashing) {
      ctx.strokeStyle = C.perfect;
      ctx.globalAlpha = 0.18 + Math.sin(T() * 4) * 0.1;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (spd > 3 && !p.dashing) {
      ctx.fillStyle = C.playerDashTrail;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x - p.vx * 0.8, y - p.vy * 0.8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.shadow(ctx, x, y + bob, 12);

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(ang);

    ctx.strokeStyle = C.playerTrim;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 + Math.sin(T() * 8) * 0.15;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12.8, 11.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = C.playerBody;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11.5, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.playerSuit;
    ctx.beginPath();
    ctx.ellipse(-0.5, 0.5, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#252238';
    ctx.beginPath();
    ctx.ellipse(-5, 0, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.ellipse(5, 0, 3.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.playerHighlight;
    ctx.beginPath();
    ctx.ellipse(2, -4, 5, 3, 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.playerCore;
    ctx.shadowColor = C.playerCore;
    ctx.shadowBlur = 10 * corePulse;
    ctx.beginPath();
    ctx.arc(-1, 1.5, 4 * corePulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = C.playerCoreBright;
    ctx.beginPath();
    ctx.arc(-1, 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.playerVisor;
    ctx.beginPath();
    ctx.moveTo(3, -4);
    ctx.lineTo(10, -2);
    ctx.lineTo(10, 2);
    ctx.lineTo(3, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = C.playerCore;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(7, -1.2, 3, 2.4);
    ctx.globalAlpha = 0.35 + Math.sin(T() * 18) * 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, -0.5, 1.5, 1);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = C.playerSuit;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 7);
    ctx.lineTo(-2, 10);
    ctx.stroke();

    if (spd > 0.5 && !p.dashing) {
      const leg = Math.sin(T() * 16) * 3.5;
      ctx.strokeStyle = C.playerHighlight;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, 6); ctx.lineTo(-6 - leg * 0.25, 10 + leg);
      ctx.moveTo(4, 6); ctx.lineTo(6 + leg * 0.25, 10 - leg);
      ctx.stroke();
    }

    ctx.restore();
  }

  stylePulse(ctx, p, color) {
    const t = p.life / (p.maxLife || 14);
    ctx.save();
    ctx.globalAlpha = t * 0.75;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r || p.max || 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  styleLineBlast(ctx, b, color) {
    const t = b.life / (b.maxLife || 16);
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.restore();
  }

  styleTrailNode(ctx, n) {
    const t = n.life / (n.maxLife || 28);
    ctx.save();
    ctx.globalAlpha = t * 0.45;
    ctx.fillStyle = '#e8f4ff';
    ctx.shadowColor = '#5ecfff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(n.x, n.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  styleJamCone(ctx, j) {
    const t = j.life / (j.maxLife || 12);
    const range = 160;
    const half = Math.PI / 4;
    const ang = Math.atan2(j.dy, j.dx);
    ctx.save();
    ctx.globalAlpha = t * 0.35;
    ctx.fillStyle = '#9080ff';
    ctx.beginPath();
    ctx.moveTo(j.x, j.y);
    ctx.arc(j.x, j.y, range, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  stasisField(ctx, player, stasis) {
    const pulse = 0.82 + 0.18 * Math.sin(T() * 8);
    const r = stasis.radius * pulse;
    const alpha = 0.14 + (stasis.timer / stasis.durationMax) * 0.1;

    ctx.save();
    ctx.strokeStyle = `rgba(144, 128, 255, ${0.5 + pulse * 0.2})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#9080ff';
    ctx.shadowBlur = 12;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    const g = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, r);
    g.addColorStop(0, `rgba(180, 160, 255, ${alpha})`);
    g.addColorStop(0.6, `rgba(120, 100, 220, ${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(80, 60, 180, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
