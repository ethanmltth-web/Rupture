/** Equippable display titles — unlocked via achievements, challenges, and shop badges. */

import { ACHIEVEMENTS } from './achievements.js';
import { CHALLENGES } from './challenges.js';
import { SHOP_ITEMS } from './shop.js';

function buildCatalog() {
  const titles = [];
  for (const a of ACHIEVEMENTS) {
    titles.push({
      id: `ach:${a.id}`,
      label: a.title,
      desc: a.desc,
      source: 'achievement',
      sourceId: a.id,
    });
  }
  for (const c of CHALLENGES) {
    titles.push({
      id: `ch:${c.id}`,
      label: c.title,
      desc: c.desc,
      source: 'challenge',
      sourceId: c.id,
    });
  }
  for (const item of SHOP_ITEMS) {
    if (item.kind !== 'badge') continue;
    titles.push({
      id: `badge:${item.id}`,
      label: item.label,
      desc: item.desc,
      source: 'shop',
      sourceId: item.id,
    });
  }
  return titles;
}

export const TITLES = buildCatalog();
export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));
