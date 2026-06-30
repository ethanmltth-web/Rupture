import { CHALLENGES, CHALLENGE_BY_ID } from './challenges.js';
import { ACHIEVEMENTS } from './achievements.js';
import { gradeSector, gradeRank } from './grades.js';
import { getDailyChallenge, isDailyComplete, dailyRewardWC } from './daily-challenge.js';
import { STYLES, STYLE_IDS } from './styles.js';
import { MODIFIERS } from './modifiers.js';
import {
  WC_PER_PERFECT_WEAVE, WC_CHALLENGE_MIN, WC_CHALLENGE_MAX,
} from './constants.js';

function rewardLabel(reward) {
  if (!reward) return 'Reward';
  switch (reward.kind) {
    case 'style':
      return STYLES[reward.id]?.name ?? reward.id;
    case 'sector':
      return `Sector ${reward.id}`;
    case 'modifier':
      return MODIFIERS[reward.id]?.name ?? reward.id;
    case 'credits':
    case 'wc':
      return `${reward.amount} WC`;
    default:
      return 'Unlock';
  }
}

export class ChallengeTracker {
  constructor(profile, audio = null, onUnlock = null, onWcChange = null) {
    this.profile = profile;
    this.audio = audio;
    this.onUnlock = onUnlock;
    this.onWcChange = onWcChange;
    this.pendingUnlocks = [];
    this.run = {
      perfects: 0,
      kills: 0,
      maxChain: 0,
      eliteKills: 0,
      clearedThisRun: false,
      styleId: null,
      ngPlus: false,
    };
    this.sector = {
      perfects: 0,
      dashes: 0,
      maxChain: 0,
      noDash: true,
    };
    this.lastClearResult = null;
  }

  beginRun(styleId, ngPlus = false) {
    this.run = {
      perfects: 0,
      kills: 0,
      maxChain: 0,
      eliteKills: 0,
      clearedThisRun: false,
      styleId,
      ngPlus,
    };
    this.sector = { perfects: 0, dashes: 0, maxChain: 0, noDash: true };
    this.pendingUnlocks = [];
    this.lastClearResult = null;
  }

  beginSector() {
    this.sector = { perfects: 0, dashes: 0, maxChain: 0, noDash: true };
  }

  onDash() {
    this.sector.noDash = false;
    this.sector.dashes++;
  }

  onPerfectWeave(chain) {
    this.run.perfects++;
    this.sector.perfects++;
    this.run.maxChain = Math.max(this.run.maxChain, chain);
    this.sector.maxChain = Math.max(this.sector.maxChain, chain);

    this.profile.stats.lifetimePerfects = (this.profile.stats.lifetimePerfects || 0) + 1;
    this.profile.addCredits(WC_PER_PERFECT_WEAVE);
    this.onWcChange?.();

    this.checkCounterChallenge('perfect_10_run', this.run.perfects, 5);
    this.checkCounterChallenge('weave_5_sector', this.sector.perfects, 5);
    this.checkAchievements();
  }

  onKill(type, ref) {
    this.run.kills++;
    if (ref?.elite) {
      this.run.eliteKills++;
      this.profile.stats.eliteKills = (this.profile.stats.eliteKills || 0) + 1;
    }
    if (ref?.boss) {
      this.profile.stats.bossKills = (this.profile.stats.bossKills || 0) + 1;
    }
    const m = this.profile.masteryFor(this.run.styleId);
    m.kills++;
    this.checkAchievements();
  }

  onAbilityUse() {
    const m = this.profile.masteryFor(this.run.styleId);
    m.abilityUses++;
  }

  onDeath(world) {
    this.profile.stats.lifetimeDeaths++;
    if (world.isEndless()) {
      const wave = world.endlessCleared;
      this.profile.stats.bestEndlessWave = Math.max(
        this.profile.stats.bestEndlessWave,
        wave,
      );
      this.profile.setProgress('endless_wave_5', Math.max(
        this.profile.getProgress('endless_wave_5'),
        wave,
      ));
      this.checkEndlessWaveChallenge('endless_wave_5', wave, 5);
      this.checkDailyOnDeath(world);
    }
    this.profile.save();
    this.checkAchievements();
    return this.pendingUnlocks.slice();
  }

  onSectorClear(world, player) {
    const sectorNum = world.isEndless() ? null : world.levelIdx + 1;
    const timeFrames = Math.round(world.timer);
    const perfects = player.sectorPerfects;
    const dashes = player.sectorDashes;
    const grade = sectorNum ? gradeSector(sectorNum, { timeFrames, perfects, dashes }) : null;

    this.profile.stats.lifetimeClears++;
    this.run.clearedThisRun = true;

    let pbDelta = null;
    if (sectorNum) {
      if (world.modifier === 'classic') {
        this.profile.recordClassicSectorClear(sectorNum);
      } else {
        this.profile.unlockSector(Math.min(10, sectorNum + 1));
      }
      pbDelta = this.profile.recordSectorBest(sectorNum, { time: timeFrames, perfects, dashes, grade });
    }

    if (world.isEndless()) {
      const wave = world.endlessCleared + 1;
      this.profile.stats.bestEndlessWave = Math.max(this.profile.stats.bestEndlessWave, wave);
      this.profile.setProgress('endless_wave_5', Math.max(this.profile.getProgress('endless_wave_5'), wave));
      this.checkEndlessWaveChallenge('endless_wave_5', wave, 5);
    }

    const m = this.profile.masteryFor(this.run.styleId);
    m.clears++;
    if (sectorNum && sectorNum > m.bestSector) m.bestSector = sectorNum;

    if (sectorNum === 10 && (world.modifier === 'classic' || world.modifier === 'newgameplus')) {
      this.profile.campaignComplete = true;
      this.profile.newGamePlusUnlocked = true;
      this.profile.unlockModifier('newgameplus');
      this.completeChallenge('sector_10_clear');
    } else if (sectorNum) {
      const sectorChallengeId = `sector_${sectorNum}_clear`;
      if (CHALLENGE_BY_ID[sectorChallengeId]) this.completeChallenge(sectorChallengeId);
    }

    if (grade === 'S') this.completeChallenge('grade_s_any');

    this.completeChallenge('first_clear');
    this.checkAchievements({
      cleared: true,
      sectorNum,
      grade,
      perfects,
      dashes,
      maxChain: this.sector.maxChain,
      endlessWave: world.isEndless() ? world.endlessCleared + 1 : 0,
      endlessMutator: world.isEndless() && !!world.runMutator,
      styleId: this.run.styleId,
      ngPlus: this.run.ngPlus,
    });

    this.checkDaily({
      cleared: true,
      sectorNum,
      grade,
      perfects,
      dashes,
      maxChain: this.sector.maxChain,
      endlessWave: world.isEndless() ? world.endlessCleared + 1 : 0,
      styleId: this.run.styleId,
    });

    this.profile.save();
    this.lastClearResult = {
      sectorNum, grade, perfects, dashes, timeFrames, pbDelta,
    };

    return {
      unlocks: this.pendingUnlocks.slice(),
      grade,
      sectorNum,
      pbDelta,
      nextHint: this.getNextChallengeHint(sectorNum),
    };
  }

  checkCounterChallenge(id, current, target) {
    if (this.profile.isChallengeComplete(id)) return;
    if (current >= target) this.completeChallenge(id);
  }

  checkEndlessWaveChallenge(id, wave, target) {
    if (this.profile.isChallengeComplete(id)) return;
    if (wave >= target) this.completeChallenge(id);
  }

  completeChallenge(id) {
    if (this.profile.isChallengeComplete(id)) return;
    const def = CHALLENGE_BY_ID[id];
    if (!def) return;

    this.profile.completeChallenge(id);
    const rewardLabel = this.applyReward(def.reward);
    const wcAmt = challengeWcReward(def);
    if (wcAmt > 0) {
      this.profile.addCredits(wcAmt);
      this.onWcChange?.();
    }
    const parts = [rewardLabel, wcAmt > 0 ? `+${wcAmt} WC` : ''].filter(Boolean);
    const unlock = { kind: 'challenge', id, title: def.title, label: parts.join(' · ') };
    this.pendingUnlocks.push(unlock);
    this.audio?.play('unlock_fanfare');
    this.onUnlock?.(unlock);
  }

  applyReward(reward) {
    if (!reward) return '';
    switch (reward.kind) {
      case 'style':
        this.profile.ownStyle(reward.id);
        return STYLES[reward.id]?.name ?? reward.id;
      case 'sector':
        this.profile.unlockSector(reward.id);
        return `Sector ${reward.id}`;
      case 'modifier':
        this.profile.unlockModifier(reward.id);
        return MODIFIERS[reward.id]?.name ?? reward.id;
      case 'credits':
      case 'wc':
        this.profile.addCredits(reward.amount);
        this.onWcChange?.();
        return `+${reward.amount} WC`;
      default:
        return rewardLabel(reward);
    }
  }

  checkAchievements(ctx = {}) {
    const p = this.profile;
    const s = p.stats;
    const flags = {
      run_perfects_20: this.run.perfects >= 20,
      run_perfects_30: this.run.perfects >= 30,
      no_dash_clear: ctx.cleared && ctx.dashes === 0,
      chain_5: (ctx.maxChain ?? this.sector.maxChain) >= 5,
      chain_10: (ctx.maxChain ?? this.sector.maxChain) >= 10,
      chain_15: (ctx.maxChain ?? this.sector.maxChain) >= 15,
      campaign_complete: p.campaignComplete,
      ng_plus_clear: ctx.cleared && ctx.ngPlus,
      sector_1_s: s.sectorBests[1]?.grade === 'S',
      sector_5_s: s.sectorBests[5]?.grade === 'S',
      sector_10_s: s.sectorBests[10]?.grade === 'S',
      run_kills_50: this.run.kills >= 50,
      run_kills_100: this.run.kills >= 100,
      boss_kill: (s.bossKills || 0) >= 1,
      endless_mutator_clear: ctx.cleared && ctx.endlessMutator,
      mastery_3: STYLE_IDS.some((id) => this.masteryLevel(id) >= 3),
      mastery_5: STYLE_IDS.some((id) => this.masteryLevel(id) >= 5),
    };

    let sGrades = 0;
    for (let i = 1; i <= 10; i++) {
      if (s.sectorBests[i]?.grade === 'S') sGrades++;
    }

    const counters = {
      lifetimeClears: s.lifetimeClears,
      lifetimeDeaths: s.lifetimeDeaths,
      bestEndlessWave: s.bestEndlessWave,
      ownedStyles: p.ownedStyles.length,
      credits: p.credits,
      dailyStreak: p.daily.streak,
      lifetimePerfects: s.lifetimePerfects || 0,
      eliteKills: s.eliteKills || 0,
      challengesDone: p.challenges.completed.length,
      achievementsDone: p.achievements.completed.length,
      style_linear_clears: p.masteryFor('linear_sniper').clears,
      style_pulse_clears: p.masteryFor('pulse_breaker').clears,
      style_phase_clears: p.masteryFor('phase_runner').clears,
      style_arc_clears: p.masteryFor('arc_scatter').clears,
      style_null_clears: p.masteryFor('null_suppressor').clears,
      style_overclock_clears: p.masteryFor('overclock').clears,
      s_grades: sGrades,
    };

    for (const ach of ACHIEVEMENTS) {
      if (p.isAchievementComplete(ach.id)) continue;
      let done = false;
      if (ach.flag) done = !!flags[ach.flag];
      else if (ach.id === 'first_death') done = s.lifetimeDeaths >= 1;
      else if (ach.id === 'first_clear') done = s.lifetimeClears >= 1;
      else if (ach.counter) done = (counters[ach.counter] ?? 0) >= (ach.target ?? 1);

      if (done) {
        p.completeAchievement(ach.id);
        const unlock = { kind: 'achievement', id: ach.id, title: ach.title, label: ach.title };
        this.pendingUnlocks.push(unlock);
        this.onUnlock?.(unlock);
      }
    }
  }

  checkDaily(runResult) {
    const daily = getDailyChallenge();
    if (this.profile.daily.lastCompletedDate === daily.dateKey) return;

    if (!isDailyComplete(this.profile, daily, runResult)) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    if (this.profile.daily.lastCompletedDate === yKey) {
      this.profile.daily.streak += 1;
    } else {
      this.profile.daily.streak = 1;
    }
    this.profile.daily.lastCompletedDate = daily.dateKey;
    this.profile.daily.todayId = daily.id;
    this.profile.addCredits(dailyRewardWC());
    const unlock = {
      kind: 'daily',
      title: daily.title,
      label: `+${dailyRewardWC()} WC · streak ${this.profile.daily.streak}`,
    };
    this.pendingUnlocks.push(unlock);
    this.onUnlock?.(unlock);
    this.onWcChange?.();
    this.checkAchievements();
  }

  getDailyInfo() {
    return getDailyChallenge();
  }

  getDailyMenuLine() {
    const daily = getDailyChallenge();
    const done = this.profile.daily.lastCompletedDate === daily.dateKey;
    const streak = this.profile.daily.streak;
    if (done) return `Daily: done · streak ${streak}`;
    const short = daily.title.replace(/^Daily:\s*/i, '');
    return `Daily: ${short} · streak ${streak}`;
  }

  getDeathMotivation(world, prevEndlessBest = null) {
    const lines = [];

    if (!this.profile.isChallengeComplete('perfect_10_run') && this.run.perfects >= 3) {
      lines.push(`Weave Five: ${this.run.perfects} / 5 perfect weaves this run`);
    }
    if (!this.profile.isChallengeComplete('weave_5_sector') && this.sector.perfects >= 3) {
      lines.push(`Clean Sector: ${this.sector.perfects} / 5 this sector`);
    }

    const daily = getDailyChallenge();
    if (this.profile.daily.lastCompletedDate !== daily.dateKey) {
      const near = this.getDailyNearMiss(daily, world);
      if (near) lines.push(near);
    }

    if (world.isEndless()) {
      const wave = world.endlessCleared;
      const prev = prevEndlessBest ?? this.profile.stats.bestEndlessWave;
      if (wave > 0 && wave > prev) {
        lines.push(`New endless PB: wave ${wave}`);
      }
    }

    return lines.slice(0, 2);
  }

  getDailyNearMiss(daily, world) {
    switch (daily.type) {
      case 'sector_perfects': {
        const cur = this.sector.perfects;
        if (cur >= daily.target - 2 && cur < daily.target) {
          return `Daily almost done: ${cur} / ${daily.target} sector weaves`;
        }
        break;
      }
      case 'endless_wave': {
        if (!world.isEndless()) break;
        const wave = world.endlessCleared;
        if (wave >= daily.target - 1 && wave < daily.target) {
          return `Daily almost done: ${wave} / ${daily.target} waves`;
        }
        break;
      }
      case 'chain': {
        const cur = this.sector.maxChain;
        if (cur >= daily.target - 1 && cur < daily.target) {
          return `Daily almost done: chain ×${cur} / ×${daily.target}`;
        }
        break;
      }
      default:
        break;
    }
    return null;
  }

  checkDailyOnDeath(world) {
    const daily = getDailyChallenge();
    if (this.profile.daily.lastCompletedDate === daily.dateKey) return;
    if (daily.type !== 'endless_wave') return;

    const runResult = {
      cleared: false,
      endlessWave: world.endlessCleared,
      perfects: this.sector.perfects,
      dashes: this.sector.dashes,
      maxChain: this.sector.maxChain,
      styleId: this.run.styleId,
    };
    if (!isDailyComplete(this.profile, daily, runResult)) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    if (this.profile.daily.lastCompletedDate === yKey) {
      this.profile.daily.streak += 1;
    } else {
      this.profile.daily.streak = 1;
    }
    this.profile.daily.lastCompletedDate = daily.dateKey;
    this.profile.daily.todayId = daily.id;
    this.profile.addCredits(dailyRewardWC());
    const unlock = {
      kind: 'daily',
      title: daily.title,
      label: `+${dailyRewardWC()} WC · streak ${this.profile.daily.streak}`,
    };
    this.pendingUnlocks.push(unlock);
    this.onUnlock?.(unlock);
    this.onWcChange?.();
    this.checkAchievements();
  }

  getNextChallengeHint(sectorNum = null) {
    if (!this.profile.isChallengeComplete('perfect_10_run') && this.run.perfects === 4) {
      return 'Weave Five: 1 more perfect weave next sector';
    }
    if (!this.profile.isChallengeComplete('weave_5_sector') && this.sector.perfects === 4) {
      return 'Clean Sector: 1 more perfect weave for unlock';
    }
    if (!this.profile.isChallengeComplete('endless_wave_5')) {
      const wave = Math.max(this.profile.getProgress('endless_wave_5'), this.profile.stats.bestEndlessWave);
      if (wave === 4) return 'Endless Five: survive 1 more wave';
    }
    for (const ch of CHALLENGES) {
      if (ch.type !== 'sector_clear' || this.profile.isChallengeComplete(ch.id)) continue;
      const nextSector = ch.sector;
      if (nextSector === (sectorNum ?? this.lastClearResult?.sectorNum ?? 0) + 1) {
        return `Next: ${ch.title}`;
      }
    }
    return null;
  }

  getRunState() {
    return {
      runPerfects: this.run.perfects,
      sectorPerfects: this.sector.perfects,
      endlessWave: this.profile.stats.bestEndlessWave,
    };
  }

  masteryLevel(styleId) {
    const m = this.profile.masteryFor(styleId);
    const score = m.clears * 3 + m.kills * 0.5 + m.abilityUses;
    if (score >= 80) return 5;
    if (score >= 45) return 4;
    if (score >= 25) return 3;
    if (score >= 10) return 2;
    if (score >= 3) return 1;
    return 0;
  }
}

function challengeWcReward(def) {
  if (def.wc == null || def.wc <= 0) return 0;
  return Math.max(WC_CHALLENGE_MIN, Math.min(WC_CHALLENGE_MAX, def.wc));
}

export { rewardLabel };
