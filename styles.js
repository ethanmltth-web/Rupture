export const DEFAULT_EQUIPPED_STYLE = 'linear_sniper';

export const SKILL_LEVELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const STYLES = {
  linear_sniper: {
    id: 'linear_sniper',
    name: 'Linear Sniper',
    skillLevel: 'medium',
    accent: '#ff3c50',
    price: 0,
    default: true,
    locked: false,
  },
  pulse_breaker: {
    id: 'pulse_breaker',
    name: 'Pulse Breaker',
    skillLevel: 'low',
    accent: '#ff8040',
    price: 0,
    default: false,
    locked: false,
  },
  phase_runner: {
    id: 'phase_runner',
    name: 'Phase Runner',
    skillLevel: 'low',
    accent: '#e8f4ff',
    price: 0,
    default: false,
    locked: false,
  },
  arc_scatter: {
    id: 'arc_scatter',
    name: 'Arc Scatter',
    skillLevel: 'low',
    accent: '#ffd700',
    price: 0,
    default: false,
    locked: false,
  },
  null_suppressor: {
    id: 'null_suppressor',
    name: 'Null Suppressor',
    skillLevel: 'medium',
    accent: '#9080ff',
    price: 0,
    default: false,
    locked: false,
  },
  overclock: {
    id: 'overclock',
    name: 'Overclock',
    skillLevel: 'high',
    accent: '#ff3c50',
    price: 0,
    default: false,
    locked: false,
  },
};

export const STYLE_IDS = Object.keys(STYLES);
