import { LEVELS } from './world.js';
import { STYLES, STYLE_IDS } from './styles.js';

const DAILY_POOL = [
  { id: 'daily_clear_s1', title: 'Daily: DRIFT', desc: 'Clear sector 1 — DRIFT.', type: 'sector_clear', sector: 1 },
  { id: 'daily_clear_s3', title: 'Daily: SPIRAL', desc: 'Clear sector 3 — SPIRAL.', type: 'sector_clear', sector: 3 },
  { id: 'daily_clear_s5', title: 'Daily: BURST', desc: 'Clear sector 5 — BURST.', type: 'sector_clear', sector: 5 },
  { id: 'daily_perfects_5', title: 'Daily: Weave Five', desc: 'Land 5 perfect weaves in one sector.', type: 'sector_perfects', target: 5 },
  { id: 'daily_no_dash', title: 'Daily: No Dash', desc: 'Clear a sector without dashing.', type: 'no_dash_clear' },
  { id: 'daily_endless_3', title: 'Daily: Endless Three', desc: 'Survive 3 endless waves.', type: 'endless_wave', target: 3 },
  { id: 'daily_chain_4', title: 'Daily: Chain Four', desc: 'Reach chain ×4 in one sector.', type: 'chain', target: 4 },
  { id: 'daily_grade_a', title: 'Daily: A Rank', desc: 'Clear any sector with A rank or better.', type: 'grade_min', grade: 'A' },
  { id: 'daily_style_arc', title: 'Daily: Arc Scatter', desc: 'Clear a sector using Arc Scatter.', type: 'style_clear', styleId: 'arc_scatter' },
  { id: 'daily_style_null', title: 'Daily: Null Suppressor', desc: 'Clear a sector using Null Suppressor.', type: 'style_clear', styleId: 'null_suppressor' },
  { id: 'daily_dashes_max', title: 'Daily: Efficient', desc: 'Clear a sector using ≤8 dashes.', type: 'max_dashes', target: 8 },
];

function dateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDailyChallenge(forDate = new Date()) {
  const key = dateKey(forDate);
  const idx = hashSeed(key) % DAILY_POOL.length;
  return { ...DAILY_POOL[idx], dateKey: key };
}

export function isDailyComplete(profile, daily, runResult) {
  if (!daily || !runResult) return false;
  switch (daily.type) {
    case 'sector_clear':
      return runResult.cleared && runResult.sectorNum === daily.sector;
    case 'sector_perfects':
      return runResult.cleared && runResult.perfects >= daily.target;
    case 'no_dash_clear':
      return runResult.cleared && runResult.dashes === 0;
    case 'endless_wave':
      return runResult.endlessWave >= daily.target;
    case 'chain':
      return runResult.maxChain >= daily.target;
    case 'grade_min': {
      const ranks = { S: 4, A: 3, B: 2, C: 1 };
      return runResult.cleared && ranks[runResult.grade] >= ranks[daily.grade];
    }
    case 'style_clear':
      return runResult.cleared && runResult.styleId === daily.styleId;
    case 'max_dashes':
      return runResult.cleared && runResult.dashes <= daily.target;
    default:
      return false;
  }
}

export function dailyRewardWC() {
  return 20;
}

export { DAILY_POOL, LEVELS, STYLES, STYLE_IDS };
