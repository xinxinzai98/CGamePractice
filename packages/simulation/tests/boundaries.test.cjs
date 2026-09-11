const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  Game,
  campaign,
  validateMap,
  Progression: P,
  Equipment,
  ProtocolError,
  ValidationError,
} = require('../dist/index.js');
const clone = (v) => JSON.parse(JSON.stringify(v));
function profile() {
  const p = P.createProfile();
  p.inventory = ['pulse-coil'];
  p.equipment.Asuka.weapon = 'pulse-coil';
  p.records.history = [
    {
      round: 'round-1',
      at: '2026-09-10T12:00:00.000Z',
      character: 'Asuka',
      mission: 0,
      stage: 0,
      won: true,
      xp: 90,
      score: 500,
      time: 32.5,
      stats: new Game(campaign(0)).players[0].stats,
    },
  ];
  p.records.wins = 1;
  p.drawHistory = [
    {
      itemId: 'pulse-coil',
      rarity: 'standard',
      duplicate: false,
      coins: 0,
      pityTriggered: false,
      at: '2026-09-10T12:00:00.000Z',
    },
  ];
  return p;
}
test('current profiles round trip with typed battle and draw history; parse does not repair damaged protocol', () => {
  const good = profile();
  assert.deepEqual(P.parseProfile(clone(good)), good);
  for (const edit of [
    (p) => delete p.coins,
    (p) => (p.coins = '0'),
    (p) => (p.records.history = [{}]),
    (p) => (p.drawHistory = [{ itemId: 'pulse-coil' }]),
    (p) => (p.characters.Asuka.nodes = ['a-cannon-2']),
    (p) => (p.equipment.Asuka.weapon = 'unknown'),
  ]) {
    const bad = clone(good);
    edit(bad);
    assert.throws(() => P.parseProfile(bad), ProtocolError);
  }
  for (const bad of [null, {}, []]) assert.throws(() => P.parseProfile(bad), ProtocolError);
});
test('legacy migration reports discarded history without creating fake records', () => {
  const raw = profile();
  raw.records.history.push({ mission: 0 });
  raw.drawHistory.push({ itemId: 'bad' });
  const warnings = [];
  const result = P.migrateLegacyProfile(raw, (m) => warnings.push(m));
  assert.equal(result.records.history.length, 1);
  assert.equal(result.drawHistory.length, 1);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /discarded 1/);
  assert.deepEqual(P.parseProfile(result), result);
});
test('reward boundary rejects malformed fields without reapplying current economy rules', () => {
  const reward = {
    itemId: 'pulse-coil',
    rarity: 'standard',
    duplicate: true,
    coins: 40,
    pityTriggered: false,
  };
  assert.deepEqual(P.parseDrawReward(reward), reward);
  const historicalReward = { ...reward, coins: 30 };
  assert.deepEqual(P.parseDrawReward(historicalReward), historicalReward);
  for (const bad of [
    {},
    { ...reward, itemId: 'unknown' },
    { ...reward, rarity: 'invalid' },
    { ...reward, coins: '40' },
    { ...reward, pityTriggered: 'true' },
  ])
    assert.throws(() => P.parseDrawReward(bad), ProtocolError);
});
test('Game deep clones a validated map without sharing terrain, spawn or puzzle objects', () => {
  const map = campaign(1, 1),
    g = new Game(map),
    h = new Game(map);
  g.map.tiles[0][0] = 0;
  g.map.spawns[0].x = 5;
  g.map.puzzle.redPad.x = 8;
  assert.equal(map.tiles[0][0], 2);
  assert.notEqual(map.spawns[0].x, 5);
  assert.notEqual(h.map.puzzle.redPad.x, 8);
});
test('obsolete flat upgrades are ignored and user validation uses distinct error types', () => {
  const base = new Game(campaign(0)),
    old = new Game(campaign(0), { upgrades: { Asuka: { power: 3, mobility: 3, support: 3 } } });
  assert.deepEqual(old.players, base.players);
  assert.equal('upgrades' in old.players[0], false);
  old.shoot(old.players[0]);
  base.shoot(base.players[0]);
  assert.deepEqual(old.bullets, base.bullets);
  assert.throws(() => validateMap({}), ValidationError);
  assert.throws(() => P.validateBuild('Asuka', ['missing']), ValidationError);
  assert.throws(() => Equipment.modsFor(['missing']), ValidationError);
  assert.throws(
    () => P.parseProfile({}),
    (e) => e instanceof ProtocolError && !(e instanceof ValidationError),
  );
});
