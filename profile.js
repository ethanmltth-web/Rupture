import { DEFAULT_EQUIPPED_STYLE, STYLE_IDS } from './styles.js';
import { TINT_CLASS, BADGE_SUFFIX } from './shop.js';
import { TITLE_BY_ID } from './titles.js';

export const PROFILE_KEY = 'rupture_profile_v1';

export const DEFAULT_UNLOCKED_SECTORS = [1];
export const DEFAULT_UNLOCKED_MODIFIERS = ['classic'];

function emptySectorBests() {
  const out = {};
  for (let i = 1; i <= 10; i++) {
    out[i] = { time: null, perfects: 0, dashes: 0, grade: null };
  }
  return out;
}

function emptyStyleMastery() {
  const out = {};
  for (const id of STYLE_IDS) {
    out[id] = { clears: 0, kills: 0, abilityUses: 0, bestSector: 0 };
  }
  return out;
}

export class Profile {
  constructor() {
    this.persist = false;
    this.resetToDefaults();
  }

  resetToDefaults() {
    this.stats = {
      lifetimeClears: 0,
      lifetimeDeaths: 0,
      bestEndlessWave: 0,
      sectorBests: emptySectorBests(),
      styleMastery: emptyStyleMastery(),
    };
    this.challenges = { completed: [], progress: {} };
    this.achievements = { completed: [] };
    this.daily = { lastCompletedDate: null, streak: 0, todayId: null };
    this.credits = 0;
    this.ownedStyles = [DEFAULT_EQUIPPED_STYLE];
    this.unlockedSectors = [...DEFAULT_UNLOCKED_SECTORS];
    this.unlockedModifiers = [...DEFAULT_UNLOCKED_MODIFIERS];
    this.campaignComplete = false;
    this.newGamePlusUnlocked = false;
    this.furthestSector = 1;
    this.selectedSector = 1;
    this.equippedTitle = null;
    this.cosmetics = { owned: [], equippedTint: null, equippedBadge: null };
    this.persist = false;
    localStorage.removeItem(PROFILE_KEY);
    this.applyCosmeticsToDOM();
  }

  load() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return;
      this.persist = true;
      this.fromSnapshot(JSON.parse(raw), { save: false });
    } catch {
      /* corrupt storage */
    }
  }

  toSnapshot() {
    return {
      stats: this.stats,
      challenges: this.challenges,
      achievements: this.achievements,
      daily: this.daily,
      credits: this.credits,
      ownedStyles: this.ownedStyles,
      unlockedSectors: this.unlockedSectors,
      unlockedModifiers: this.unlockedModifiers,
      campaignComplete: this.campaignComplete,
      newGamePlusUnlocked: this.newGamePlusUnlocked,
      furthestSector: this.furthestSector,
      selectedSector: this.selectedSector,
      equippedTitle: this.equippedTitle,
      cosmetics: this.cosmetics,
    };
  }

  fromSnapshot(data, { save = true } = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid profile data.');
    }
    if (data.stats) {
      Object.assign(this.stats, data.stats);
      if (!this.stats.sectorBests) this.stats.sectorBests = emptySectorBests();
      if (!this.stats.styleMastery) this.stats.styleMastery = emptyStyleMastery();
      for (let i = 1; i <= 10; i++) {
        if (!this.stats.sectorBests[i]) {
          this.stats.sectorBests[i] = { time: null, perfects: 0, dashes: 0, grade: null };
        }
      }
      for (const id of STYLE_IDS) {
        if (!this.stats.styleMastery[id]) {
          this.stats.styleMastery[id] = { clears: 0, kills: 0, abilityUses: 0, bestSector: 0 };
        }
      }
    }
    if (data.challenges) {
      this.challenges.completed = [...(data.challenges.completed || [])];
      this.challenges.progress = { ...(data.challenges.progress || {}) };
    }
    if (data.achievements) {
      this.achievements.completed = [...(data.achievements.completed || [])];
    }
    if (data.daily) Object.assign(this.daily, data.daily);
    if (typeof data.credits === 'number') this.credits = data.credits;
    if (Array.isArray(data.ownedStyles) && data.ownedStyles.length) {
      this.ownedStyles = data.ownedStyles.filter((id) => STYLE_IDS.includes(id));
    }
    if (!this.ownedStyles.includes(DEFAULT_EQUIPPED_STYLE)) {
      this.ownedStyles.unshift(DEFAULT_EQUIPPED_STYLE);
    }
    if (Array.isArray(data.unlockedSectors) && data.unlockedSectors.length) {
      this.unlockedSectors = data.unlockedSectors.filter((n) => n >= 1 && n <= 10);
    }
    if (Array.isArray(data.unlockedModifiers)) {
      this.unlockedModifiers = data.unlockedModifiers.filter((m) => m === 'classic' || m === 'endless' || m === 'newgameplus');
    }
    if (typeof data.campaignComplete === 'boolean') this.campaignComplete = data.campaignComplete;
    if (typeof data.newGamePlusUnlocked === 'boolean') this.newGamePlusUnlocked = data.newGamePlusUnlocked;
    if (typeof data.furthestSector === 'number') {
      this.furthestSector = Math.max(1, Math.min(10, data.furthestSector));
    } else if (this.unlockedSectors.length) {
      this.furthestSector = Math.max(...this.unlockedSectors);
    }
    if (typeof data.selectedSector === 'number') {
      this.selectedSector = Math.max(1, Math.min(10, data.selectedSector));
    } else {
      this.selectedSector = this.furthestSector;
    }
    if (!this.isSectorUnlocked(this.selectedSector)) {
      this.selectedSector = Math.max(...this.unlockedSectors);
    }
    if (data.equippedTitle === null || typeof data.equippedTitle === 'string') {
      this.equippedTitle = data.equippedTitle;
    }
    if (this.equippedTitle && !this.isTitleUnlocked(this.equippedTitle)) {
      this.equippedTitle = null;
    }
    if (data.cosmetics) {
      this.cosmetics.owned = [...(data.cosmetics.owned || [])];
      this.cosmetics.equippedTint = data.cosmetics.equippedTint ?? null;
      this.cosmetics.equippedBadge = data.cosmetics.equippedBadge ?? null;
    }
    if (save && this.persist) this.save();
  }

  save() {
    if (!this.persist) return;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(this.toSnapshot()));
  }

  isStyleOwned(id) {
    return this.ownedStyles.includes(id);
  }

  ownStyle(id) {
    if (!STYLE_IDS.includes(id)) return;
    if (!this.ownedStyles.includes(id)) {
      this.ownedStyles.push(id);
      this.save();
    }
  }

  unlockSector(num) {
    const n = Math.max(1, Math.min(10, num));
    const max = this.unlockedSectors.length ? Math.max(...this.unlockedSectors) : 1;
    if (n > max + 1) return;
    let changed = false;
    for (let i = max + 1; i <= n; i++) {
      if (!this.unlockedSectors.includes(i)) {
        this.unlockedSectors.push(i);
        changed = true;
      }
    }
    if (!changed) return;
    this.unlockedSectors.sort((a, b) => a - b);
    this.furthestSector = Math.max(this.furthestSector, ...this.unlockedSectors);
    this.save();
  }

  recordClassicSectorClear(clearedSector) {
    const next = Math.min(10, clearedSector + 1);
    this.unlockSector(next);
    this.furthestSector = Math.max(this.furthestSector, next);
    if (clearedSector < 10) {
      this.selectedSector = next;
    } else {
      this.selectedSector = 10;
    }
    this.save();
  }

  setSelectedSector(num) {
    const n = Math.max(1, Math.min(10, num));
    if (!this.isSectorUnlocked(n)) return false;
    this.selectedSector = n;
    this.save();
    return true;
  }

  isTitleUnlocked(titleId) {
    const def = TITLE_BY_ID[titleId];
    if (!def) return false;
    switch (def.source) {
      case 'achievement':
        return this.isAchievementComplete(def.sourceId);
      case 'challenge':
        return this.isChallengeComplete(def.sourceId);
      case 'shop':
        return this.ownsCosmetic(def.sourceId);
      default:
        return false;
    }
  }

  equipTitle(titleId) {
    if (titleId === null) {
      this.equippedTitle = null;
      this.save();
      return true;
    }
    if (!this.isTitleUnlocked(titleId)) return false;
    this.equippedTitle = titleId;
    this.save();
    return true;
  }

  equippedTitleLabel() {
    if (!this.equippedTitle) return '';
    return TITLE_BY_ID[this.equippedTitle]?.label ?? '';
  }

  displaySuffix() {
    const title = this.equippedTitleLabel();
    if (title) return ` · ${title}`;
    return this.badgeSuffix();
  }

  unlockModifier(id) {
    if (!this.unlockedModifiers.includes(id)) {
      this.unlockedModifiers.push(id);
      this.save();
    }
  }

  isSectorUnlocked(num) {
    return this.unlockedSectors.includes(num);
  }

  isModifierUnlocked(id) {
    return this.unlockedModifiers.includes(id);
  }

  isChallengeComplete(id) {
    return this.challenges.completed.includes(id);
  }

  getProgress(id) {
    return this.challenges.progress[id] ?? 0;
  }

  setProgress(id, value) {
    this.challenges.progress[id] = value;
  }

  completeChallenge(id) {
    if (!this.challenges.completed.includes(id)) {
      this.challenges.completed.push(id);
      this.save();
      return true;
    }
    return false;
  }

  isAchievementComplete(id) {
    return this.achievements.completed.includes(id);
  }

  completeAchievement(id) {
    if (!this.achievements.completed.includes(id)) {
      this.achievements.completed.push(id);
      this.save();
      return true;
    }
    return false;
  }

  recordSectorBest(sectorNum, { time, perfects, dashes, grade }) {
    const cur = this.stats.sectorBests[sectorNum];
    if (!cur) return null;
    const prevTime = cur.time;
    const prevGrade = cur.grade;
    let timePb = false;
    let gradeImproved = false;

    if (cur.time == null || time < cur.time) {
      cur.time = time;
      timePb = true;
    }
    if (perfects > cur.perfects) {
      cur.perfects = perfects;
    }
    const gradeRank = { S: 4, A: 3, B: 2, C: 1, null: 0 };
    if (gradeRank[grade] > gradeRank[cur.grade]) {
      cur.grade = grade;
      gradeImproved = true;
    }
    if (timePb || gradeImproved) this.save();

    if (!timePb && !gradeImproved) return null;
    return {
      timePb,
      gradeImproved,
      prevTime,
      newTime: cur.time,
      prevGrade,
      newGrade: cur.grade,
    };
  }

  spendCredits(n) {
    if (n <= 0 || this.credits < n) return false;
    this.credits -= n;
    this.save();
    return true;
  }

  addCredits(n) {
    if (n > 0) {
      this.credits += n;
      this.save();
    }
  }

  ownsCosmetic(id) {
    return this.cosmetics.owned.includes(id);
  }

  buyCosmetic(id, cost) {
    if (this.ownsCosmetic(id)) return false;
    if (!this.spendCredits(cost)) return false;
    this.cosmetics.owned.push(id);
    this.save();
    return true;
  }

  equipCosmetic(id) {
    if (!this.ownsCosmetic(id)) return false;
    if (id.startsWith('tint_')) {
      this.cosmetics.equippedTint = id;
    } else if (id.startsWith('badge_')) {
      this.cosmetics.equippedBadge = id;
    } else {
      return false;
    }
    this.save();
    return true;
  }

  isCosmeticEquipped(id) {
    if (id.startsWith('tint_')) return this.cosmetics.equippedTint === id;
    if (id.startsWith('badge_')) return this.cosmetics.equippedBadge === id;
    return false;
  }

  badgeSuffix() {
    const id = this.cosmetics.equippedBadge;
    if (!id) return '';
    return BADGE_SUFFIX[id] ? ` · ${BADGE_SUFFIX[id]}` : '';
  }

  applyCosmeticsToDOM() {
    const wrap = document.getElementById('wrap');
    if (!wrap) return;
    for (const cls of Object.values(TINT_CLASS)) {
      wrap.classList.remove(cls);
    }
    if (this.cosmetics.equippedTint && TINT_CLASS[this.cosmetics.equippedTint]) {
      wrap.classList.add(TINT_CLASS[this.cosmetics.equippedTint]);
    }
  }

  masteryFor(styleId) {
    if (!this.stats.styleMastery[styleId]) {
      this.stats.styleMastery[styleId] = { clears: 0, kills: 0, abilityUses: 0, bestSector: 0 };
    }
    return this.stats.styleMastery[styleId];
  }
}
