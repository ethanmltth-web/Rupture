/** Cosmetic Weave Coin shop — no gameplay power. */

export const SHOP_ITEMS = [
  { id: 'tint_crimson', kind: 'tint', cost: 80, label: 'Crimson Arena', desc: 'Deep red arena wash.' },
  { id: 'tint_void', kind: 'tint', cost: 100, label: 'Void Arena', desc: 'Cool violet arena wash.' },
  { id: 'tint_amber', kind: 'tint', cost: 120, label: 'Amber Arena', desc: 'Warm gold arena wash.' },
  { id: 'badge_veteran', kind: 'badge', cost: 50, label: 'Veteran', desc: 'Title strip suffix: VET.' },
  { id: 'badge_weaver', kind: 'badge', cost: 50, label: 'Weaver', desc: 'Title strip suffix: WVR.' },
];

export const SHOP_BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));

export const TINT_CLASS = {
  tint_crimson: 'arena-tint-crimson',
  tint_void: 'arena-tint-void',
  tint_amber: 'arena-tint-amber',
};

export const BADGE_SUFFIX = {
  badge_veteran: 'VET',
  badge_weaver: 'WVR',
};
