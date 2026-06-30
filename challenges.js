/** Progression challenges — unlock styles, sectors, and modifiers. */

export const CHALLENGES = [
  {
    id: 'first_clear',
    title: 'First Blood',
    desc: 'Clear any sector.',
    type: 'flag',
    wc: 10,
    reward: { kind: 'style', id: 'pulse_breaker' },
  },
  {
    id: 'perfect_10_run',
    title: 'Weave Five',
    desc: 'Land 5 perfect weaves in a single run.',
    type: 'counter',
    target: 5,
    counterKey: 'run_perfects',
    wc: 20,
    reward: { kind: 'sector', id: 4 },
  },
  {
    id: 'sector_3_clear',
    title: 'Spiral Breaker',
    desc: 'Clear sector 3 — SPIRAL.',
    type: 'sector_clear',
    sector: 3,
    wc: 15,
    reward: { kind: 'style', id: 'phase_runner' },
  },
  {
    id: 'weave_5_sector',
    title: 'Clean Sector',
    desc: 'Land 5 perfect weaves in one sector without dying.',
    type: 'counter',
    target: 5,
    counterKey: 'sector_perfects',
    wc: 15,
    reward: { kind: 'style', id: 'arc_scatter' },
  },
  {
    id: 'sector_5_clear',
    title: 'Burst Protocol',
    desc: 'Clear sector 5 — BURST.',
    type: 'sector_clear',
    sector: 5,
    wc: 20,
    reward: { kind: 'modifier', id: 'endless' },
  },
  {
    id: 'sector_7_clear',
    title: 'Sniper Silence',
    desc: 'Clear sector 7 — SNIPER.',
    type: 'sector_clear',
    sector: 7,
    wc: 25,
    reward: { kind: 'style', id: 'null_suppressor' },
  },
  {
    id: 'sector_10_clear',
    title: 'Rupture',
    desc: 'Clear sector 10 — RUPTURE.',
    type: 'sector_clear',
    sector: 10,
    wc: 30,
    reward: { kind: 'style', id: 'overclock' },
  },
  {
    id: 'endless_wave_5',
    title: 'Endless Five',
    desc: 'Survive 5 endless waves.',
    type: 'endless_wave',
    target: 5,
    wc: 25,
    reward: { kind: 'style', id: 'overclock' },
  },
  {
    id: 'grade_s_any',
    title: 'S-Rank',
    desc: 'Earn an S grade on any sector.',
    type: 'flag',
    wc: 15,
    reward: null,
  },
];

export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export function challengeForStyle(styleId) {
  return CHALLENGES.find((c) => c.reward?.kind === 'style' && c.reward.id === styleId);
}

export function challengeProgress(challenge, profile, runState = {}) {
  if (profile.isChallengeComplete(challenge.id)) return { current: challenge.target ?? 1, target: challenge.target ?? 1, done: true };

  switch (challenge.type) {
    case 'counter': {
      const key = challenge.counterKey;
      if (key === 'run_perfects') {
        return { current: runState.runPerfects ?? 0, target: challenge.target, done: false };
      }
      if (key === 'sector_perfects') {
        return { current: runState.sectorPerfects ?? 0, target: challenge.target, done: false };
      }
      const current = profile.getProgress(challenge.id);
      return { current, target: challenge.target, done: false };
    }
    case 'endless_wave': {
      const current = Math.max(profile.getProgress(challenge.id), runState.endlessWave ?? 0);
      return { current, target: challenge.target, done: false };
    }
    default:
      return { current: 0, target: 1, done: false };
  }
}
