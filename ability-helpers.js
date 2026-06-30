export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function damageEnemy(world, fx, type, ref, pct, x, y, audio = null) {
  if (!ref || ref.hp <= 0) return false;
  ref.hp -= ref.maxHp * pct;
  const killed = ref.hp <= 0;
  if (killed) {
    fx.killFrameAt(x ?? ref.x, y ?? ref.y, true);
    world.removeEnemy(type, ref);
    audio?.play('quick_kill');
  } else {
    fx.quickHit(x ?? ref.x, y ?? ref.y);
  }
  return killed;
}

export function damageEnemiesInRadius(world, fx, px, py, radius, pct, audio = null) {
  let hit = false;
  for (const e of world.allEnemies()) {
    const er = e.r || 14;
    if (dist(px, py, e.x, e.y) > radius + er) continue;
    damageEnemy(world, fx, e.type, e.ref, pct, e.x, e.y, audio);
    hit = true;
  }
  return hit;
}

export function clearBulletsInRadius(world, px, py, radius, fx) {
  for (const b of world.bullets) {
    if (b.frozen) continue;
    if (dist(px, py, b.x, b.y) <= radius + b.r) {
      fx.pop(b.x, b.y);
      b.life = 0;
    }
  }
  world.bullets = world.bullets.filter(b => b.life > 0);
}

export function enemiesInCone(world, px, py, dirX, dirY, range, halfAngle) {
  const hits = [];
  for (const e of world.allEnemies()) {
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy);
    const er = e.r || 14;
    if (d > range + er) continue;
    const nd = norm(dx, dy);
    const dot = nd.x * dirX + nd.y * dirY;
    if (dot >= Math.cos(halfAngle)) hits.push(e);
  }
  return hits;
}

export function clearBulletsInCone(world, px, py, dirX, dirY, range, halfAngle, fx) {
  for (const b of world.bullets) {
    if (b.frozen) continue;
    const dx = b.x - px;
    const dy = b.y - py;
    const d = Math.hypot(dx, dy);
    if (d > range + b.r) continue;
    const nd = norm(dx, dy);
    const dot = nd.x * dirX + nd.y * dirY;
    if (dot >= Math.cos(halfAngle)) {
      fx.pop(b.x, b.y);
      b.life = 0;
    }
  }
  world.bullets = world.bullets.filter(b => b.life > 0);
}
