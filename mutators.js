/** Run mutators — endless wave variety and daily challenge modifiers. */

export const MUTATORS = {
  glass_cannon: {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    desc: 'Perfect weave damage ×2, but enemy bullets move 35% faster.',
  },
  double_density: {
    id: 'double_density',
    name: 'Double Density',
    desc: 'Twice as many enemies spawn each wave.',
  },
  weave_only: {
    id: 'weave_only',
    name: 'Weave Only',
    desc: 'Abilities disabled — perfect weaves only.',
  },
};

export const MUTATOR_IDS = ['glass_cannon', 'double_density', 'weave_only'];

export function pickMutatorForWave(wave) {
  if (wave < 3) return null;
  const idx = (wave * 7919 + 3) % MUTATOR_IDS.length;
  return MUTATOR_IDS[idx];
}
