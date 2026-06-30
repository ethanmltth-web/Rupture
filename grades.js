import { FPS } from './constants.js';

/** Par times (seconds) and dash budgets per sector for letter grades. */
export const SECTOR_META = {
  1: { parSec: 18, maxDashes: 12 },
  2: { parSec: 22, maxDashes: 14 },
  3: { parSec: 26, maxDashes: 14 },
  4: { parSec: 30, maxDashes: 16 },
  5: { parSec: 34, maxDashes: 16 },
  6: { parSec: 38, maxDashes: 18 },
  7: { parSec: 42, maxDashes: 18 },
  8: { parSec: 48, maxDashes: 20 },
  9: { parSec: 55, maxDashes: 22 },
  10: { parSec: 65, maxDashes: 24 },
};

const GRADE_RANK = { S: 4, A: 3, B: 2, C: 1 };

export function gradeSector(sectorNum, { timeFrames, perfects, dashes }) {
  const meta = SECTOR_META[sectorNum] || SECTOR_META[1];
  const par = meta.parSec * FPS;

  if (timeFrames <= par && perfects >= 3 && dashes <= meta.maxDashes) return 'S';
  if (timeFrames <= par * 1.35 || perfects >= 5) return 'A';
  if (timeFrames <= par * 1.75) return 'B';
  return 'C';
}

export function gradeRank(grade) {
  return GRADE_RANK[grade] ?? 0;
}

export function creditsForClear(grade, perfects) {
  let base = 10;
  if (grade === 'S') base += 50;
  else if (grade === 'A') base += 25;
  else if (grade === 'B') base += 10;
  return base + perfects * 2;
}
