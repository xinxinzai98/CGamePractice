const test = require('node:test'),
  assert = require('node:assert/strict');
const old = require('../../../web/engine.js'),
  modern = require('../dist/index.js'),
  oldProgression = require('../../../web/progression.js'),
  oldEquipment = require('../../../web/equipment.js');
const serial = (v) => JSON.parse(JSON.stringify(v));
const state = (g) =>
  serial({
    time: g.time,
    status: g.status,
    score: g.score,
    kills: g.kills,
    seed: g.seed,
    players: g.players.map(({ upgrades, ...p }) => p),
    enemies: g.enemies,
    bullets: g.bullets,
    effects: g.effects,
    cooperation: g.cooperation,
  });
test('all 12 maps, skill trees, equipment and normalized profiles match prototype', () => {
  for (let m = 0; m < 4; m++)
    for (let s = 0; s < 3; s++) assert.deepEqual(modern.campaign(m, s), old.campaign(m, s));
  assert.deepEqual(modern.Progression.TREES, oldProgression.TREES);
  assert.deepEqual(modern.Equipment.ITEMS, oldEquipment.ITEMS);
  for (const raw of [
    {},
    {
      characters: { Asuka: { xp: 1200, nodes: ['a-cannon-1', 'a-cannon-2'] } },
      coins: 40,
      inventory: ['sync-relay'],
      loadouts: { Rei: { ammo: 'HESH', melee: 'blade' } },
      records: { history: [], wins: 2 },
      drawHistory: [],
    },
  ])
    assert.deepEqual(
      modern.Progression.migrateLegacyProfile(raw, () => {}),
      oldProgression.normalizeProfile(raw),
    );
});
test('same seeded simulation and inputs retain exact state in normal, hard and practice', () => {
  for (const options of [
    { coop: true, seed: 842, difficulty: 'normal' },
    {
      coop: true,
      seed: 912,
      difficulty: 'hard',
      nodes: { Asuka: ['a-cannon-1'], Rei: ['r-missile-1'] },
      loadouts: { Asuka: { ammo: 'HESH', melee: 'spear' } },
    },
    { coop: true, practice: true, seed: 22, gear: { Asuka: ['sync-relay'] } },
  ]) {
    const a = new old.Game(old.campaign(2, 0), options),
      b = new modern.Game(modern.campaign(2, 0), options);
    for (let i = 0; i < 900; i++) {
      const inputs = [
        {
          dir: Math.floor(i / 80) % 4,
          fire: i % 4 === 0,
          special: i % 75 === 0,
          ultimate: i % 115 === 0,
          heal: i % 110 === 0,
          melee: i % 37 === 0,
          item: i % 88 === 0,
        },
        { dir: Math.floor(i / 65) % 4, fire: true, speed: i % 99 === 0, ultimate: i % 95 === 0 },
      ];
      a.step(1 / 60, inputs);
      b.step(1 / 60, inputs);
      if (i % 100 === 0) assert.deepEqual(state(b), state(a));
    }
    assert.deepEqual(state(b), state(a));
  }
});
test('all four Boss mechanisms preserve shield, simultaneous opening and closing behavior', () => {
  for (let m = 0; m < 4; m++) {
    const a = new old.Game(old.campaign(m, 2), { coop: true }),
      b = new modern.Game(modern.campaign(m, 2), { coop: true });
    for (const g of [a, b]) {
      for (const e of g.enemies) {
        e.fire = 999;
        e.think = 999;
      }
      for (const p of g.players) p.shield = 999;
      const boss = g.enemies.find((e) => e.boss);
      g.damage(boss, 100, 'p0');
      assert.equal(boss.hp, 600);
    }
    for (let i = 0; i < 31; i++) {
      a.step(0.05);
      b.step(0.05);
    }
    assert.ok(b.cooperation.openFor > 0);
    assert.deepEqual(state(b), state(a));
    for (const g of [a, b]) {
      g.damage(
        g.enemies.find((e) => e.boss),
        100,
        'p0',
      );
      g.players[0].x -= 70;
    }
    for (let i = 0; i < 165; i++) {
      a.step(0.05);
      b.step(0.05);
    }
    assert.equal(b.cooperation.openFor, 0);
    assert.deepEqual(state(b), state(a));
  }
});
test('unknown JSON ingress rejects malformed maps and normalizes malformed profile', () => {
  for (const raw of [null, [], {}, { width: 10, height: 10, tiles: 'oops' }])
    assert.throws(() => modern.validateMap(raw));
  assert.equal(modern.Progression.migrateLegacyProfile(null).characters.Asuka.xp, 0);
});
