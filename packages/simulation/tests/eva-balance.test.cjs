const test = require('node:test');
const assert = require('node:assert/strict');
const { Eva } = require('../dist');

// Recorded on 2026-09-10 by the read-only audit's legal-input pilot, normal difficulty,
// initial eva02 + eva00, no HP/position edits. These are successful scripted samples,
// not human completion-time claims. Failed navigation samples are deliberately excluded.
const measuredBossSeconds = [
  ['mission.campaign.3', [48.25, 48.2]],
  ['mission.campaign.6', [56.85, 56.25, 57.25]],
  ['mission.campaign.9', [61.15, 62.2, 62.85]],
  ['mission.campaign.12', [69.2, 60.45, 69.8]],
];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function scenario(missionId, seconds, licensed) {
  const profile = Eva.createProfile(),
    id = Eva.IDS.eva02,
    goals = ['M02', 'M03', 'M04', 'M05', 'M06', 'A1', 'A2', 'A3'];
  let cursor = 0,
    rounds = 0,
    gross = 0,
    maintenance = 0,
    supplies = 0,
    upgrades = 0;
  profile.autoRepair = true;
  profile.autoSupply = true;
  function advance() {
    while (cursor < goals.length) {
      const node = Eva.NODES.find((n) => n.id === `${id}.${goals[cursor]}`);
      if (profile.machines[id].data + profile.wallet.generalData < node.cost) break;
      if (node.level > profile.machines[id].level) break;
      Eva.research(profile, id, node.id);
      cursor++;
      if (node.grantsLevel) upgrades += Eva.upgrade(profile, id).cost;
    }
  }
  while (cursor < goals.length && rounds < 1000) {
    const participant = Eva.resolveLoadout(profile, profile.presets[0], {
        entityId: 'p0',
        accountId: 'trial',
      }),
      round = `economy-${++rounds}`;
    const events = [
      ['objective', 1],
      ['damage', 400],
      ['participation', 20],
    ].map(([kind, amount], i) => ({
      id: `${round}:${i}`,
      seq: i,
      time: 10 + i,
      kind,
      amount,
      actorId: 'p0',
    }));
    const record = {
      round,
      at: 1000 + Math.round(rounds * seconds * 1000),
      mode: 'operation',
      missionId,
      ruleVersion: Eva.RULE_VERSION,
      seed: 482,
      condition: null,
      won: true,
      elapsed: seconds,
      participants: [participant],
      entityId: 'p0',
      events,
      hpFraction: 0.65,
      used: { 'ammo.precision': 4, 'consumable.repair': 1 },
      license: licensed,
      difficulty: 'normal',
      completedStages: 1,
    };
    const reward = Eva.awardBattle(profile, record);
    assert.equal(reward.score, 0.5);
    gross += reward.silverGross;
    maintenance += Eva.repair(profile, id).cost;
    // Persistence reserves/returns stock; this scalar economic scenario emulates only
    // confirmed consumption and buys the deficit, never charging existing stock twice.
    for (const [itemId, used] of Object.entries(record.used)) {
      if ((profile.stock[itemId] || 0) < used) {
        const gap = used - (profile.stock[itemId] || 0);
        supplies += Eva.purchase(profile, `offer.${itemId}`, gap).cost;
      }
      profile.stock[itemId] -= used;
    }
    advance();
  }
  return {
    missionId,
    licensed,
    rounds,
    combatMinutes: Number(((rounds * seconds) / 60).toFixed(1)),
    with15sIntermissionMinutes: Number(((rounds * (seconds + 15)) / 60).toFixed(1)),
    gross,
    maintenance,
    supplies,
    upgrades,
    endingSilver: profile.wallet.silver,
    level: profile.machines[id].level,
    complete: cursor === goals.length,
  };
}
test('ordinary-account level-three plus a complete route has a solvent reproducible 2–4h scenario', () => {
  const costs = ['M02', 'M03', 'M04', 'M05', 'M06', 'A1', 'A2', 'A3'].map(
    (suffix) => Eva.NODES.find((n) => n.id === `${Eva.IDS.eva02}.${suffix}`).cost,
  );
  assert.equal(
    costs.reduce((a, b) => a + b, 0),
    12900,
  );
  const rows = measuredBossSeconds.map(([id, samples]) => scenario(id, median(samples), false));
  for (const row of rows) {
    assert.equal(row.complete, true);
    assert.equal(row.level, 3);
    assert.equal(row.upgrades, 6000);
    assert.ok(row.combatMinutes >= 120 && row.combatMinutes <= 150);
    assert.ok(row.with15sIntermissionMinutes >= 120 && row.with15sIntermissionMinutes <= 240);
    assert.equal(
      row.endingSilver,
      Eva.BALANCE.initialSilver + row.gross - row.maintenance - row.supplies - row.upgrades,
    );
    assert.ok(row.endingSilver >= 0);
  }
  console.log('Ordinary-account scalar economy:', JSON.stringify(rows));
});
test('licensed-account same scenario pays maintenance, supplies and upgrades without changing proficiency requirements', () => {
  const normal = scenario('mission.campaign.6', 56.85, false),
    paid = scenario('mission.campaign.6', 56.85, true);
  assert.equal(paid.complete, true);
  assert.equal(paid.level, 3);
  assert.ok(paid.rounds < normal.rounds);
  assert.ok(paid.endingSilver >= 0);
  assert.equal(paid.upgrades, normal.upgrades);
  assert.equal(Eva.BALANCE.resonanceSorties, 3);
  assert.equal(Eva.BALANCE.masterySorties, 8);
  console.log('Licensed-account scalar economy:', JSON.stringify(paid));
});
