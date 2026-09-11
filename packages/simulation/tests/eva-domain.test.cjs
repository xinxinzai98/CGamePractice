const test = require('node:test');
const assert = require('node:assert/strict');
const { Eva, Game, campaign, ValidationError, ProtocolError } = require('../dist');
const { IDS, NODES, MACHINES, MEMBERS, BALANCE } = Eva;
const copy = (value) => JSON.parse(JSON.stringify(value));
function fund(p = Eva.createProfile()) {
  p.wallet.silver = 1000000;
  p.wallet.generalData = 1000000;
  for (const m of Object.values(p.machines)) m.data = 1000000;
  for (const m of Object.values(p.members)) m.data = 1000000;
  return p;
}
function develop(p, id = IDS.eva02) {
  for (const suffix of ['M02', 'M03']) Eva.research(p, id, `${id}.${suffix}`);
  Eva.upgrade(p, id);
  for (const suffix of ['M04', 'M05']) Eva.research(p, id, `${id}.${suffix}`);
  Eva.upgrade(p, id);
  for (const suffix of ['M06', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
    Eva.research(p, id, `${id}.${suffix}`);
  return p;
}
function battle(p = Eva.createProfile(), overrides = {}) {
  const participant = Eva.resolveLoadout(p, p.presets[0], { entityId: 'e1', accountId: 'alice' });
  const events = [
    ['participation', 40],
    ['objective', 2],
    ['damage', 600],
  ].map(([kind, amount], i) => ({
    id: `r:${i + 1}`,
    seq: i + 1,
    time: 10 + i,
    kind,
    actorId: 'e1',
    amount,
  }));
  return {
    round: 'round-test',
    at: 1000,
    mode: 'operation',
    missionId: 'mission.campaign.1',
    ruleVersion: Eva.RULE_VERSION,
    seed: 7,
    condition: null,
    won: true,
    elapsed: 60,
    participants: [participant],
    entityId: 'e1',
    events,
    hpFraction: 0.8,
    used: {},
    license: false,
    completedStages: 1,
    ...overrides,
  };
}

test('published content has unique references, acyclic trees and all release categories', () => {
  assert.deepEqual(Eva.validateContent().errors, []);
  assert.equal(Eva.MACHINES.length, 4);
  assert.equal(Eva.MEMBERS.filter((m) => m.role === 'driver').length, 4);
  assert.equal(Eva.MEMBERS.filter((m) => m.role === 'support').length, 3);
  assert.equal(Eva.EQUIPMENT.filter((e) => e.category === 'ordinary').length, 9);
  assert.equal(Eva.WEAPONS.filter((w) => w.kind === 'primary').length, 3);
  assert.equal(Eva.WEAPONS.filter((w) => w.kind === 'melee').length, 2);
  assert.equal(Eva.AMMO.length, 3);
  assert.equal(Eva.CONSUMABLES.length, 3);
  assert.ok(Object.values(BALANCE.categoryProbability).every((p) => p > 0));
  for (const member of MEMBERS)
    assert.ok(NODES.some((n) => n.ownerId === member.id && n.kind === 'resonance' && n.machineId));
});
test('all 48 basic compositions have legal independent entity/account identities', () => {
  const p = Eva.simulationProfile();
  let count = 0;
  for (const machine of MACHINES)
    for (const driver of MEMBERS.filter((m) => m.role === 'driver'))
      for (const support of MEMBERS.filter((m) => m.role === 'support')) {
        const preset = Eva.defaultPreset(machine.id, driver.id, support.id),
          resolved = Eva.resolveLoadout(p, preset, {
            entityId: `entity${count}`,
            accountId: `account${count}`,
          });
        assert.equal(resolved.machineId, machine.id);
        assert.equal(resolved.driverId, driver.id);
        assert.equal(resolved.supportId, support.id);
        assert.equal(resolved.type, machine.type);
        count++;
      }
  assert.equal(count, 48);
  const a = Eva.defaultPreset(),
    b = copy(a);
  b.equipment = ['equipment.composite-armor'];
  const one = Eva.resolveLoadout(p, a, { entityId: 'e1', accountId: 'a' }),
    two = Eva.resolveLoadout(p, b, { entityId: 'e2', accountId: 'b' });
  assert.equal(one.driverId, two.driverId);
  assert.notEqual(one.entityId, two.entityId);
  assert.ok(two.stats.hp > one.stats.hp);
  assert.deepEqual(a.equipment, []);
  const types = MACHINES.map((m) => m.type),
    pairs = new Set();
  for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) pairs.add(`${types[i]}:${types[j]}`);
  assert.equal(pairs.size, 10);
});
test('research spends own data then universal data once without changing lifetime totals', () => {
  const p = Eva.createProfile(),
    id = IDS.eva02,
    n = NODES.find((n) => n.id === `${id}.M02`);
  p.machines[id].data = 100;
  p.wallet.generalData = n.cost;
  const result = Eva.research(p, id, n.id);
  assert.equal(result.dataSpent, 100);
  assert.equal(result.generalDataSpent, n.cost - 100);
  assert.equal(p.machines[id].totalData, 0);
  assert.equal(p.wallet.generalData, 100);
  const snapshot = copy(p);
  assert.equal(Eva.research(p, id, n.id).alreadyUnlocked, true);
  assert.deepEqual(p, snapshot);
  p.members[IDS.asuka].data = 0;
  assert.throws(() => Eva.research(p, IDS.asuka, `${IDS.asuka}.M02`), ValidationError);
  assert.equal(p.wallet.generalData, 100);
});
test('upgrade eligibility is separate, grants no free repair and is charged once', () => {
  const p = fund(),
    id = IDS.eva02;
  p.machines[id].damage = 0.4;
  p.machines[id].repairDue = 88;
  assert.throws(() => Eva.upgrade(p, id), /资格/);
  Eva.research(p, id, `${id}.M02`);
  Eva.research(p, id, `${id}.M03`);
  assert.equal(p.machines[id].level, 1);
  p.wallet.silver = 0;
  assert.throws(() => Eva.upgrade(p, id), /经费/);
  assert.ok(p.machines[id].unlocked.includes(`${id}.M03`));
  p.wallet.silver = 50000;
  Eva.upgrade(p, id);
  assert.equal(p.machines[id].level, 2);
  assert.equal(p.machines[id].damage, 0.4);
  assert.equal(p.machines[id].repairDue, 88);
  assert.throws(() => Eva.upgrade(p, id), /资格/);
});
test('research OR and terminal AND are distinct from route activation; both routes remain learned', () => {
  const p = fund(),
    id = IDS.eva02;
  assert.throws(() => Eva.research(p, id, `${id}.G2`), /前置/);
  Eva.research(p, id, `${id}.G1`);
  Eva.research(p, id, `${id}.G2`);
  develop(p, id);
  assert.ok(p.machines[id].unlocked.includes(`${id}.A3`));
  assert.ok(p.machines[id].unlocked.includes(`${id}.B3`));
  const a = {
      ...Eva.defaultPreset(),
      id: 'a',
      branch: 'assault',
      skills: [`${id}.A3`, `${id}.M04`],
    },
    b = { ...a, id: 'b', branch: 'artillery', skills: [`${id}.B3`, `${id}.M04`] };
  const wallet = copy(p.wallet),
    unlocked = copy(p.machines[id].unlocked);
  Eva.savePreset(p, a);
  Eva.savePreset(p, b);
  assert.deepEqual(p.wallet, wallet);
  assert.deepEqual(p.machines[id].unlocked, unlocked);
  assert.ok(Eva.resolveLoadout(p, a).skills.includes('beast'));
  assert.ok(Eva.resolveLoadout(p, b).skills.includes('arsenal'));
  assert.throws(() => Eva.resolveLoadout(p, { ...a, skills: [`${id}.B3`] }), /路线/);
  p.machines[id].unlocked = p.machines[id].unlocked.filter((n) => n !== `${id}.A2`);
  assert.throws(() => Eva.resolveLoadout(p, a), /激活前置/);
});
test('lower-level missions reject excess slots, high-level skills, unsupported weapon and replacement stacking', () => {
  const p = Eva.simulationProfile(),
    id = IDS.eva02,
    a = Eva.defaultPreset();
  assert.throws(
    () =>
      Eva.resolveLoadout(
        p,
        { ...a, equipment: ['equipment.pulse-coil', 'equipment.composite-armor'] },
        { levelCap: 1 },
      ),
    /容量/,
  );
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, branch: 'assault', skills: [`${id}.A3`] }, { levelCap: 1 }),
    ValidationError,
  );
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, weaponId: 'weapon.cannon' }, { levelCap: 1 }),
    /授权/,
  );
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, branch: 'artillery', skills: [`${id}.M01`, `${id}.B3`] }),
    /替换/,
  );
  assert.equal(Eva.resolveLoadout(p, { ...a, levelCap: 1 }).level, 1);
});
test('same-group equipment and incompatible special ammunition fail without checking unreserved stock', () => {
  const p = Eva.simulationProfile(),
    a = Eva.defaultPreset();
  assert.throws(
    () =>
      Eva.resolveLoadout(p, {
        ...a,
        equipment: ['equipment.pulse-coil', 'equipment.resonance-core'],
      }),
    /互斥/,
  );
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, equipment: ['equipment.mastery-barrier'] }),
    /型号/,
  );
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, weaponId: 'weapon.twin', ammo: { 'ammo.resonance': 1 } }),
    /不兼容/,
  );
  p.stock = {};
  assert.doesNotThrow(() => Eva.resolveLoadout(p, { ...a, ammo: { 'ammo.precision': 20 } }));
  assert.throws(() => Eva.resolveLoadout(p, { ...a, ammo: { 'ammo.precision': 61 } }), /整数/);
});
test('destroyed machines cannot deploy but may save new free configurations without healing', () => {
  const p = Eva.createProfile(),
    preset = copy(p.presets[0]);
  p.machines[preset.machineId].damage = 1;
  preset.name = '待整备';
  assert.throws(() => Eva.resolveLoadout(p, preset), /击毁/);
  Eva.savePreset(p, preset);
  assert.equal(p.machines[preset.machineId].damage, 1);
  p.machines[preset.machineId].damage = 0.3;
  assert.equal(Eva.resolveLoadout(p, preset).hpFraction, 0.7);
});
test('resonance requires owned target, personal progression, actual sorties and type proficiency', () => {
  const p = fund(),
    id = IDS.asuka;
  Eva.research(p, id, `${id}.M02`);
  Eva.research(p, id, `${id}.M03`);
  assert.throws(() => Eva.research(p, id, `${id}.resonance`), /次数/);
  p.members[id].sorties[IDS.eva02] = 3;
  assert.throws(() => Eva.research(p, id, `${id}.resonance`), /熟练度/);
  p.members[id].proficiency.attack = 1200;
  Eva.research(p, id, `${id}.resonance`);
  const a = { ...p.presets[0], driverSkills: [`${id}.resonance`] };
  assert.ok(Eva.resolveLoadout(p, a).passives.includes('resonance-asuka-drive'));
  const mismatched = { ...Eva.defaultPreset(IDS.eva00, id), driverSkills: [`${id}.resonance`] };
  assert.throws(() => Eva.resolveLoadout(p, mismatched), /目标机体/);
});
test('type proficiency and finite mastery apply only to current type, target and personal direction', () => {
  const p = Eva.simulationProfile(),
    id = IDS.asuka;
  for (const member of Object.values(p.members))
    member.proficiency = { attack: 0, defense: 0, balance: 0, support: 0 };
  const a = Eva.defaultPreset(),
    base = Eva.resolveLoadout(p, a);
  p.members[id].proficiency.attack = 12000;
  assert.ok(Eva.resolveLoadout(p, a).stats.speedMult > base.stats.speedMult);
  const defense = Eva.defaultPreset(IDS.eva00, id),
    d0 = Eva.resolveLoadout(p, defense);
  p.members[id].proficiency.attack = 0;
  assert.equal(Eva.resolveLoadout(p, defense).stats.speedMult, d0.stats.speedMult);
  const mastery = Eva.resolveLoadout(p, { ...a, driverSkills: [`${id}.A1`] });
  assert.ok(mastery.stats.hp > base.stats.hp);
  const other = Eva.resolveLoadout(p, { ...defense, driverSkills: [`${id}.A1`] });
  assert.equal(other.stats.hp, d0.stats.hp);
  assert.throws(
    () => Eva.resolveLoadout(p, { ...a, driverSkills: [`${id}.A1`, `${id}.B1`] }),
    /形式|互斥/,
  );
});
test('all seven draw categories grant ownership or finite stock; gold never enters draw rewards', () => {
  let lower = 0;
  for (const [category, probability] of Object.entries(BALANCE.categoryProbability)) {
    const p = Eva.createProfile();
    p.wallet.tickets = 1;
    const numbers = [lower + probability / 2, 0.75];
    const result = Eva.draw(p, () => numbers.shift());
    assert.equal(result.category, category);
    assert.equal(p.wallet.gold, 0);
    assert.equal(p.wallet.tickets, 0);
    if (category === 'ammo' || category === 'consumable')
      assert.ok(p.stock[result.itemId] >= result.quantity);
    else
      assert.ok(
        result.duplicate || Object.values(p.owned).some((ids) => ids.includes(result.itemId)),
      );
    lower += probability;
  }
});
test('pity forces joint group after nine misses, duplicates reset it without leveling', () => {
  const p = Eva.createProfile();
  p.wallet.tickets = 20;
  for (let i = 0; i < 9; i++) {
    let calls = 0;
    const d = Eva.draw(p, () => (calls++ === 0 ? 0.8 : 0));
    assert.equal(d.category, 'ammo');
  }
  assert.equal(p.pity, 9);
  const before = p.machines[IDS.eva00].level;
  const d = Eva.draw(p, () => 0);
  assert.equal(d.pityTriggered, true);
  assert.equal(d.category, 'machine');
  assert.equal(d.duplicate, true);
  assert.equal(p.pity, 0);
  assert.equal(p.machines[IDS.eva00].level, before);
  assert.equal(p.wallet.credentials, 30);
  assert.ok(Math.abs(d.categoryProbability - 8 / 22) < 1e-12);
});
test('invalid random and unaffordable actions are atomic in pure domain', () => {
  const p = Eva.createProfile(),
    snapshot = copy(p);
  let i = 0;
  assert.throws(() => Eva.draw(p, () => (i++ === 0 ? 0.1 : 1)), /随机/);
  assert.deepEqual(p, snapshot);
  assert.throws(() => Eva.purchase(p, 'offer.machine.rebuild.eva01.base'), /配额/);
  assert.deepEqual(p, snapshot);
  assert.throws(() => Eva.exchange(p, 'machine', IDS.eva01), /凭证/);
  assert.deepEqual(p, snapshot);
});
test('normal purchase, paid permanent ownership and exchanges share one ownership namespace', () => {
  const p = Eva.createProfile();
  p.wallet.silver = 10000;
  p.wallet.gold = 1000;
  p.wallet.credentials = 1000;
  Eva.purchase(p, 'offer.equipment.pulse-coil');
  assert.throws(() => Eva.exchange(p, 'equipment', 'equipment.pulse-coil'), /已拥有/);
  Eva.exchange(p, 'machine', IDS.eva01);
  assert.equal(p.machines[IDS.eva01].level, 1);
  assert.throws(() => Eva.purchase(p, `offer.${IDS.eva01}`), /已拥有/);
  const stock = p.stock['ammo.precision'];
  Eva.purchase(p, 'offer.ammo.precision', 5);
  assert.equal(p.stock['ammo.precision'], stock + 5);
  assert.throws(() => Eva.exchange(p, 'equipment', 'equipment.mastery-assault'), /未知/);
});
test('license extends from later of now and expiry; does not change combat stats', () => {
  const p = Eva.createProfile();
  p.wallet.gold = 1000;
  const stats = Eva.resolveLoadout(p, p.presets[0]).stats;
  Eva.purchase(p, 'offer.license.30d', 1, 1000);
  const expiry = p.licenseExpiresAt;
  Eva.purchase(p, 'offer.license.30d', 1, 2000);
  assert.equal(p.licenseExpiresAt, expiry + BALANCE.licenseDurationMs);
  assert.deepEqual(Eva.resolveLoadout(p, p.presets[0]).stats, stats);
  const late = p.licenseExpiresAt + 2000;
  Eva.purchase(p, 'offer.license.30d', 1, late);
  assert.equal(p.licenseExpiresAt, late + BALANCE.licenseDurationMs);
});
test('output, protection and support roles reach identical absolute contribution rewards', () => {
  const base = battle(),
    mission = Eva.MISSIONS.find((m) => m.id === base.missionId),
    rewards = [];
  for (const [kind, amount] of [
    ['damage', mission.scoring.output],
    ['protection', mission.scoring.protection],
    ['support', mission.scoring.support],
  ]) {
    const record = copy(base);
    record.events[2].kind = kind;
    record.events[2].amount = amount;
    rewards.push(Eva.scoreBattle(record));
  }
  assert.equal(rewards[0].machineData, rewards[1].machineData);
  assert.equal(rewards[1].machineData, rewards[2].machineData);
  const duplicate = copy(base);
  duplicate.events.push(copy(duplicate.events[2]));
  assert.equal(Eva.scoreBattle(duplicate).machineData, Eva.scoreBattle(base).machineData);
});
test('license independently rounds support, grants general data once and does not speed proficiency', () => {
  const plain = Eva.createProfile(),
    paid = Eva.createProfile(),
    base = battle(plain),
    licensed = { ...copy(base), license: true };
  const a = Eva.awardBattle(plain, base),
    b = Eva.awardBattle(paid, licensed);
  assert.equal(b.machineData, Math.floor(a.machineData * 1.5));
  assert.equal(b.supportData, Math.floor(a.machineData * 0.6 * 1.5));
  assert.equal(b.generalData, Math.floor(b.machineData * 0.1));
  assert.deepEqual(plain.members[IDS.asuka].proficiency, paid.members[IDS.asuka].proficiency);
  assert.deepEqual(plain.members[IDS.misato].proficiency, paid.members[IDS.misato].proficiency);
  assert.deepEqual(plain.members[IDS.asuka].sorties, paid.members[IDS.asuka].sorties);
  assert.equal(paid.wallet.gold, 0);
  assert.equal(b.silverNet, b.silverGross - b.repairCost - b.supplyCost);
});
test('a failed mission pays completed progress and round retries never duplicate reward or damage', () => {
  const p = Eva.createProfile(),
    record = battle(p, { won: false }),
    reward = Eva.awardBattle(p, record),
    snapshot = copy(p);
  assert.ok(reward.machineData > 0);
  assert.equal(reward.tickets, 0);
  assert.equal(p.machines[IDS.eva02].damage, 1 - 0.8);
  assert.deepEqual(Eva.awardBattle(p, { ...record, hpFraction: 0 }), reward);
  assert.deepEqual(p, snapshot);
  assert.equal(p.machines[IDS.eva00].totalData, 0);
  assert.equal(p.members[IDS.rei].totalData, 0);
});
test('MAGI/tutorial never mutate real data and recovery only pays confirmed silver', () => {
  for (const mode of ['magi', 'tutorial']) {
    const p = Eva.createProfile(),
      snapshot = copy(p);
    const result = Eva.awardBattle(p, battle(p, { mode, hpFraction: 0 }));
    assert.equal(result.silverGross, 0);
    assert.deepEqual(p, snapshot);
  }
  const p = Eva.createProfile(),
    before = copy(p),
    result = Eva.awardBattle(
      p,
      battle(p, { mode: 'recovery', missionId: 'mission.recovery', license: true, hpFraction: 0 }),
    );
  assert.equal(result.silverGross, BALANCE.recoverySilver);
  assert.deepEqual(p.machines, before.machines);
  assert.deepEqual(p.members, before.members);
  assert.deepEqual(p.stock, before.stock);
  assert.equal(p.wallet.generalData, 0);
  assert.equal(p.wallet.tickets, before.wallet.tickets);
  const aborted = Eva.scoreBattle(
    battle(p, {
      mode: 'recovery',
      missionId: 'mission.recovery',
      elapsed: 0,
      completedStages: 0,
      events: [],
    }),
  );
  assert.equal(aborted.silverGross, 0);
});
test('idle, no-progress and mismatched recovery tasks cannot farm earnings', () => {
  assert.equal(Eva.scoreBattle(battle(undefined, { events: [] })).machineData, 0);
  assert.equal(Eva.scoreBattle(battle(undefined, { completedStages: 0 })).silverGross, 0);
  assert.throws(() => Eva.scoreBattle(battle(undefined, { mode: 'recovery' })), /独立/);
});
test('quick genuine victories earn the published short-stage reward without a time floor or a supply ticket', () => {
  const record = battle(undefined, {
    elapsed: 3,
    events: [{ id: 'fast-hit', seq: 1, time: 1.5, kind: 'damage', actorId: 'e1', amount: 100 }],
  });
  const result = Eva.scoreBattle(record);
  assert.ok(result.eligible);
  assert.ok(result.machineData > 0 && result.machineData <= 6);
  assert.equal(result.tickets, 0);
  const boss = Eva.scoreBattle({ ...record, missionId: 'mission.campaign.3' });
  assert.equal(boss.tickets, 1);
  assert.ok(boss.machineData > result.machineData);
});
test('license support rounding uses the original unrounded ratio at odd E', () => {
  const record = battle(undefined, {
    missionId: 'mission.campaign.2',
    won: false,
    events: [{ id: 'odd-hit', seq: 1, time: 2, kind: 'damage', actorId: 'e1', amount: 20 }],
  });
  const ordinary = Eva.scoreBattle(record),
    licensed = Eva.scoreBattle({ ...record, license: true });
  assert.equal(ordinary.machineData, 9);
  assert.equal(licensed.machineData, 13);
  assert.equal(licensed.supportData, 8);
});
test('a fallen second player prevents the all-alive challenge even when its attacker is an enemy', () => {
  const p = Eva.simulationProfile(),
    first = Eva.resolveLoadout(p, Eva.defaultPreset(), { entityId: 'e1', accountId: 'a' }),
    second = Eva.resolveLoadout(p, Eva.defaultPreset(IDS.eva00), {
      entityId: 'e2',
      accountId: 'b',
    });
  const record = battle(p, { missionId: 'mission.campaign.7', participants: [first, second] });
  record.events.push(
    { id: 'ally-hit', seq: 4, time: 20, kind: 'damage', actorId: 'e2', amount: 100 },
    {
      id: 'ally-down',
      seq: 5,
      time: 30,
      kind: 'downed',
      actorId: 'e2',
      targetId: 'enemy0',
      amount: 1,
    },
  );
  Eva.awardBattle(p, record);
  assert.ok(!p.service.completed.includes('service.all-alive'));
  record.round = 'rescued-round';
  record.events.push({
    id: 'ally-up',
    seq: 6,
    time: 40,
    kind: 'rescue',
    actorId: 'e1',
    targetId: 'e2',
    amount: 1,
  });
  Eva.awardBattle(p, record);
  assert.ok(p.service.completed.includes('service.all-alive'));
});
test('repair uses frozen effective-level price and never spends gold', () => {
  const p = develop(fund()),
    record = battle(p);
  record.participants[0].level = 1;
  record.hpFraction = 0;
  Eva.awardBattle(p, record);
  assert.equal(Eva.repairPrice(p, IDS.eva02), BALANCE.repairMaximum[1]);
  p.wallet.silver = 0;
  p.wallet.gold = 999;
  assert.throws(() => Eva.repair(p, IDS.eva02), /经费/);
  assert.equal(p.wallet.gold, 999);
  p.wallet.silver = 1000;
  Eva.repair(p, IDS.eva02);
  assert.equal(p.wallet.silver, 1000 - BALANCE.repairMaximum[1]);
  assert.equal(Eva.repair(p, IDS.eva02).cost, 0);
});
test('review gives real event evidence, distinguishes part damage and does not invent cooldown facts', () => {
  const record = battle();
  record.events.push(
    {
      id: 'part',
      seq: 4,
      time: 20,
      kind: 'part-damage',
      actorId: 'e1',
      amount: 50,
      partId: 'weapon',
    },
    { id: 'core', seq: 5, time: 25, kind: 'core-exposed', actorId: 'system', phaseId: 'p2' },
  );
  const review = Eva.reviewBattle(record);
  assert.equal(review.metrics.damage, 600);
  assert.equal(review.metrics.partDamage, 50);
  assert.ok(review.observations.some((o) => o.eventIds.includes('core')));
  assert.ok(review.observations.every((o) => !o.text.includes('未就绪')));
  for (const observation of review.observations)
    for (const id of observation.eventIds) assert.ok(record.events.some((e) => e.id === id));
});
test('service rewards need effective evidence and are granted once; a renamed preset is not a route', () => {
  const p = Eva.createProfile();
  p.service.rescues = 9;
  const record = battle(p);
  record.events.push({
    id: 'rescue',
    seq: 4,
    time: 30,
    kind: 'rescue',
    actorId: 'e1',
    targetId: 'e2',
    amount: 1,
  });
  Eva.awardBattle(p, record);
  assert.ok(p.service.completed.includes('service.rescuer'));
  assert.equal(p.owned.cosmetics.filter((id) => id === 'cosmetic.rescue-veteran').length, 1);
  const repeat = copy(record);
  repeat.round = 'second';
  repeat.participants[0].preset.name = '完全不同路线';
  Eva.awardBattle(p, repeat);
  assert.equal(Object.values(p.service.routes)[0].length, 1);
  assert.equal(p.owned.cosmetics.filter((id) => id === 'cosmetic.rescue-veteran').length, 1);
});
test('all 18 legacy nodes and 6 equipment have explicit migration mappings and no duplicated XP', () => {
  assert.equal(Object.keys(Eva.LEGACY_NODE_MAP).length, 18);
  assert.equal(Object.keys(Eva.LEGACY_EQUIPMENT_MAP).length, 6);
  const legacy = {
    coins: 4321,
    tickets: 7,
    pity: 8,
    characters: {
      Asuka: {
        xp: 1500,
        nodes: Object.keys(Eva.LEGACY_NODE_MAP).filter((id) => id.startsWith('a-')),
      },
      Rei: { xp: 900, nodes: Object.keys(Eva.LEGACY_NODE_MAP).filter((id) => id.startsWith('r-')) },
    },
    inventory: Object.keys(Eva.LEGACY_EQUIPMENT_MAP),
    equipment: {
      Asuka: { weapon: 'pulse-coil', armor: 'at-lining', module: 'sync-relay' },
      Rei: { weapon: 'resonance-core', armor: 'composite-armor', module: 'vector-thruster' },
    },
    drawHistory: [{ at: 'old' }],
    records: { history: [{ round: 'old-round' }] },
  };
  const before = copy(legacy),
    p = Eva.migrateProfile(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(p.wallet.silver, 4321);
  assert.equal(p.wallet.gold, 0);
  assert.equal(p.wallet.tickets, 7);
  assert.equal(p.pity, 8);
  assert.equal(p.wallet.generalData, 0);
  assert.equal(p.owned.equipment.length, 6);
  assert.equal(p.members[IDS.asuka].totalData, 1500);
  assert.equal(p.members[IDS.asuka].data, 1500);
  assert.equal(p.members[IDS.rei].totalData, 900);
  assert.equal(p.members[IDS.misato].totalData, 0);
  assert.equal(p.machines[IDS.eva02].totalData, 0);
  assert.equal(p.machines[IDS.eva00].totalData, 0);
  assert.equal(Object.keys(p.migration.nodes).length, 18);
  assert.deepEqual(p.migration.legacyDraws, legacy.drawHistory);
  assert.deepEqual(p.migration.legacyBattles, legacy.records.history);
  for (const preset of p.presets) assert.doesNotThrow(() => Eva.resolveLoadout(p, preset));
  assert.deepEqual(Eva.migrateProfile({ eva: p }), p);
});
test('empty legacy accounts retain level one, and persisted corruption does not reset ownership or balances', () => {
  const p = Eva.migrateProfile({ coins: 0, tickets: 0 });
  assert.equal(p.machines[IDS.eva00].level, 1);
  assert.equal(p.machines[IDS.eva02].level, 1);
  const bad = copy(p);
  bad.wallet.gold = -1;
  assert.throws(() => Eva.parseProfile(bad), ProtocolError);
  const missing = copy(p);
  delete missing.members[IDS.asuka];
  assert.throws(() => Eva.parseProfile(missing), ProtocolError);
  assert.deepEqual(Eva.parseProfile(p), p);
});
test('migrated mobile barrage and ally barrier preserve actual combat access while respecting the active route and slots', () => {
  const legacy = {
      coins: 1000,
      characters: {
        Asuka: { xp: 900, nodes: ['a-cannon-1', 'a-cannon-2', 'a-guard-1', 'a-guard-2'] },
        Rei: { xp: 0, nodes: [] },
      },
    },
    p = Eva.migrateProfile(legacy),
    id = IDS.eva02;
  const mobile = {
    ...p.presets[0],
    branch: 'artillery',
    skills: [`${id}.M01`, `${id}.legacy-guard`],
  };
  const resolved = Eva.resolveLoadout(p, mobile, { entityId: 'e1', accountId: 'a' }),
    ally = Eva.resolveLoadout(p, p.presets[1], { entityId: 'e2', accountId: 'b' });
  assert.ok(resolved.legacyNodes.includes('a-cannon-2'));
  assert.ok(resolved.legacyNodes.includes('a-guard-2'));
  assert.ok(resolved.stats.hp >= 137);
  const map = campaign(0, 0);
  map.spawns[1] = { x: map.spawns[0].x + 1, y: map.spawns[0].y };
  const game = new Game(map, {
    participants: [resolved, ally],
    roundId: 'migration-combat',
    missionId: 'mission.campaign.1',
  });
  assert.equal(game.players[0].config.mobileBarrage, true);
  game.tactical(game.players[0], 1);
  assert.ok(game.players[1].shield > 0);
  const baseline = Eva.resolveLoadout(p, { ...mobile, branch: '' });
  assert.ok(!baseline.legacyNodes.includes('a-cannon-2'));
  assert.throws(() => Eva.research(fund(), id, `${id}.legacy-guard`), /历史/);
});
test('hard-difficulty review preserves its recorded context', () => {
  assert.equal(Eva.reviewBattle(battle(undefined, { difficulty: 'hard' })).difficulty, 'hard');
});
test('an unsuccessful MAGI attempt still has an event-backed action observation', () => {
  const review = Eva.reviewBattle(
    battle(undefined, {
      mode: 'magi',
      won: false,
      events: [
        {
          id: 'cast',
          seq: 1,
          time: 1,
          actorId: 'e1',
          kind: 'skill',
          amount: 1,
          sourceId: 'barrage',
        },
        {
          id: 'cost',
          seq: 2,
          time: 1,
          actorId: 'e1',
          kind: 'energy-spent',
          amount: 25,
          sourceId: 'barrage',
        },
      ],
    }),
  );
  assert.equal(review.observations.length, 1);
  assert.deepEqual(review.observations[0].eventIds, ['cast', 'cost']);
  assert.match(review.observations[0].text, /尚无有效命中/);
});
test('all machine and member resource references resolve to shipped local assets', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    root = path.resolve(__dirname, '../../..');
  for (const item of [...MACHINES, ...MEMBERS])
    assert.ok(
      ['client/public', 'web'].some((base) => fs.existsSync(path.join(root, base, item.asset))),
      `${item.id}: ${item.asset}`,
    );
});
test('a level-three driver can fill all three slots with a route, resonance and a selected general specialty', () => {
  const p = Eva.simulationProfile(),
    id = Eva.IDS.asuka,
    preset = { ...Eva.defaultPreset(), driverSkills: [`${id}.A3`, `${id}.resonance`, `${id}.G3`] };
  const resolved = Eva.resolveLoadout(p, preset);
  assert.ok(resolved.passives.includes('rescue-shield'));
  assert.throws(() => Eva.resolveLoadout(p, preset, { levelCap: 2 }), /容量/);
  const baseline = Eva.resolveLoadout(p, { ...preset, driverSkills: [] });
  assert.ok(!baseline.passives.includes('rescue-shield'));
});
