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
test('the restored opening and river variation preserve prototype maps, skill trees and equipment', () => {
  for (let s = 0; s < 2; s++) assert.deepEqual(modern.campaign(0, s), old.campaign(0, s));
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
      (({ schemaVersion, contentVersion, ...p }) => p)(
        modern.Progression.migrateLegacyProfile(raw, () => {}),
      ),
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
    const a = new old.Game(old.campaign(0, 1), options),
      b = new modern.Game(modern.campaign(0, 1), options);
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
test('unknown JSON ingress rejects malformed maps and normalizes malformed profile', () => {
  for (const raw of [null, [], {}, { width: 10, height: 10, tiles: 'oops' }])
    assert.throws(() => modern.validateMap(raw));
  assert.equal(modern.Progression.migrateLegacyProfile(null).characters.Asuka.xp, 0);
});
