const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, campaign, validateMap, BOSSES, LEVELS, TILE } = require('../dist');
const advance = (g, seconds, inputs = []) => {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) g.step(0.05, inputs);
};
const at = (actor, point) => {
  actor.x = point.x;
  actor.y = point.y;
};
function mechanismGame(m = 0, stage = 2, options = {}) {
  const g = new Game(campaign(m, stage), { coop: true, ...options });
  for (const e of g.enemies) {
    e.fire = 10000;
    e.think = 10000;
  }
  for (const p of g.players) p.shield = 10000;
  return g;
}
function unlockEntry(g) {
  at(g.players[0], g.cooperation.puzzle.redPad);
  at(g.players[1], g.cooperation.puzzle.bluePad);
  advance(g, 1.55);
  assert.equal(g.cooperation.puzzle.solved, true);
}
function expose(g) {
  at(g.players[0], g.cooperation.pads[0]);
  at(g.players[1], g.cooperation.pads[1]);
  advance(g, 1.55);
  assert.ok(g.cooperation.openFor > 0);
}
function reachable(g, from, target) {
  const q = [{ x: Math.floor(from.x / TILE), y: Math.floor(from.y / TILE) }],
    seen = new Set();
  for (let i = 0; i < q.length; i++) {
    const p = q[i],
      key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.x === Math.floor(target.x / TILE) && p.y === Math.floor(target.y / TILE)) return true;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
      if (g.pass(p.x + dx, p.y + dy)) q.push({ x: p.x + dx, y: p.y + dy });
  }
  return false;
}

test('all twelve authored maps validate; their stable IDs and boss combinations are distinct', () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 12);
  for (let m = 0; m < 4; m++)
    for (let s = 0; s < 3; s++) assert.doesNotThrow(() => validateMap(campaign(m, s)));
  assert.equal(
    new Set(
      Object.values(BOSSES).map((b) =>
        JSON.stringify(b.phases.map((p) => p.attacks.map((a) => a.pattern))),
      ),
    ).size,
    4,
  );
});
test('entry puzzles never solve at spawn and gates block both movement and projectiles until two living players channel', () => {
  for (const [m, s] of [
    [0, 2],
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
    [3, 1],
    [3, 2],
  ]) {
    const g = mechanismGame(m, s),
      c = g.cooperation,
      gate = c.gates[0];
    advance(g, 3);
    assert.equal(c.puzzle.solved, false, `${m + 1}-${s + 1} spawn must not solve`);
    for (const p of g.players)
      for (const pad of [c.puzzle.redPad, c.puzzle.bluePad])
        assert.ok(Math.hypot(p.x - pad.x, p.y - pad.y) > TILE);
    assert.equal(reachable(g, g.players[0], c.puzzle.redPad), true);
    assert.equal(reachable(g, g.players[1], c.puzzle.bluePad), true);
    assert.equal(g.pass(gate.x, gate.y), false);
    assert.equal(g.free((gate.x + 0.5) * TILE, (gate.y + 0.5) * TILE), false);
    assert.equal(reachable(g, g.players[0], g.enemies[0]), false);
    at(g.players[0], { x: (gate.x + 0.5) * TILE, y: (gate.y + 1.5) * TILE });
    g.players[0].dir = 0;
    g.shoot(g.players[0]);
    advance(g, 0.5);
    assert.equal(
      g.bullets.some((b) => b.team === 1),
      false,
    );
    unlockEntry(g);
    assert.equal(g.pass(gate.x, gate.y), true);
    assert.equal(reachable(g, g.players[0], g.enemies[0]), true);
    assert.ok(c.gates.every((gate) => gate.open));
    const snapshot = JSON.parse(JSON.stringify(c));
    assert.deepEqual(snapshot.gates, c.gates);
    // Opening the gate is permanent, so a missed timing window cannot strand a partner.
    at(g.players[0], { x: 120, y: 120 });
    at(g.players[1], { x: 240, y: 120 });
    advance(g, 2);
    assert.ok(c.gates.every((gate) => gate.open));
  }
});
test('one player, a downed teammate or abandoned channel cannot substitute for simultaneous cooperation', () => {
  const solo = mechanismGame(0, 2, { coop: false }),
    p = solo.players[0],
    c = solo.cooperation;
  for (let i = 0; i < 100; i++) {
    at(p, i % 2 ? c.puzzle.redPad : c.puzzle.bluePad);
    solo.step(0.05);
  }
  assert.equal(c.puzzle.solved, false);
  const g = mechanismGame(),
    puzzle = g.cooperation.puzzle;
  at(g.players[0], puzzle.redPad);
  at(g.players[1], puzzle.bluePad);
  g.players[1].hp = 0;
  advance(g, 2);
  assert.equal(puzzle.charge, 0);
  g.players[1].hp = 100;
  advance(g, 0.8);
  assert.ok(puzzle.charge > 0);
  g.players[1].x += 60;
  g.step(0.05);
  assert.equal(puzzle.charge, 0);
  at(g.players[1], puzzle.bluePad);
  advance(g, 1.55);
  assert.equal(puzzle.solved, true);
});
test('same-character pairs can operate the entry: node colors do not silently impose roster requirements', () => {
  const g = mechanismGame(0, 2, { characters: ['Asuka', 'Asuka'] });
  unlockEntry(g);
  expose(g);
});
test('each boss has three protected phases; large hits cannot skip them and expired windows can be reopened', () => {
  for (let m = 0; m < 4; m++) {
    const g = mechanismGame(m),
      boss = g.enemies.find((e) => e.boss),
      definition = BOSSES[boss.encounter.id];
    const hp = boss.hp;
    g.damage(boss, 99999, 'p0');
    assert.equal(boss.hp, hp);
    unlockEntry(g);
    expose(g);
    assert.equal(boss.encounter.shielded, false);
    at(g.players[0], { x: g.players[0].x + 100, y: g.players[0].y });
    advance(g, g.cooperation.openFor + 0.1);
    assert.equal(boss.encounter.shielded, true);
    for (let phase = 0; phase < 3; phase++) {
      expose(g);
      const expected = phase < 2 ? boss.maxHp * definition.phases[phase + 1].threshold : 0;
      g.damage(boss, 99999, 'p0');
      assert.equal(boss.hp, expected);
      if (phase < 2) {
        assert.equal(boss.encounter.phaseIndex, phase + 1);
        assert.equal(boss.encounter.shielded, true);
        assert.equal(g.cooperation.openFor, 0);
      }
    }
    assert.equal(boss.hp, 0);
  }
});
test('boss telegraphs lock aim and describe every real bullet trajectory before firing', () => {
  for (let m = 0; m < 4; m++) {
    const g = mechanismGame(m);
    unlockEntry(g);
    const boss = g.enemies.find((e) => e.boss),
      definition = BOSSES[boss.encounter.id];
    for (let phaseIndex = 0; phaseIndex < definition.phases.length; phaseIndex++) {
      boss.encounter.phaseIndex = phaseIndex;
      for (const attack of definition.phases[phaseIndex].attacks) {
        g.bullets = [];
        boss.dir = 2;
        g.warnBoss(boss, attack);
        const warning = structuredClone(boss.encounter.telegraph);
        // Tests select this attack using its authored phase index, as the update loop does.
        boss.encounter.attackIndex = definition.phases[phaseIndex].attacks.indexOf(attack);
        assert.equal(g.bullets.length, 0);
        assert.equal(warning.remaining, attack.warning);
        assert.ok(warning.duration >= 0.9);
        at(g.players[0], { x: boss.x + 200, y: boss.y });
        g.step(0.05);
        assert.deepEqual(boss.encounter.telegraph.angles, warning.angles);
        advance(g, attack.warning);
        const bullets = g.bullets.filter((b) => b.owner === boss.id);
        assert.equal(bullets.length, warning.angles.length);
        for (let i = 0; i < bullets.length; i++) {
          assert.ok(Math.abs(bullets[i].dx - Math.cos(warning.angles[i])) < 1e-10);
          assert.ok(Math.abs(bullets[i].dy - Math.sin(warning.angles[i])) < 1e-10);
          assert.equal(bullets[i].r * 2, warning.width);
        }
      }
    }
  }
});

test('1-3 can be completed through ordinary two-player controls, including entry puzzle and all boss phases', () => {
  const playthrough = require('./helpers/pilot-bot.cjs');
  for (const difficulty of ['relaxed', 'normal', 'hard']) {
    const g = new Game(campaign(0, 2), { coop: true, difficulty, seed: 482 });
    const result = playthrough(g);
    assert.equal(g.status, 'won', `${difficulty}: two pilots should finish within 120 seconds`);
    assert.equal(g.cooperation.puzzle.solved, true);
    assert.ok(g.cooperation.gates.every((gate) => gate.open));
    assert.equal(g.cooperation.objective.state, 'complete');
    assert.equal(result.phases.length, 3);
    assert.equal(result.channels, 3);
    assert.ok(g.players.every((p) => p.stats.moved > 2000 && p.stats.damage > 0));
    assert.ok(g.players.reduce((sum, p) => sum + p.stats.taken, 0) > 0);
    assert.ok(g.enemies.every((e) => e.hp === 0));
  }
});

test('a rescuer and revived teammate can separate after overlap without allowing new collisions', () => {
  const g = mechanismGame(),
    [rescuer, teammate] = g.players;
  at(teammate, rescuer);
  teammate.hp = 0;
  advance(g, 3.1);
  assert.equal(teammate.hp, 40);
  assert.equal(rescuer.stats.rescues, 1);
  const initialX = rescuer.x;
  advance(g, 0.6, [{ dir: 3 }, {}]);
  assert.ok(rescuer.x < initialX - 34);
  assert.ok(Math.hypot(rescuer.x - teammate.x, rescuer.y - teammate.y) >= 34);
  rescuer.x = teammate.x - 40;
  assert.equal(g.move(rescuer, 8, 0), false);
});

test('later boss combinations remain reachable and completable, including recovery from a downed teammate', () => {
  const playthrough = require('./helpers/pilot-bot.cjs');
  for (let m = 1; m < 4; m++) {
    const g = new Game(campaign(m, 2), { coop: true, difficulty: 'normal', seed: 482 });
    const result = playthrough(g, 180);
    assert.equal(g.status, 'won', `${m + 1}-3 must be completable through ordinary controls`);
    assert.equal(result.phases.length, 3);
    assert.ok(result.channels >= 3);
    if (m === 3) assert.ok(g.players.some((p) => p.stats.rescues > 0));
  }
});
