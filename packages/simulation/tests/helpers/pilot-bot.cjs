const { TILE, DIRS } = require('../../dist');
// This pilot drives only production InputState values. It never writes actors or map state.
module.exports = function playthrough(g, maxSeconds = 120) {
  const boss = g.enemies.find((e) => e.boss);
  const tile = (p) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
  function toward(p, target) {
    if (Math.hypot(p.x - target.x, p.y - target.y) < 8) return {};
    const start = tile(p),
      end = tile(target),
      queue = [{ ...start, path: [] }],
      seen = new Set([`${start.x},${start.y}`]);
    let path;
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      if (cur.x === end.x && cur.y === end.y) {
        path = cur.path;
        break;
      }
      for (let d = 0; d < 4; d++) {
        const x = cur.x + DIRS[d][0],
          y = cur.y + DIRS[d][1],
          key = `${x},${y}`;
        if (seen.has(key) || !g.free((x + 0.5) * TILE, (y + 0.5) * TILE, p.r, p)) continue;
        seen.add(key);
        queue.push({ x, y, path: [...cur.path, { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }] });
      }
    }
    if (!path) return {};
    const next = path[0] || target;
    let dx = next.x - p.x,
      dy = next.y - p.y;
    // Reach the corridor center before turning.
    if (Math.abs(dx) > 30 && Math.abs(dy) > 7) dx = 0;
    else if (Math.abs(dy) > 30 && Math.abs(dx) > 7) dy = 0;
    return { dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0 };
  }
  function combat(p, target, i) {
    let d = g.lineOfFire(p, target),
      dist = Math.hypot(p.x - target.x, p.y - target.y);
    if (d >= 0 && dist < 400) {
      return {
        ...(p.dir !== d ? { dir: d } : {}),
        fire: true,
        melee: dist < 120,
        ultimate: i === 1,
      };
    }
    const candidates = [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
    ]
      .map(([dx, dy]) => ({
        x: (Math.floor(target.x / TILE) + dx + 0.5) * TILE,
        y: (Math.floor(target.y / TILE) + dy + 0.5) * TILE,
      }))
      .filter((t) => g.free(t.x, t.y, p.r, p))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    return candidates.length ? toward(p, candidates[0]) : {};
  }
  let phases = new Set([boss.encounter.phaseId]);
  let channels = 0,
    lastOpen = 0;
  for (let tick = 0; tick < maxSeconds * 20 && g.status === 'playing'; tick++) {
    const inputs = g.players.map((p, i) => {
      let action = {};
      const friend = g.players[1 - i];
      if (friend.hp <= 0) action = toward(p, friend);
      else if (!g.cooperation.puzzle.solved)
        action = toward(p, i ? g.cooperation.puzzle.bluePad : g.cooperation.puzzle.redPad);
      else {
        const normal = g.enemies
          .filter((e) => e.hp > 0 && !e.boss)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (normal) action = combat(p, normal, i);
        else if (boss.encounter.shielded) action = toward(p, g.cooperation.pads[i]);
        else action = combat(p, boss, i);
      }
      if (p.hp < 70 && p.hp > 0) action.heal = true;
      if (i === 0 && boss.encounter.telegraph) action.ultimate = true;
      return action;
    });
    g.step(0.05, inputs);
    phases.add(boss.encounter.phaseId);
    if (g.cooperation.openFor > lastOpen) channels++;
    lastOpen = g.cooperation.openFor;
  }
  return { phases: [...phases], channels };
};
