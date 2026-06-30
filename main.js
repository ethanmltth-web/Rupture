import {
  FRAME, COUNTDOWN_SEC, FPS, P, COMBAT_GRACE_FRAMES, CLEAR_CELEBRATION_FRAMES, CHAIN_DECAY_FRAMES,
  SAVE_REMINDER_CLEARS,
} from './constants.js';
import { Settings } from './settings.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { World, LEVELS } from './world.js';
import { Effects } from './effects.js';
import { createAbilityKit } from './ability-kit.js';
import { RobotCtrl } from './robot.js';
import { Render } from './render.js';
import { Codex } from './codex.js';
import { StyleIntel } from './style-intel.js';
import { CombatIntel } from './combat-intel.js';
import { SettingsUI, syncHudKeys, syncMenuHints } from './settings-ui.js';
import { ModifierUI } from './modifiers-ui.js';
import { StylesUI } from './styles-ui.js';
import { SceneFade, showLayer, hideLayer, HUD_MS } from './transitions.js';
import { dashAssistEnvelope } from './dashCurve.js';
import { MODIFIERS } from './modifiers.js';
import { STYLES, DEFAULT_EQUIPPED_STYLE } from './styles.js';
import { GameAudio } from './audio.js';
import { Profile } from './profile.js';
import { ChallengeTracker } from './challenge-tracker.js';
import { ChallengesUI } from './challenges-ui.js';
import { RecordsUI } from './records-ui.js';
import { ShopUI } from './shop-ui.js';
import { TitlesUI } from './titles-ui.js';
import { SECTOR_META } from './grades.js';
import { readSaveFile, applySaveBundle, validateSaveFileName } from './save-manager.js';
import { SaveExportUI } from './save-export-ui.js';

function formatSectorTime(frames) {
  return `${(frames / FPS).toFixed(2)}s`;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = new Settings();
    this.profile = new Profile();
    this.audio = new GameAudio(this.settings);
    this.tracker = new ChallengeTracker(
      this.profile,
      this.audio,
      (u) => this.onUnlock(u),
      () => this.syncWcStrip(this.state === 'play' || this.state === 'countdown'),
    );
    this.input = new Input(this.settings);
    this.player = new Player(this.audio);
    this.world = new World();
    this.fx = new Effects(this.audio);
    this.abilities = createAbilityKit(this.settings.equippedStyle, this.audio);
    this.robot = new RobotCtrl();
    this.robotMode = false;
    this.clearWait = 0;
    this.clearing = false;
    this.combatGrace = 0;
    this.pendingStyle = null;
    this.styleToastTimer = 0;
    this.countdown = 0;
    this.selectedLevel = 0;
    this.modifier = 'classic';
    this.render = new Render(this.canvas);
    this.codex = new Codex(this.render, this.input, this.audio);
    this.styleIntel = new StyleIntel(this.input, this.audio);
    this.combatIntel = new CombatIntel(this.input, this.audio);
    this.settingsUI = new SettingsUI(this.settings, this.input, this.audio);
    this.modifierUI = new ModifierUI(this.profile, this.input, (id) => this.setModifier(id), this.audio);
    this.stylesUI = new StylesUI(this.settings, this.profile, this.input, (id) => this.setStyle(id), this.audio);
    this.challengesUI = new ChallengesUI(this.profile, this.input, this.audio, this.tracker);
    this.recordsUI = new RecordsUI(this.profile, this.tracker, this.input, this.audio);
    this.shopUI = new ShopUI(this.profile, this.input, () => {
      this.syncProfileStrip();
      this.syncWcStrip();
      this.profile.applyCosmeticsToDOM();
      if (this.titlesUI?.open) this.titlesUI.buildList();
    }, this.audio);
    this.titlesUI = new TitlesUI(this.profile, this.input, this.audio);
    this.titlesUI.onEquipChange = () => this.syncProfileStrip();
    this.saveLoaded = false;
    this.saveExportUI = new SaveExportUI(
      this.profile,
      this.settings,
      this.input,
      this.audio,
      (msg) => this.setSaveStatus(msg),
    );
    if (!this.profile.isStyleOwned(this.settings.equippedStyle)) {
      this.settings.setEquippedStyle(DEFAULT_EQUIPPED_STYLE);
    }
    this.sceneFade = new SceneFade();
    this.lastCountdownNum = '';
    this.lockWasReady = true;
    this.quickWasReady = true;
    this.dashWasReady = true;
    this.pendingUnlocks = [];
    this.showVictoryAfterClear = false;
    this._hudCache = {};
    this._menuBgTick = 0;
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.curveAssistBlend = 0;
    this.sessionClears = 0;
    this.saveReminderShown = false;

    this.frame = 0;
    this.acc = 0;
    this.countdownAcc = 0;
    this.last = 0;
    this.state = 'title';

    this.el = {
      title: document.getElementById('title'),
      dead: document.getElementById('dead'),
      clear: document.getElementById('clear'),
      countdown: document.getElementById('countdown'),
      countdownNum: document.getElementById('countdown-num'),
      hud: document.getElementById('hud'),
      abilityHud: document.getElementById('ability-hud'),
      level: document.getElementById('level-label'),
      timer: document.getElementById('timer-label'),
      chain: document.getElementById('chain-label'),
      dash: document.getElementById('dash-label'),
      lockCdBar: document.getElementById('lock-cd-bar'),
      lockCdText: document.getElementById('lock-cd-text'),
      lockAbilityLabel: document.getElementById('lock-ability-label'),
      quickCdBar: document.getElementById('quick-cd-bar'),
      quickCdText: document.getElementById('quick-cd-text'),
      quickAbilityLabel: document.getElementById('quick-ability-label'),
      deadSectorName: document.getElementById('dead-sector-name'),
      deadTime: document.getElementById('dead-time'),
      deadPerfects: document.getElementById('dead-perfects'),
      deadDashes: document.getElementById('dead-dashes'),
      deadEndlessRow: document.getElementById('dead-endless-row'),
      deadEndless: document.getElementById('dead-endless'),
      btnDeadRetry: document.getElementById('btn-dead-retry'),
      btnDeadMenu: document.getElementById('btn-dead-menu'),
      clearSectorName: document.getElementById('clear-sector-name'),
      clearTime: document.getElementById('clear-time'),
      clearPerfects: document.getElementById('clear-perfects'),
      clearDashes: document.getElementById('clear-dashes'),
      clearEndlessRow: document.getElementById('clear-endless-row'),
      clearEndless: document.getElementById('clear-endless'),
      btnClearContinue: document.getElementById('btn-clear-continue'),
      btnClearMenu: document.getElementById('btn-clear-menu'),
      levelName: document.getElementById('level-name'),
      levelNum: document.getElementById('level-num'),
      levelTotal: document.getElementById('level-total'),
      levelNumInput: document.getElementById('level-num-input'),
      levelPrev: document.getElementById('level-prev'),
      levelNext: document.getElementById('level-next'),
      levelSelect: document.getElementById('level-select'),
      sectorPickerBlock: document.getElementById('sector-picker-block'),
      btnStart: document.getElementById('btn-start'),
      firstRunTips: document.getElementById('first-run-tips'),
      btnTipsDismiss: document.getElementById('btn-tips-dismiss'),
      styleToast: document.getElementById('style-toast'),
      unlockToast: document.getElementById('unlock-toast'),
      menuProfileStrip: document.getElementById('menu-profile-strip'),
      menuDaily: document.getElementById('menu-daily'),
      wcBalance: document.getElementById('wc-balance'),
      wcAmount: document.getElementById('wc-amount'),
      saveTransferStatus: document.getElementById('save-transfer-status'),
      saveFileInput: document.getElementById('save-file-input'),
      deadMotivation: document.getElementById('dead-motivation'),
      weaveHint: document.getElementById('weave-hint'),
      parHint: document.getElementById('par-hint'),
      clearGrade: document.getElementById('clear-grade'),
      clearUnlocks: document.getElementById('clear-unlocks'),
      clearPb: document.getElementById('clear-pb'),
      clearNext: document.getElementById('clear-next'),
      victory: document.getElementById('victory'),
      victoryCredits: document.getElementById('victory-credits'),
      victoryUnlocks: document.getElementById('victory-unlocks'),
      btnVictoryMenu: document.getElementById('btn-victory-menu'),
      saveReminder: document.getElementById('save-reminder'),
    };

    this.player.onDash = () => this.tracker.onDash();
    this.player.onPerfectWeave = (chain) => this.tracker.onPerfectWeave(chain);
    this.world.onEnemyKill = (type, ref) => this.tracker.onKill(type, ref);

    this.transitionLock = false;

    this.el.levelTotal.textContent = LEVELS.length;
    this.syncLevelSelect();
    this.syncModifierUI();
    syncMenuHints(this.settings);
    syncHudKeys(this.settings);
    this.settings.onChange(() => {
      syncMenuHints(this.settings);
      syncHudKeys(this.settings);
      this.audio.applyVolume();
      if (this.abilities.styleId !== this.settings.equippedStyle) {
        const inMenu = this.state === 'title' || this.state === 'dead';
        if (inMenu || this.state === 'play' || this.state === 'countdown') {
          this.abilities = createAbilityKit(this.settings.equippedStyle, this.audio);
          this.syncAbilityLabels();
        }
      }
      this.stylesUI?.syncCurrent();
    });
    this.syncAbilityLabels();
    showLayer(this.el.title);
    showLayer(this.el.levelSelect, { delay: 120 });

    this.el.levelPrev.addEventListener('click', () => this.changeLevel(-1));
    this.el.levelNext.addEventListener('click', () => this.changeLevel(1));
    this.el.btnStart.addEventListener('click', () => {
      this.audio.unlock();
      if (this.state === 'title' && !this.menuBlocked() && !this.transitionLock) {
        this.audio.play('menu_confirm');
        this.maybeShowFirstRunTips();
        this.start();
      }
    });

    if (this.el.btnTipsDismiss) {
      this.el.btnTipsDismiss.addEventListener('click', () => this.dismissFirstRunTips());
    }
    this.wireSaveLoad();
    this.el.levelNumInput.addEventListener('change', () => this.applyLevelInput());
    this.el.levelNumInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyLevelInput();
        this.el.levelNumInput.blur();
      }
    });

    this.el.btnDeadRetry.addEventListener('click', () => {
      this.audio.unlock();
      if (this.state === 'dead' && !this.menuBlocked() && !this.transitionLock) {
        this.audio.play('menu_confirm');
        this.start();
      }
    });
    this.el.btnDeadMenu.addEventListener('click', () => this.returnToMenu());
    this.el.btnClearContinue.addEventListener('click', () => {
      if (this.isSaveReminderOpen()) return;
      if (this.state === 'clear' && !this.transitionLock) {
        this.audio.play('menu_confirm');
        this.advanceSector();
      }
    });
    this.el.btnClearMenu.addEventListener('click', () => this.returnToMenu());
    document.getElementById('btn-save-reminder-ok')?.addEventListener('click', () => this.hideSaveReminder());
    document.getElementById('btn-save-reminder-now')?.addEventListener('click', () => {
      this.hideSaveReminder();
      this.saveExportUI.show();
    });
    this.el.saveReminder?.addEventListener('click', (e) => {
      if (e.target === this.el.saveReminder) this.hideSaveReminder();
    });
    window.addEventListener('keydown', (e) => {
      if (this.isSaveReminderOpen() && e.key === 'Escape') {
        e.preventDefault();
        this.hideSaveReminder();
      }
    });
    this.el.btnVictoryMenu?.addEventListener('click', () => this.returnToMenu());

    this.ensureValidSectorSelection();
    this.syncProfileStrip();
    this.syncWcStrip();

    window.addEventListener('keydown', (e) => {
      if (this.state !== 'title' && this.state !== 'dead') return;
      if (this.modifier === 'endless') return;
      if (this.menuBlocked()) return;
      if (e.target === this.el.levelNumInput) return;
      if (!/^Digit[0-9]$|^Numpad[0-9]$/.test(e.code)) return;
      const d = parseInt(e.key, 10);
      if (Number.isNaN(d)) return;
      e.preventDefault();
      this.pickSectorByDigit(d);
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  menuBlocked() {
    const tipsOpen = this.el.firstRunTips
      && !this.el.firstRunTips.classList.contains('hide');
    return this.codex.isOpen()
      || this.styleIntel.isOpen()
      || this.combatIntel.isOpen()
      || this.settingsUI.isOpen()
      || this.settingsUI.isRebinding()
      || this.modifierUI.isOpen()
      || this.stylesUI.isOpen()
      || this.challengesUI.isOpen()
      || this.recordsUI.isOpen()
      || this.shopUI.isOpen()
      || this.titlesUI.isOpen()
      || this.saveExportUI.isOpen()
      || this.isSaveReminderOpen()
      || tipsOpen;
  }

  syncProfileStrip() {
    if (!this.el.menuProfileStrip) return;
    const p = this.profile;
    this.el.menuProfileStrip.textContent =
      `${p.stats.lifetimeClears} clears · ${p.ownedStyles.length} styles · ${p.challenges.completed.length} challenges${p.displaySuffix()}`;
    if (this.el.menuDaily) {
      this.el.menuDaily.textContent = this.tracker.getDailyMenuLine();
    }
    p.applyCosmeticsToDOM();
  }

  syncWcStrip(pulse = false) {
    if (!this.el.wcAmount) return;
    this.el.wcAmount.textContent = String(this.profile.credits);
    if (this.el.wcBalance && pulse) {
      this.el.wcBalance.classList.remove('wc-pulse');
      void this.el.wcBalance.offsetWidth;
      this.el.wcBalance.classList.add('wc-pulse');
    }
  }

  setSaveStatus(msg, isError = false) {
    if (!this.el.saveTransferStatus) return;
    this.el.saveTransferStatus.textContent = msg;
    this.el.saveTransferStatus.classList.toggle('save-transfer-error', isError);
    if (msg && !isError) {
      clearTimeout(this.saveStatusTimer);
      this.saveStatusTimer = setTimeout(() => {
        if (this.el.saveTransferStatus) this.el.saveTransferStatus.textContent = '';
      }, 4000);
    }
  }

  isSaveReminderOpen() {
    return this.el.saveReminder
      && !this.el.saveReminder.classList.contains('hide')
      && this.el.saveReminder.classList.contains('ui-visible');
  }

  hideSaveReminder() {
    if (!this.isSaveReminderOpen()) return;
    hideLayer(this.el.saveReminder);
    this.audio.play('ui_select');
  }

  maybeShowSaveReminder() {
    if (this.saveReminderShown) return;
    this.sessionClears += 1;
    if (this.sessionClears < SAVE_REMINDER_CLEARS) return;
    this.saveReminderShown = true;
    showLayer(this.el.saveReminder);
    this.audio.play('ui_open');
  }

  syncSaveExitBtn() {
    const btn = document.getElementById('btn-save-exit');
    if (!btn) return;
    btn.classList.toggle('is-active', this.saveLoaded);
    btn.disabled = !this.saveLoaded;
  }

  exitLoadedSave() {
    if (!this.saveLoaded) return;
    if (!confirm('Exit this save? All progress resets to defaults (0 WC, no unlocks).')) return;
    this.saveExportUI.hide();
    this.profile.resetToDefaults();
    this.settings.resetToDefaults();
    this.saveLoaded = false;
    this.tracker.beginRun(this.settings.equippedStyle, false);
    if (this.state === 'play' || this.state === 'countdown') {
      this.returnToMenu();
    } else {
      this.refreshAfterSaveLoad();
      this.settingsUI.syncSliders();
      this.settingsUI.buildList();
    }
    this.syncSaveExitBtn();
    this.setSaveStatus('Exited save — defaults restored.');
    this.audio.play('ui_select');
  }

  wireSaveLoad() {
    document.getElementById('btn-save-export')?.addEventListener('click', () => this.saveExportUI.show());
    document.getElementById('btn-save-import')?.addEventListener('click', () => {
      this.el.saveFileInput?.click();
    });
    document.getElementById('btn-save-exit')?.addEventListener('click', () => this.exitLoadedSave());
    this.el.saveFileInput?.addEventListener('change', () => this.importSave());
    this.syncSaveExitBtn();
  }

  async importSave() {
    const file = this.el.saveFileInput?.files?.[0];
    if (!file) return;
    this.el.saveFileInput.value = '';
    const nameError = validateSaveFileName(file.name);
    if (nameError) {
      this.setSaveStatus(nameError, true);
      return;
    }
    try {
      const data = await readSaveFile(file);
      if (!confirm('Load this save? Progress on this device will be replaced.')) return;
      applySaveBundle(data, this.profile, this.settings);
      this.saveLoaded = true;
      this.refreshAfterSaveLoad();
      this.settingsUI.syncSliders();
      this.settingsUI.buildList();
      this.syncSaveExitBtn();
      this.setSaveStatus(`Loaded — ${this.profile.credits} WC restored.`);
      this.audio.play('ui_select');
    } catch (err) {
      this.setSaveStatus(err.message || 'Load failed.', true);
    }
  }

  refreshAfterSaveLoad() {
    this.ensureValidSectorSelection();
    this.syncEquippedStyle();
    this.abilities = createAbilityKit(this.settings.equippedStyle, this.audio);
    this.syncAbilityLabels();
    this.syncLevelSelect();
    this.syncModifierUI();
    this.syncProfileStrip();
    this.syncWcStrip();
    this.profile.applyCosmeticsToDOM();
    this.stylesUI?.syncCurrent();
    this.titlesUI?.syncCurrent();
    syncMenuHints(this.settings);
    syncHudKeys(this.settings);
    this.audio.applyVolume();
  }

  onUnlock(unlock) {
    if (!unlock) return;
    const msg = unlock.kind === 'daily'
      ? `${unlock.title} — ${unlock.label}`
      : `Unlocked: ${unlock.label || unlock.title}`;
    this.showUnlockToast(msg);
    this.syncProfileStrip();
    this.syncWcStrip();
    if (this.titlesUI?.open) this.titlesUI.buildList();
  }

  showUnlockToast(msg) {
    if (!this.el.unlockToast) return;
    this.el.unlockToast.textContent = msg;
    showLayer(this.el.unlockToast);
    clearTimeout(this.unlockToastTimer);
    this.unlockToastTimer = setTimeout(() => hideLayer(this.el.unlockToast, { ms: HUD_MS }), 3200);
  }

  ensureValidSectorSelection() {
    if (this.modifier === 'classic') {
      const pick = this.profile.selectedSector;
      if (this.profile.isSectorUnlocked(pick)) {
        this.selectedLevel = pick - 1;
        return;
      }
    }
    if (this.profile.isSectorUnlocked(this.selectedLevel + 1)) return;
    const max = Math.max(...this.profile.unlockedSectors);
    this.selectedLevel = Math.max(0, max - 1);
  }

  updateTimeScale(dtSec) {
    const assist = this.settings.curveAssist;
    const dashing = this.player.dashing
      && (this.state === 'play' || this.state === 'countdown');

    let targetBlend = 0;
    if (dashing && assist > 0) {
      targetBlend = dashAssistEnvelope(
        this.player.dashFrame,
        this.player.dashT,
        P.dashLen,
      );
    }

    const rampK = targetBlend > this.curveAssistBlend
      ? 1 - Math.exp(-16 * dtSec)
      : 1 - Math.exp(-9 * dtSec);
    this.curveAssistBlend += (targetBlend - this.curveAssistBlend) * rampK;
    if (Math.abs(this.curveAssistBlend - targetBlend) < 0.003) {
      this.curveAssistBlend = targetBlend;
    }

    const minScale = this.settings.dashTimeScale();
    this.timeScale = 1 - (1 - minScale) * this.curveAssistBlend;
    this.timeScaleTarget = this.timeScale;
  }

  pickSectorByDigit(d) {
    if (this.modifier === 'endless') return;
    if (d === 0) {
      this.selectLevel(LEVELS.length - 1);
      return;
    }
    if (d >= 1 && d <= LEVELS.length) {
      this.selectLevel(d - 1);
    }
  }

  selectLevel(idx) {
    if (this.modifier === 'endless') return;
    const sector = idx + 1;
    if (!this.profile.isSectorUnlocked(sector)) {
      this.audio.play('ui_select');
      const need = sector - 1;
      this.showUnlockToast(need > 0
        ? `Locked — clear sector ${need} in Classic first`
        : 'Locked');
      return;
    }
    this.selectedLevel = Math.max(0, Math.min(LEVELS.length - 1, idx));
    if (this.modifier === 'classic') {
      this.profile.setSelectedSector(this.selectedLevel + 1);
    }
    this.audio.play('ui_select');
    this.syncLevelSelect();
  }

  syncEquippedStyle() {
    if (!this.profile.isStyleOwned(this.settings.equippedStyle)) {
      this.settings.setEquippedStyle(DEFAULT_EQUIPPED_STYLE);
    }
    this.abilities = createAbilityKit(this.settings.equippedStyle, this.audio);
    this.syncAbilityLabels();
  }

  syncAbilityLabels() {
    if (this.el.lockAbilityLabel) {
      this.el.lockAbilityLabel.textContent = this.abilities.hudLabel1();
    }
    if (this.el.quickAbilityLabel) {
      this.el.quickAbilityLabel.textContent = this.abilities.hudLabel2();
    }
  }

  maybeShowFirstRunTips() {
    if (localStorage.getItem('rupture_tips_seen')) return;
    if (this.el.firstRunTips) showLayer(this.el.firstRunTips);
  }

  dismissFirstRunTips() {
    localStorage.setItem('rupture_tips_seen', '1');
    if (this.el.firstRunTips) hideLayer(this.el.firstRunTips);
  }

  showStyleToast(msg) {
    if (!this.el.styleToast) return;
    this.el.styleToast.textContent = msg;
    showLayer(this.el.styleToast);
    clearTimeout(this.styleToastTimer);
    this.styleToastTimer = setTimeout(() => hideLayer(this.el.styleToast, { ms: HUD_MS }), 2400);
  }

  setStyle(id) {
    if (!this.profile.isStyleOwned(id)) return;
    if (this.state !== 'title' && this.state !== 'dead') {
      this.pendingStyle = id;
      const name = STYLES[id]?.name ?? 'Style';
      this.showStyleToast(`${name} applies next sector`);
      return;
    }
    this.settings.setEquippedStyle(id);
    this.pendingStyle = null;
    this.abilities = createAbilityKit(id, this.audio);
    this.stylesUI.syncCurrent();
    this.syncAbilityLabels();
  }

  setModifier(id) {
    if (!MODIFIERS[id] || !this.profile.isModifierUnlocked(id)) return;
    this.modifier = id;
    this.syncModifierUI();
    if (id !== 'endless') this.syncLevelSelect();
  }

  syncModifierUI() {
    if (!this.profile.isModifierUnlocked(this.modifier)) {
      this.modifier = 'classic';
    }
    this.modifierUI.setSelected(this.modifier);
    this.el.sectorPickerBlock.classList.toggle('locked', this.modifier === 'endless');
    if (this.modifier === 'endless') {
      this.el.btnStart.textContent = 'Start Endless';
    } else if (this.modifier === 'newgameplus') {
      this.el.btnStart.textContent = 'Start New Game+';
    } else {
      this.el.btnStart.textContent = 'Start Sector';
    }
  }

  sectorSummary() {
    return {
      name: this.world.levelName(),
      time: formatSectorTime(this.world.timer),
      perfects: this.player.sectorPerfects,
      dashes: this.player.sectorDashes,
      endlessSurvived: this.world.endlessCleared,
      endless: this.world.isEndless(),
    };
  }

  fillSummaryUI(prefix, summary, extras = {}) {
    const nameEl = this.el[`${prefix}SectorName`];
    const timeEl = this.el[`${prefix}Time`];
    const perfectsEl = this.el[`${prefix}Perfects`];
    const dashesEl = this.el[`${prefix}Dashes`];
    const endlessRow = this.el[`${prefix}EndlessRow`];
    const endlessEl = this.el[`${prefix}Endless`];

    if (nameEl) nameEl.textContent = summary.name;
    if (timeEl) timeEl.textContent = summary.time;
    if (perfectsEl) perfectsEl.textContent = String(summary.perfects);
    if (dashesEl) dashesEl.textContent = String(summary.dashes);
    if (endlessRow && endlessEl) {
      const show = summary.endless;
      endlessRow.classList.toggle('hide', !show);
      if (show) endlessEl.textContent = String(summary.endlessSurvived);
    }

    if (prefix === 'dead' && this.el.deadMotivation) {
      const lines = extras.motivation ?? [];
      if (lines.length) {
        this.el.deadMotivation.textContent = lines.join(' · ');
        this.el.deadMotivation.classList.remove('hide');
      } else {
        this.el.deadMotivation.classList.add('hide');
      }
    }

    if (prefix === 'clear') {
      if (this.el.clearGrade) {
        if (extras.grade) {
          this.el.clearGrade.textContent = `Grade ${extras.grade}`;
          this.el.clearGrade.classList.remove('hide');
        } else {
          this.el.clearGrade.classList.add('hide');
        }
      }
      if (this.el.clearPb) {
        const pb = extras.pbDelta;
        if (pb?.timePb && pb.prevTime != null) {
          const delta = (pb.prevTime - pb.newTime) / FPS;
          this.el.clearPb.textContent = `Time PB −${delta.toFixed(1)}s`;
          this.el.clearPb.classList.remove('hide');
        } else if (pb?.gradeImproved && pb.newGrade === 'S') {
          this.el.clearPb.textContent = 'New S rank!';
          this.el.clearPb.classList.remove('hide');
        } else if (pb?.gradeImproved && pb.newGrade) {
          this.el.clearPb.textContent = `New ${pb.newGrade} rank!`;
          this.el.clearPb.classList.remove('hide');
        } else {
          this.el.clearPb.classList.add('hide');
        }
      }
      if (this.el.clearNext) {
        if (extras.nextHint) {
          this.el.clearNext.textContent = extras.nextHint;
          this.el.clearNext.classList.remove('hide');
        } else {
          this.el.clearNext.classList.add('hide');
        }
      }
      if (this.el.clearUnlocks) {
        if (extras.unlocks?.length) {
          this.el.clearUnlocks.textContent = extras.unlocks
            .map((u) => u.label || u.title)
            .join(' · ');
          this.el.clearUnlocks.classList.remove('hide');
        } else {
          this.el.clearUnlocks.classList.add('hide');
        }
      }
    }
  }

  applyLevelInput() {
    if (this.modifier === 'endless') return;
    const raw = parseInt(this.el.levelNumInput.value, 10);
    if (!Number.isNaN(raw) && raw >= 1 && raw <= LEVELS.length) {
      this.selectLevel(raw - 1);
    } else {
      this.syncLevelSelect();
    }
  }

  changeLevel(delta) {
    if (this.modifier === 'endless') return;
    const next = this.selectedLevel + delta;
    if (next < 0 || next >= LEVELS.length) return;
    if (!this.profile.isSectorUnlocked(next + 1)) return;
    this.selectLevel(next);
  }

  syncLevelSelect() {
    this.ensureValidSectorSelection();
    this.el.levelName.textContent = LEVELS[this.selectedLevel].name;
    this.el.levelNum.textContent = this.selectedLevel + 1;
    this.el.levelNumInput.value = String(this.selectedLevel + 1);
    const locked = !this.profile.isSectorUnlocked(this.selectedLevel + 1);
    this.el.levelName.classList.toggle('level-locked', locked);
    this.el.levelName.classList.remove('level-flash');
    void this.el.levelName.offsetWidth;
    this.el.levelName.classList.add('level-flash');
    if (this.el.levelPrev) {
      const canPrev = this.selectedLevel > 0
        && this.profile.isSectorUnlocked(this.selectedLevel);
      this.el.levelPrev.disabled = !canPrev;
    }
    if (this.el.levelNext) {
      const canNext = this.selectedLevel < LEVELS.length - 1
        && this.profile.isSectorUnlocked(this.selectedLevel + 2);
      this.el.levelNext.disabled = !canNext;
    }
  }

  beginCountdown() {
    if (this.pendingStyle) {
      this.settings.setEquippedStyle(this.pendingStyle);
      this.abilities = createAbilityKit(this.pendingStyle, this.audio);
      this.pendingStyle = null;
      this.syncAbilityLabels();
    }
    this.state = 'countdown';
    this.countdown = COUNTDOWN_SEC * FPS;
    this.countdownAcc = 0;
    this.lastCountdownNum = '';
    this.combatGrace = 0;
    this.clearing = false;
    this.clearWait = 0;
    this.player.beginSectorStats();
    this.tracker.beginSector();
    this.player.chain = 0;
    hideLayer(this.el.clear);
    showLayer(this.el.countdown);
    showLayer(this.el.hud, { delay: 80 });
    showLayer(this.el.abilityHud, { delay: 140 });
    this.syncHud();
  }

  start() {
    if (this.transitionLock) return;
    this.transitionLock = true;
    this.codex.hide();
    this.styleIntel.hide();
    this.combatIntel.hide();
    this.settingsUI.hide();
    this.modifierUI.hide();
    this.stylesUI.hide();
    this.challengesUI.hide();
    this.recordsUI.hide();
    this.shopUI.hide();
    this.titlesUI.hide();
    hideLayer(this.el.dead);
    hideLayer(this.el.victory);
    hideLayer(this.el.title);
    hideLayer(this.el.levelSelect);

    this.sceneFade.through(() => {
      this.player.reset();
      this.world.reset(this.selectedLevel, this.modifier);
      this.fx.reset();
      this.pendingStyle = null;
      this.tracker.beginRun(this.settings.equippedStyle, this.modifier === 'newgameplus');
      this.syncEquippedStyle();
      this.abilities.reset();
      this.audio.stopLockCharge();
      this.robotMode = false;
      this.clearing = false;
      this.frame = 0;
      this.lockWasReady = true;
      this.quickWasReady = true;
      this.dashWasReady = true;
      this.audio.play('game_start');
      this.audio.startBgm?.();
      this.beginCountdown();
      setTimeout(() => { this.transitionLock = false; }, 480);
    });
  }

  returnToMenu() {
    if (this.transitionLock) return;
    this.transitionLock = true;
    hideLayer(this.el.clear);
    hideLayer(this.el.dead);
    hideLayer(this.el.victory);
    hideLayer(this.el.hud, { ms: HUD_MS });
    hideLayer(this.el.abilityHud, { ms: HUD_MS });
    hideLayer(this.el.countdown);

    this.sceneFade.through(() => {
      this.state = 'title';
      showLayer(this.el.title);
      showLayer(this.el.levelSelect, { delay: 80 });
      this.syncLevelSelect();
      this.syncModifierUI();
      this.syncProfileStrip();
      this.syncWcStrip();
      this.audio.stopBgm?.();
      setTimeout(() => { this.transitionLock = false; }, 480);
    });
  }

  advanceSector() {
    if (this.transitionLock) return;
    this.transitionLock = true;
    hideLayer(this.el.clear);

    this.sceneFade.through(() => {
      this.player.reset();
      this.abilities.reset();
      this.robotMode = false;
      this.world.nextLevel();
      this.audio.play('sector_advance');
      this.beginCountdown();
      setTimeout(() => { this.transitionLock = false; }, 480);
    });
  }

  die() {
    this.state = 'dead';
    this.transitionLock = true;
    this.fx.death(this.player.x, this.player.y);
    const prevEndlessBest = this.profile.stats.bestEndlessWave;
    const prevUnlockCb = this.tracker.onUnlock;
    this.tracker.onUnlock = null;
    const unlocksBefore = this.tracker.pendingUnlocks.length;
    this.tracker.onDeath(this.world);
    const deathUnlocks = this.tracker.pendingUnlocks.slice(unlocksBefore);
    this.tracker.onUnlock = prevUnlockCb;
    this.syncProfileStrip();
    this.syncWcStrip();
    const summary = this.sectorSummary();
    if (summary.endless) {
      summary.endlessSurvived = this.world.endlessCleared;
    }
    this.fillSummaryUI('dead', summary, {
      motivation: this.tracker.getDeathMotivation(this.world, prevEndlessBest),
    });

    hideLayer(this.el.hud, { ms: HUD_MS });
    hideLayer(this.el.abilityHud, { ms: HUD_MS });
    hideLayer(this.el.clear);
    hideLayer(this.el.countdown);

    this.sceneFade.fadeTo(0.75);
    setTimeout(() => {
      hideLayer(this.el.title);
      showLayer(this.el.dead, { delay: 40 });
      if (this.modifier !== 'endless') {
        showLayer(this.el.levelSelect, { delay: 100 });
        this.syncLevelSelect();
      }
      this.sceneFade.fadeTo(0);
      setTimeout(() => { this.transitionLock = false; }, 200);
      for (const u of deathUnlocks) this.onUnlock(u);
    }, 320);
  }

  syncAbilityHud() {
    const hud1 = this.abilities.ability1Hud();
    const hud2 = this.abilities.ability2Hud(this.player);

    if (hud1.ready && !this.lockWasReady) this.audio.play('ability_ready');
    if (hud2.ready && !this.quickWasReady) this.audio.play('ability_ready');
    this.lockWasReady = hud1.ready;
    this.quickWasReady = hud2.ready;

    const lockPct = Math.round(hud1.ratio * 100);
    if (this._hudCache.lockPct !== lockPct) {
      this.el.lockCdBar.style.width = `${lockPct}%`;
      this._hudCache.lockPct = lockPct;
    }
    if (this._hudCache.lockText !== hud1.text) {
      this.el.lockCdText.textContent = hud1.text;
      this._hudCache.lockText = hud1.text;
    }
    const lockReady = hud1.ready;
    const lockCharging = hud1.mode === 'charging';
    const lockActive = hud1.mode === 'active';
    if (this._hudCache.lockReady !== lockReady) {
      this.el.lockCdText.classList.toggle('ready', lockReady);
      this._hudCache.lockReady = lockReady;
    }
    if (this._hudCache.lockCharging !== lockCharging) {
      this.el.lockCdText.classList.toggle('charging', lockCharging);
      this._hudCache.lockCharging = lockCharging;
    }
    if (this._hudCache.lockActive !== lockActive) {
      this.el.lockCdText.classList.toggle('active', lockActive);
      this._hudCache.lockActive = lockActive;
    }

    const quickPct = Math.round(hud2.ratio * 100);
    if (this._hudCache.quickPct !== quickPct) {
      this.el.quickCdBar.style.width = `${quickPct}%`;
      this._hudCache.quickPct = quickPct;
    }
    if (this._hudCache.quickText !== hud2.text) {
      this.el.quickCdText.textContent = hud2.text;
      this._hudCache.quickText = hud2.text;
    }
    const quickReady = hud2.ready;
    const quickActive = hud2.mode === 'active';
    if (this._hudCache.quickReady !== quickReady) {
      this.el.quickCdText.classList.toggle('ready', quickReady);
      this._hudCache.quickReady = quickReady;
    }
    if (this._hudCache.quickActive !== quickActive) {
      this.el.quickCdText.classList.toggle('active', quickActive);
      this._hudCache.quickActive = quickActive;
    }
  }

  syncHud() {
    let levelText;
    if (this.world.isEndless()) {
      const mut = this.world.mutatorLabel();
      levelText = mut
        ? `Wave ${this.world.endlessWave} · ${mut}`
        : `Survived ${this.world.endlessCleared}`;
    } else {
      levelText = `${this.world.levelIdx + 1} · ${this.world.levelName()}`;
    }
    const timerText = this.world.enemiesLeft() === 0
      ? 'CLEAR'
      : this.world.isEndless()
        ? `Wave ${this.world.endlessWave} · ${this.world.enemiesLeft()} enemies`
        : `${this.world.enemiesLeft()} enemies`;
    const chainText = this.player.chain > 0 ? `CHAIN ×${this.player.chain}` : '';
    const weaveWindow = P.perfectWindow + (this.player.perfectWindowExt || 0);
    const inWeave = this.player.dashing
      && this.player.dashFrame >= 1
      && this.player.dashFrame <= weaveWindow;
    const weaveHintText = inWeave
      ? `WEAVE ${Math.floor(this.player.dashFrame)}/${weaveWindow}`
      : '';
    const ready = this.player.dashCD <= 0 && !this.player.dashing;
    const dashText = !ready && this.player.dashCD > 0
      ? `DASH ${Math.ceil(this.player.dashCD / FPS)}s`
      : ready ? 'DASH READY' : 'DASH';

    if (this._hudCache.level !== levelText) {
      this.el.level.textContent = levelText;
      this._hudCache.level = levelText;
    }
    if (this._hudCache.timer !== timerText) {
      this.el.timer.textContent = timerText;
      this._hudCache.timer = timerText;
    }
    if (this._hudCache.chain !== chainText) {
      this.el.chain.textContent = chainText;
      this._hudCache.chain = chainText;
    }
    if (this.el.chain) {
      const chainPulse = this.player.chain >= 5;
      if (this._hudCache.chainPulse !== chainPulse) {
        this.el.chain.classList.toggle('chain-pulse', chainPulse);
        this._hudCache.chainPulse = chainPulse;
      }
      const chainDecaying = this.player.chain > 0
        && this.player.chainDecayFrames > CHAIN_DECAY_FRAMES * 0.65;
      if (this._hudCache.chainDecay !== chainDecaying) {
        this.el.chain.classList.toggle('chain-decay', chainDecaying);
        this._hudCache.chainDecay = chainDecaying;
      }
    }
    if (this.el.weaveHint) {
      if (this._hudCache.weaveHint !== weaveHintText) {
        this.el.weaveHint.textContent = weaveHintText;
        this.el.weaveHint.classList.toggle('hide', !weaveHintText);
        this._hudCache.weaveHint = weaveHintText;
      }
    }
    let parHintText = '';
    if ((this.state === 'play' || this.state === 'countdown')
      && !this.world.isEndless()
      && this.modifier !== 'endless') {
      const sectorNum = this.world.levelIdx + 1;
      const meta = SECTOR_META[sectorNum];
      if (meta) {
        const weavesNeeded = Math.max(0, 3 - this.player.sectorPerfects);
        const dashesLeft = meta.maxDashes - this.player.sectorDashes;
        if (weavesNeeded <= 2 && dashesLeft >= 0 && dashesLeft <= 4) {
          parHintText = `S: ${weavesNeeded} weave · ≤${meta.maxDashes} dash`;
        }
      }
    }
    if (this.el.parHint) {
      if (this._hudCache.parHint !== parHintText) {
        this.el.parHint.textContent = parHintText;
        this.el.parHint.classList.toggle('hide', !parHintText);
        this._hudCache.parHint = parHintText;
      }
    }
    if (this._hudCache.dash !== dashText) {
      this.el.dash.textContent = dashText;
      this._hudCache.dash = dashText;
    }
    if (this._hudCache.dashReady !== ready) {
      this.el.dash.classList.toggle('ready', ready);
      this._hudCache.dashReady = ready;
    }
    this.dashWasReady = ready;
    this.syncAbilityHud();

    if (this.state === 'countdown') {
      const sec = Math.ceil(this.countdown / FPS);
      const label = sec > 0 ? String(sec) : 'GO';
      if (label !== this.lastCountdownNum) {
        this.lastCountdownNum = label;
        this.el.countdownNum.textContent = label;
        this.el.countdownNum.classList.remove('pop');
        void this.el.countdownNum.offsetWidth;
        this.el.countdownNum.classList.add('pop');
        if (label === 'GO') this.audio.play('countdown_go');
        else this.audio.play('countdown_tick');
      }
    }
  }

  tickCountdown() {
    this.countdown--;
    if (this.countdown <= 0) {
      this.state = 'play';
      this.combatGrace = COMBAT_GRACE_FRAMES;
      hideLayer(this.el.countdown);
      this.fx.flash = 4;
    }
    this.syncHud();
  }

  updateCountdownGameplay(timeScale = 1) {
    if (this.input.wantRobotToggle()) {
      this.robotMode = !this.robotMode;
    }

    const ctrl = this.input;
    this.player.update(ctrl, this.settings, timeScale);
    if (this.player.consumeDashStopFx()) {
      this.fx.dashStomp(this.player.x, this.player.y);
    }
    this.world.update(this.player, false, timeScale, this.audio);
    this.fx.tickParts(timeScale);
    this.syncHud();
    this.frame++;
  }

  activeCtrl() {
    if (this.robotMode && (this.state === 'play' || this.state === 'countdown')) {
      this.robot.compute(this.player, this.world, this.abilities);
      return this.robot;
    }
    return this.input;
  }

  update(timeScale = 1) {
    if (this.input.wantRobotToggle()) {
      this.robotMode = !this.robotMode;
    }

    if (this.state === 'title') {
      if (this.menuBlocked() || this.transitionLock) return;
      if (this.modifier !== 'endless') {
        if (this.input.wantLevelPrev()) this.changeLevel(-1);
        if (this.input.wantLevelNext()) this.changeLevel(1);
      }
      if (this.input.wantStart()) {
        this.audio.unlock();
        this.audio.play('menu_confirm');
        this.start();
      }
      return;
    }

    if (this.state === 'dead') {
      if (this.menuBlocked() || this.transitionLock) return;
      if (this.modifier !== 'endless') {
        if (this.input.wantLevelPrev()) this.changeLevel(-1);
        if (this.input.wantLevelNext()) this.changeLevel(1);
      }
      if (this.input.wantStart()) {
        this.audio.unlock();
        this.audio.play('menu_confirm');
        this.start();
      }
      return;
    }

    if (this.state === 'clear') {
      if (this.transitionLock || this.isSaveReminderOpen()) return;
      if (this.input.wantNext()) {
        this.audio.play('menu_confirm');
        this.advanceSector();
        return;
      }
      return;
    }

    if (this.state === 'victory') {
      return;
    }

    if (this.state === 'countdown') {
      return;
    }

    const ctrl = this.activeCtrl();
    const moveScale = timeScale * (this.abilities.lockSlowMult?.() ?? 1);
    const combatActive = this.combatGrace <= 0;

    this.player.update(ctrl, this.settings, moveScale);
    if (this.player.consumeDashStopFx()) {
      this.fx.dashStomp(this.player.x, this.player.y);
    }

    if (ctrl.wantLock() && !this.world.weaveOnly()) {
      if (this.abilities.tryAbility1(this.world, this.player, this.robotMode, this.fx)) {
        this.tracker.onAbilityUse();
      }
    }
    if (ctrl.wantQuick() && !this.world.weaveOnly()) {
      if (this.abilities.tryAbility2(this.player, this.world, this.robotMode, this.fx)) {
        this.tracker.onAbilityUse();
      }
    }

    this.abilities.update(this.world, this.player, this.fx, timeScale);

    this.world.update(this.player, combatActive, timeScale, this.audio);
    if (combatActive) {
      this.world.cullPerfect(this.player, this.fx);
    }

    if (this.combatGrace > 0) this.combatGrace--;

    const col = combatActive ? this.world.checkCollisions(this.player, this.fx) : { dead: false };
    if (col.dead) {
      this.player.die();
      this.die();
      return;
    }

    if (this.world.cleared && this.state === 'play' && !this.clearing) {
      this.clearing = true;
      this.clearWait = CLEAR_CELEBRATION_FRAMES;
      this.fx.sectorClear(this.player.x, this.player.y);
      this.audio.play('sector_clear');
    }

    if (this.clearing) {
      this.clearWait--;
      if (this.clearWait <= 0) {
        const wasCampaignComplete = this.profile.campaignComplete;
        const meta = this.tracker.onSectorClear(this.world, this.player);
        this.syncProfileStrip();
        this.syncWcStrip();
        const summary = this.sectorSummary();
        if (summary.endless) {
          summary.endlessSurvived = this.world.endlessCleared + 1;
        }

        if (!wasCampaignComplete && this.profile.campaignComplete && !this.world.isEndless()) {
          this.state = 'victory';
          if (this.el.victoryCredits) {
            this.el.victoryCredits.textContent = `Grade ${meta.grade ?? '—'}`;
          }
          if (this.el.victoryUnlocks) {
            this.el.victoryUnlocks.textContent = meta.unlocks?.length
              ? meta.unlocks.map((u) => u.label || u.title).join(' · ')
              : 'New Game+ unlocked';
          }
          hideLayer(this.el.hud, { ms: HUD_MS });
          hideLayer(this.el.abilityHud, { ms: HUD_MS });
          showLayer(this.el.victory);
          this.maybeShowSaveReminder();
          this.sceneFade.fadeTo(0.75);
          this.syncHud();
          this.frame++;
          return;
        }

        this.state = 'clear';
        this.fillSummaryUI('clear', summary, {
          grade: meta.grade,
          pbDelta: meta.pbDelta,
          nextHint: meta.nextHint,
          unlocks: meta.unlocks,
        });
        hideLayer(this.el.hud, { ms: HUD_MS });
        hideLayer(this.el.abilityHud, { ms: HUD_MS });
        showLayer(this.el.clear);
        this.maybeShowSaveReminder();
        this.sceneFade.fadeTo(0.75);
      }
      this.syncHud();
      this.frame++;
      return;
    }

    this.syncHud();
    this.frame++;
  }

  loop(now) {
    if (!this.last) this.last = now;
    let dt = now - this.last;
    this.last = now;
    if (dt > 100) dt = FRAME;
    const dtSec = dt / 1000;
    this.updateTimeScale(dtSec);

    if (this.state === 'countdown') {
      this.countdownAcc += dt;
      while (this.countdownAcc >= FRAME) {
        this.tickCountdown();
        this.countdownAcc -= FRAME;
      }
    }

    this.acc += dt;

    while (this.acc >= FRAME) {
      const ts = this.timeScale;
      const freeze = (this.state === 'play' || this.state === 'countdown') && this.fx.tick(ts);
      if (!freeze) {
        if (this.state === 'countdown') {
          this.updateCountdownGameplay(ts);
        } else {
          this.update(ts);
        }
      }
      this.input.end();
      this.acc -= FRAME;
    }

    this.sceneFade.update(dtSec);

    if (this.state === 'play' || this.state === 'countdown' || this.state === 'clear') {
      const ctrl = (this.state === 'play' || this.state === 'countdown')
        ? this.activeCtrl()
        : this.input;
      const countdownT = this.state === 'countdown'
        ? 1 - (this.countdown % FPS) / FPS
        : 0;
      this.render.draw({
        player: this.player,
        world: this.world,
        fx: this.fx,
        abilities: this.abilities,
        robotMode: this.robotMode,
        countdown: this.state === 'countdown',
        countdownT,
        timeScale: this.timeScale,
        steer: ctrl.axis(),
      });
    } else if (this.state === 'title' || this.state === 'dead') {
      this._menuBgTick += dt;
      if (this._menuBgTick >= 800) {
        this.render.invalidateMenuBackdrop();
        this._menuBgTick = 0;
      }
      this.render.drawMenuBackdrop(this.render.ctx);
    }

    this.sceneFade.draw(this.render.ctx);
    requestAnimationFrame((t) => this.loop(t));
  }
}

new Game();
