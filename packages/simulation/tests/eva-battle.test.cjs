const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, Eva, campaign, blankMap, BOSSES } = require('../dist');

function snapshot(machine = Eva.IDS.eva02, entityId = 'pilot-a', edits = {}) {
  const profile = Eva.simulationProfile(),
    preset = { ...Eva.defaultPreset(machine), ...edits };
  return Eva.resolveLoadout(profile, preset, {
    entityId,
    accountId: `account-${entityId}`,
    simulation: true,
  });
}
function arena(participants = [snapshot(), snapshot(Eva.IDS.eva00, 'pilot-b')], options = {}) {
  const map = blankMap(16, 14);
  map.enemies = [{ x: 8, y: 2, type: 4 }];
  const game = new Game(map, {
    participants,
    missionId: 'mission.campaign.1',
    roundId: 'test',
    ...options,
  });
  game.enemies[0].hp = game.enemies[0].maxHp = 1000;
  game.enemies[0].fire = 1000;
  return game;
}
function tick(game, seconds, inputs = []) {
  for (let i = 0; i < Math.ceil(seconds * 20); i++) game.step(0.05, inputs);
}
function bossGame(options = {}) {
  const game = new Game(campaign(0, 2), {
    participants: [snapshot(), snapshot(Eva.IDS.eva00, 'pilot-b')],
    missionId: 'mission.assault',
    ...options,
  });
  for (const enemy of game.enemies) enemy.fire = 1000;
  return game;
}
const kinds = (g, kind) => g.battleEvents.filter((event) => event.kind === kind);

test('all 48 machine/driver/support combinations resolve and carry independent account/entity snapshots', () => {
  let count = 0;
  const profile = Eva.simulationProfile();
  for (const machine of Eva.MACHINES)
    for (const driver of Eva.MEMBERS.filter((m) => m.role === 'driver'))
      for (const support of Eva.MEMBERS.filter((m) => m.role === 'support')) {
        const preset = Eva.defaultPreset(machine.id, driver.id, support.id);
        const configured = Eva.resolveLoadout(profile, preset, {
          entityId: `entity-${count}`,
          accountId: `account-${count}`,
        });
        const game = arena([configured]);
        game.step(0.05, [{ tactical1: true, fire: true }]);
        assert.equal(game.players[0].driverId, driver.id);
        assert.equal(game.players[0].supportId, support.id);
        assert.equal(game.players[0].machineId, machine.id);
        assert.ok(Number.isFinite(game.players[0].energy));
        assert.equal(game.players[0].activeItem, false);
        count++;
      }
  assert.equal(count, 48);
  const first = snapshot(),
    second = snapshot(Eva.IDS.eva02, 'pilot-b', {
      equipment: ['equipment.pulse-coil'],
      driverId: Eva.IDS.asuka,
    });
  const game = arena([first, second]);
  assert.equal(game.players[0].driverId, game.players[1].driverId);
  assert.notEqual(game.players[0].gearMods.damageMult, game.players[1].gearMods.damageMult);
  game.players[0].resolved.preset.skills.length = 0;
  assert.equal(first.preset.skills.length, 1);
  assert.equal(game.players[1].resolved.preset.skills.length, 1);
});

test('every one of ten unordered machine-type pairs can perform ordinary crossfire', () => {
  let pairs = 0;
  for (let a = 0; a < Eva.MACHINES.length; a++)
    for (let b = a; b < Eva.MACHINES.length; b++) {
      const game = arena([snapshot(Eva.MACHINES[a].id), snapshot(Eva.MACHINES[b].id, 'pilot-b')]);
      const [first, second] = game.players,
        enemy = game.enemies[0];
      first.dir = 0;
      second.dir = 1;
      game.damage(enemy, 5, first.id, 'primary', true);
      game.damage(enemy, 5, second.id, 'primary', true);
      assert.equal(kinds(game, 'coop').length, 1);
      assert.equal(kinds(game, 'coop')[0].detail.partnerId, first.id);
      assert.ok(enemy.armorBreakUntil > game.time);
      pairs++;
    }
  assert.equal(pairs, 10);
});

test('all ten level-one default type pairs complete an ordinary normal Boss using only production inputs', () => {
  const profile = Eva.simulationProfile();
  for (const machine of Eva.MACHINES) {
    profile.machines[machine.id].level = 1;
    profile.machines[machine.id].unlocked = [`${machine.id}.M01`];
  }
  for (const member of Eva.MEMBERS) {
    profile.members[member.id].unlocked = [`${member.id}.M01`];
    profile.members[member.id].proficiency = { attack: 0, defense: 0, balance: 0, support: 0 };
    profile.members[member.id].sorties = {};
  }
  let combinations = 0;
  for (let a = 0; a < Eva.MACHINES.length; a++)
    for (let b = a; b < Eva.MACHINES.length; b++) {
      const machines = [Eva.MACHINES[a], Eva.MACHINES[b]],
        label = machines.map((machine) => machine.type).join('+');
      const participants = machines.map((machine, i) =>
        Eva.resolveLoadout(profile, Eva.defaultPreset(machine.id), {
          entityId: `pilot-${i}`,
          accountId: `account-${i}`,
          levelCap: 1,
        }),
      );
      const game = new Game(campaign(0, 2), {
        participants,
        missionId: 'mission.campaign.3',
        difficulty: 'normal',
        seed: 482,
      });
      const productionStep = game.step.bind(game);
      // Adapt the existing input-only controller's obsolete keys. No actor, HP,
      // enemy or map state is modified by this controller or its adapter.
      game.step = (dt, inputs = []) =>
        productionStep(
          dt,
          inputs.map(({ special, ultimate, ...basic }) => ({
            ...basic,
            tactical1: !!(special || ultimate),
          })),
        );
      const result = require('./helpers/pilot-bot.cjs')(game, 120);
      assert.equal(game.status, 'won', `${label} must complete with standard equipment`);
      assert.equal(result.phases.length, 3, label);
      assert.equal(result.channels, 3, label);
      assert.ok(
        game.players.every((player) => player.hp > 0 && player.stats.damage > 0),
        label,
      );
      assert.ok(
        game.players.every(
          (player) => player.resolved.level === 1 && player.resolved.preset.equipment.length === 0,
        ),
        label,
      );
      combinations++;
    }
  assert.equal(combinations, 10);
});

test('crossfire needs distinct direct actors and direction; one shared cooldown prevents repeated scoring', () => {
  const game = arena(),
    [a, b] = game.players,
    target = game.enemies[0];
  a.dir = 0;
  b.dir = 1;
  game.damage(target, 5, a.id);
  a.dir = 1;
  game.damage(target, 5, a.id);
  game.damage(target, 5, b.id, 'passive-chain', false);
  assert.equal(kinds(game, 'coop').length, 0);
  b.dir = 0;
  game.damage(target, 5, b.id);
  assert.equal(kinds(game, 'coop').length, 1);
  for (let i = 0; i < 20; i++) game.damage(target, 1, i % 2 ? a.id : b.id);
  assert.equal(kinds(game, 'coop').length, 1);
  assert.equal(game.coopActions[0].state, 'cooldown');
});

test('crossfire uses the projectile trajectory, not a turn made by the pilot after firing', () => {
  const game = arena(),
    [a, b] = game.players,
    target = game.enemies[0];
  a.dir = b.dir = 0;
  game.shoot(a);
  game.shoot(b);
  const [first, second] = game.bullets;
  b.dir = 1;
  game.impactBullet(target, first);
  game.impactBullet(target, second);
  assert.equal(kinds(game, 'coop').length, 0);
  a.dir = 1;
  game.shoot(a);
  const crossing = game.bullets.at(-1);
  a.dir = 0;
  game.impactBullet(target, crossing);
  assert.equal(kinds(game, 'coop').length, 1);
});

test('mark support remains attributed to the marker and ordinary armor break does not fabricate mark contribution', () => {
  const game = arena([snapshot(Eva.IDS.eva08), snapshot(Eva.IDS.eva02, 'pilot-b')]);
  const [marker, gunner] = game.players,
    target = game.enemies[0];
  game.tactical(marker, 0);
  game.damage(target, 10, gunner.id);
  game.time += 3.1;
  game.damage(target, 10, gunner.id);
  const conversions = kinds(game, 'support').filter((e) => e.detail?.action === 'mark-conversion');
  assert.equal(conversions.length, 2);
  assert.ok(conversions.every((e) => e.actorId === marker.id));
  const plain = arena();
  plain.enemies[0].armorBreakUntil = 5;
  plain.damage(plain.enemies[0], 10, plain.players[0].id);
  plain.damage(plain.enemies[0], 10, plain.players[1].id);
  assert.equal(
    kinds(plain, 'support').filter((e) => e.detail?.action === 'mark-conversion').length,
    0,
  );
});

test('barrier cover requires real interception then another actor charged hit, and never scores a missed shot', () => {
  const game = arena([
    snapshot(Eva.IDS.eva00),
    snapshot(Eva.IDS.eva02, 'pilot-b', { weaponId: 'weapon.cannon' }),
  ]);
  const [guard, gunner] = game.players,
    target = game.enemies[0];
  Object.assign(guard, { x: 450, y: 400 });
  Object.assign(gunner, { x: 510, y: 400, dir: 0 });
  game.tactical(guard, 0);
  game.shoot(gunner);
  assert.equal(kinds(game, 'coop').length, 0);
  game.bullets = [];
  game.damage(gunner, 20, target.id);
  assert.equal(kinds(game, 'protection').at(-1).amount, 20);
  assert.equal(kinds(game, 'protection').at(-1).actorId, guard.id);
  game.shoot(gunner);
  assert.equal(kinds(game, 'coop').length, 0);
  tick(game, 1);
  assert.equal(kinds(game, 'coop').filter((e) => e.detail.action === 'barrier-cover').length, 1);
  assert.equal(game.coopActions[1].state, 'cooldown');
  const health = gunner.hp;
  game.damage(gunner, 100, target.id);
  assert.ok(gunner.hp < health, 'finite barrier capacity cannot absorb unlimited damage');
});

test('boss part damage is disjoint from core HP; two actors expose but huge damage cannot skip a phase', () => {
  const game = bossGame(),
    boss = game.enemies.find((e) => e.boss),
    [a, b] = game.players;
  const initial = boss.hp;
  game.damagePart(boss, boss.parts[0], 1000, a.id);
  game.damagePart(boss, boss.parts[1], 1000, a.id);
  assert.equal(boss.hp, initial);
  assert.equal(boss.encounter.shielded, true);
  assert.equal(
    kinds(game, 'part-damage').reduce((n, e) => n + e.amount, 0),
    200,
  );
  assert.equal(kinds(game, 'damage').length, 0);
  const fresh = bossGame(),
    fb = fresh.enemies.find((e) => e.boss);
  fresh.damagePart(fb, fb.parts[0], 1000, fresh.players[0].id);
  fresh.damagePart(fb, fb.parts[1], 1000, fresh.players[1].id);
  assert.equal(fb.encounter.shielded, false);
  fresh.damagePart(fb, fb.parts[2], 100000, fresh.players[0].id);
  assert.equal(fb.encounter.phaseIndex, 1);
  assert.ok(fb.hp > 0);
  assert.equal(fb.encounter.shielded, true);
  const before = fb.hp;
  fresh.damage(fb, 100000, fresh.players[1].id);
  assert.equal(fb.hp, before);
  assert.ok(kinds(fresh, 'core-protected').length);
});

test('weapon break changes attack frequency, then warns, recovers and gets a suppression grace period', () => {
  const game = bossGame(),
    boss = game.enemies.find((e) => e.boss),
    weapon = boss.parts[0];
  const attack = BOSSES[boss.encounter.id].phases[0].attacks[0];
  game.warnBoss(boss, attack);
  game.fireBoss(boss);
  const normalDelay = boss.fire;
  game.damagePart(boss, weapon, 1000, game.players[0].id);
  boss.encounter.attackIndex = 0;
  game.warnBoss(boss, attack);
  game.fireBoss(boss);
  assert.equal(boss.fire, normalDelay * 2);
  game.bullets = [];
  tick(game, 12.2);
  assert.equal(weapon.state, 'active');
  assert.equal(weapon.hp, weapon.maxHp);
  assert.ok(kinds(game, 'part-recovery-warning').length);
  assert.ok(weapon.immuneUntil > game.time);
  game.damagePart(boss, weapon, 1000, game.players[0].id);
  assert.equal(weapon.hp, weapon.maxHp);
});

test('inventory is frozen per entity, multi-projectile salvos consume one round and depleted special ammo falls back', () => {
  const loadout = snapshot(Eva.IDS.eva02, 'pilot-a', {
    weaponId: 'weapon.twin',
    ammo: { 'ammo.precision': 1 },
    consumables: { 'consumable.repair': 1 },
  });
  const game = arena([loadout]),
    p = game.players[0];
  p.hp -= 50;
  game.step(0.05, [{ fire: true, ammo: 'AP', consumable1: true }]);
  assert.equal(p.used['ammo.precision'], 1);
  assert.equal(game.bullets.length, 2);
  assert.equal(p.used['consumable.repair'], 1);
  assert.equal(p.hp, p.maxHp - 15);
  p.cd.fire = 0;
  game.step(0.05, [{ fire: true, ammo: 'AP' }]);
  assert.equal(p.used['ammo.precision'], 1);
  assert.equal(p.stock['ammo.precision'], 0);
  assert.equal(p.selectedAmmoId, null);
  assert.equal(loadout.preset.ammo['ammo.precision'], 1);
  const before = p.energy;
  game.skill(p, 'special');
  game.skill(p, 'ultimate');
  game.useItem(p);
  assert.equal(p.energy, before, 'legacy inputs cannot bypass researched tactical slots');
});

test('MAGI has deterministic real attacks, a separate simulated actor, phase selection and no source profile mutation', () => {
  const profile = Eva.createProfile(),
    before = structuredClone(profile);
  const participant = Eva.resolveLoadout(profile, profile.presets[0]);
  const options = {
    participants: [participant],
    mode: 'magi',
    simulatedAlly: true,
    seed: 19,
    missionId: 'mission.assault',
    phaseId: BOSSES['dawn-prism'].phases[1].id,
  };
  const a = new Game(campaign(0, 2), options),
    b = new Game(campaign(0, 2), options);
  assert.equal(a.practice, false);
  assert.equal(a.players.length, 2);
  assert.equal(a.players[1].accountId, 'simulation');
  assert.equal(a.enemies.find((e) => e.boss).encounter.phaseIndex, 1);
  tick(a, 8, [{ fire: true, speed: true }]);
  tick(b, 8, [{ fire: true, speed: true }]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(profile, before);
  assert.ok(a.enemies.find((e) => e.boss).encounter.shielded);
  assert.ok(a.players[1].stats.moved > 0);
  const boss = a.enemies.find((e) => e.boss);
  boss.encounter.shielded = false;
  a.damage(boss, 100000, a.players[0].id);
  assert.equal(a.status, 'won');
  assert.equal(
    boss.encounter.phaseIndex,
    1,
    'a selected phase rehearsal ends before entering the next phase',
  );
});

test('a single-player MAGI ally reaches the actual blue mechanism radius without manual positioning', () => {
  const profile = Eva.createProfile();
  const game = new Game(campaign(0, 2), {
    participants: [Eva.resolveLoadout(profile, profile.presets[0])],
    mode: 'magi',
    missionId: 'mission.assault',
    simulatedAlly: true,
  });
  tick(game, 30);
  const ally = game.players[1],
    pad = game.cooperation.puzzle.bluePad;
  assert.ok(Math.hypot(ally.x - pad.x, ally.y - pad.y) < 28);
  assert.equal(
    game.cooperation.puzzle.solved,
    false,
    'the simulator must still require the human on the other pad',
  );
});

test('escort and defense require objective participation; published conditions change actual enemy waves', () => {
  const escort = arena(undefined, { missionId: 'mission.escort' });
  assert.equal(escort.condition, 'reinforcements');
  assert.ok(escort.objective.required > 0);
  for (const p of escort.players) {
    p.x = escort.objective.position.x;
    p.y = escort.objective.position.y + 30;
  }
  tick(escort, 1);
  assert.ok(
    escort.objective.position.x !== (escort.map.spawns[0].x + 0.5) * 60 ||
      escort.objective.position.y !== (escort.map.spawns[0].y + 0.5) * 60,
  );
  for (const p of escort.players) {
    p.x = 90;
    p.y = 90;
  }
  const progress = escort.objective.progress;
  tick(escort, 1);
  assert.equal(escort.objective.progress, progress);
  tick(escort, 13.1);
  assert.ok(escort.enemies.length > 1);
  const defense = arena(undefined, { missionId: 'mission.defense' });
  assert.equal(defense.enemies.length, 3);
  for (const enemy of defense.enemies) enemy.hp = 0;
  for (const p of defense.players) {
    p.x = 90;
    p.y = 90;
  }
  tick(defense, 2);
  assert.equal(defense.objective.progress, 0);
  assert.equal(defense.status, 'playing');
  Object.assign(defense.players[0], defense.objective.position);
  tick(defense, 45.1);
  assert.equal(defense.status, 'won');
  assert.equal(defense.completedStages, 3);
  assert.throws(
    () => arena(undefined, { missionId: 'mission.defense', condition: 'reinforcements' }),
    /战场条件/,
  );
});

test('power is isolated to its experimental mission, backup remains reachable and no energy still permits movement and fire', () => {
  const ordinary = arena();
  assert.deepEqual(ordinary.powerZones, []);
  const game = arena(undefined, { missionId: 'mission.power-lab' }),
    p = game.players[0];
  assert.equal(game.powerZones.length, 2);
  const backup = game.powerZones.find((z) => z.backup);
  assert.ok(game.pass(Math.floor(backup.x / 60), Math.floor(backup.y / 60)));
  Object.assign(p, { x: 90, y: 90, energy: 0 });
  const x = p.x;
  game.step(0.05, [{ dir: 1, fire: true, tactical1: true }]);
  assert.ok(p.x > x);
  assert.ok(p.stats.shots > 0);
  assert.equal(p.energy, 0);
  Object.assign(p, { x: backup.x, y: backup.y });
  game.step(0.05);
  assert.ok(p.energy > 0);
  game.time = 19;
  game.step(0.05);
  assert.equal(game.powerZones[0].active, false);
  assert.equal(backup.active, true);
});

test('rescue and healing events preserve count and effective-HP units and sequence identity', () => {
  const game = arena(),
    [a, b] = game.players;
  b.hp = 0;
  b.x = a.x + 40;
  b.y = a.y;
  tick(game, 3.1);
  assert.equal(kinds(game, 'rescue').length, 1);
  assert.equal(kinds(game, 'rescue')[0].amount, 1);
  assert.equal(kinds(game, 'rescue')[0].actorId, a.id);
  game.skill(a, 'heal');
  assert.ok(kinds(game, 'healing').every((e) => e.amount > 0 && e.amount <= 40));
  assert.equal(new Set(game.battleEvents.map((e) => e.id)).size, game.battleEvents.length);
  assert.deepEqual(
    game.battleEvents.map((e) => e.seq),
    game.battleEvents.map((_, i) => i + 1),
  );
});

test('winning does not manufacture objective participation for an idle account', () => {
  const game = arena(),
    [active, idle] = game.players;
  game.damage(game.enemies[0], 10000, active.id);
  game.step(0.05);
  assert.equal(game.status, 'won');
  assert.ok(kinds(game, 'objective').some((event) => event.actorId === active.id));
  assert.ok(!kinds(game, 'objective').some((event) => event.actorId === idle.id));
});

test('Shinji and Misato resonance provide additional actual battle effects beyond inherent member passives', () => {
  for (const [machine, member, effect] of [
    [Eva.IDS.eva01, Eva.IDS.shinji, 'shinji-counter'],
    [Eva.IDS.eva02, Eva.IDS.misato, 'misato-command'],
  ]) {
    const slot = member === Eva.IDS.misato ? 'supportSkills' : 'driverSkills';
    const base = arena([snapshot(machine)]),
      boosted = arena([snapshot(machine, 'pilot-a', { [slot]: [`${member}.resonance`] })]);
    if (effect === 'shinji-counter') {
      base.damage(base.players[0], 10, base.enemies[0].id);
      boosted.damage(boosted.players[0], 10, boosted.enemies[0].id);
    } else {
      base.tactical(base.players[0], 0);
      boosted.tactical(boosted.players[0], 0);
    }
    base.shoot(base.players[0]);
    boosted.shoot(boosted.players[0]);
    assert.ok(
      boosted.bullets[0].damage > base.bullets[0].damage,
      `${effect} resonance should change emitted attack strength`,
    );
  }
});

test('equipped first personal tiers improve actual inherent effects instead of disappearing at rank one', () => {
  for (const [machine, driver] of [
    [Eva.IDS.eva00, Eva.IDS.rei],
    [Eva.IDS.eva01, Eva.IDS.shinji],
  ]) {
    const base = arena([snapshot(machine)]),
      trained = arena([snapshot(machine, 'pilot-a', { driverSkills: [`${driver}.A1`] })]);
    if (driver === Eva.IDS.shinji) {
      base.damage(base.players[0], 10, base.enemies[0].id);
      trained.damage(trained.players[0], 10, trained.enemies[0].id);
    }
    base.shoot(base.players[0]);
    trained.shoot(trained.players[0]);
    assert.ok(
      trained.bullets[0].damage > base.bullets[0].damage,
      `${driver} A1 must increase a real shot`,
    );
  }
  const base = arena([snapshot(Eva.IDS.eva02)]),
    trained = arena([
      snapshot(Eva.IDS.eva02, 'pilot-a', { driverSkills: [`${Eva.IDS.asuka}.A1`] }),
    ]);
  for (const game of [base, trained]) {
    const p = game.players[0],
      enemy = game.enemies[0];
    Object.assign(p, { x: enemy.x, y: enemy.y + 50, dir: 0, boost: 5 });
    game.melee(p);
  }
  assert.ok(trained.enemies[0].hp < base.enemies[0].hp, 'Asuka A1 must improve boosted melee');
  const plain = arena([snapshot(Eva.IDS.eva08)]),
    marking = arena([snapshot(Eva.IDS.eva08, 'pilot-a', { driverSkills: [`${Eva.IDS.mari}.A1`] })]);
  for (const game of [plain, marking])
    for (let n = 0; n < 4; n++) game.damage(game.enemies[0], 1, game.players[0].id);
  assert.ok(
    marking.enemies[0].markUntil > plain.enemies[0].markUntil,
    'Mari A1 must extend the actual converted mark window',
  );
});

test('gifted ordinary level-one builds finish the three-phase parts mission through production inputs', () => {
  const profile = Eva.createProfile();
  const participants = profile.presets.map((preset, i) =>
    Eva.resolveLoadout(profile, preset, { entityId: `pilot-${i}`, accountId: `account-${i}` }),
  );
  const game = new Game(campaign(0, 2), {
    participants,
    missionId: 'mission.assault',
    difficulty: 'relaxed',
    seed: 482,
  });
  const result = require('./helpers/pilot-bot.cjs')(game, 180);
  assert.equal(game.status, 'won');
  assert.equal(result.channels, 3);
  assert.equal(result.phases.length, 3);
  assert.equal(game.completedStages, 3);
  assert.ok(game.players.every((p) => p.stats.damage > 0 && p.stats.moved > 0));
});

function fullLegacyProfile() {
  return Eva.migrateProfile({
    coins: 1234,
    characters: {
      Asuka: {
        xp: 5000,
        nodes: Object.keys(Eva.LEGACY_NODE_MAP).filter((id) => id.startsWith('a-')),
      },
      Rei: {
        xp: 5000,
        nodes: Object.keys(Eva.LEGACY_NODE_MAP).filter((id) => id.startsWith('r-')),
      },
    },
  });
}
function migratedSnapshot(profile, index, edits = {}) {
  return Eva.resolveLoadout(
    profile,
    { ...profile.presets[index], ...edits },
    { entityId: `legacy-${index}`, accountId: `legacy-account-${index}` },
  );
}

test('migrated guard and fortress are usable tactical slots with real allied shielding and preserved area repair', () => {
  const profile = fullLegacyProfile(),
    id = Eva.IDS.eva02;
  for (const [suffix, duration, healing] of [
    ['legacy-guard', 5, 0],
    ['legacy-fortress', 8, 25],
  ]) {
    const loadout = migratedSnapshot(profile, 0, { skills: [`${id}.${suffix}`] });
    const game = arena([loadout, migratedSnapshot(profile, 1)]),
      [source, ally] = game.players;
    source.hp -= 50;
    ally.hp -= 50;
    const before = [source.hp, ally.hp];
    game.step(0.05, [{ tactical1: true }]);
    assert.ok(source.shield >= duration - 0.05);
    assert.ok(ally.shield >= duration - 0.05);
    assert.equal(source.hp - before[0], healing);
    assert.equal(ally.hp - before[1], healing);
    const oldHp = ally.hp;
    game.damage(ally, 20, game.enemies[0].id);
    assert.equal(ally.hp, oldHp);
    assert.equal(kinds(game, 'protection').at(-1).actorId, source.id);
    assert.ok(source.tacticalCd[0] > 0, 'migration cannot create an extra free activation key');
  }
});

test('migrated mobile triple barrage moves during its active window and emits three penetrating projectiles', () => {
  const profile = fullLegacyProfile(),
    id = Eva.IDS.eva02;
  const game = arena([migratedSnapshot(profile, 0, { branch: 'artillery', skills: [`${id}.B3`] })]);
  const p = game.players[0],
    y = p.y;
  game.step(0.05, [{ tactical1: true, dir: 0 }]);
  assert.ok(
    p.y < y,
    'the old mobile-barrage ability must affect real movement, not only a configuration flag',
  );
  assert.equal(game.bullets.length, 3);
  assert.ok(game.bullets.every((bullet) => bullet.pierce === 1));
  const switched = arena([
    migratedSnapshot(profile, 0, { branch: 'assault', skills: [`${id}.M01`] }),
  ]);
  const stationaryY = switched.players[0].y;
  switched.step(0.05, [{ tactical1: true, dir: 0 }]);
  assert.equal(
    switched.players[0].y,
    stationaryY,
    'legacy route effects cannot leak into an incompatible active route',
  );
});

test('migrated missile fires a real projectile with the original blast radius and bounded separate chain damage', () => {
  const profile = fullLegacyProfile(),
    id = Eva.IDS.eva00;
  const game = arena([migratedSnapshot(profile, 1, { skills: [`${id}.legacy-missile`] })]);
  const p = game.players[0],
    primary = game.enemies[0];
  Object.assign(p, { x: primary.x, y: primary.y + 250, dir: 0 });
  game.enemies.push(
    { ...structuredClone(primary), id: 'splash-target', x: primary.x + 120 },
    { ...structuredClone(primary), id: 'chain-target', x: primary.x + 170 },
  );
  game.tactical(p, 0);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.bullets[0].missile, true);
  tick(game, 1.1);
  assert.equal(game.enemies[1].hp, 895, 'within 130 px receives 70 splash plus 35 chain damage');
  assert.equal(
    game.enemies[2].hp,
    965,
    'outside splash but within 180 px receives only the separate chain',
  );
  assert.ok(game.effects.some((effect) => effect.kind === 'missile' && effect.radius === 130));
  assert.equal(kinds(game, 'damage').filter((event) => event.sourceId === 'chain-blast').length, 3);
});

test('migrated shared boost, phase rescue and healing resurrection retain real behavior within selected slots', () => {
  const profile = fullLegacyProfile();
  const assault = arena([
    migratedSnapshot(profile, 0, { branch: 'assault', skills: [Eva.IDS.eva02 + '.M01'] }),
    migratedSnapshot(profile, 1),
  ]);
  assault.step(0.05, [{ speed: true, fire: true }]);
  assert.ok(assault.players[1].boost > 0);
  assert.ok(assault.players[0].cd.fire <= 0.35);
  const phase = arena([
    migratedSnapshot(profile, 1, { skills: [Eva.IDS.eva00 + '.M04', Eva.IDS.eva00 + '.B3'] }),
    migratedSnapshot(profile, 0),
  ]);
  const [source, ally] = phase.players;
  Object.assign(source, { x: 500, y: 600, dir: 0 });
  Object.assign(ally, { x: 545, y: 435, hp: 0 });
  phase.tactical(source, 0);
  assert.ok(600 - source.y >= 160, 'historical phase extension is applied to movement');
  assert.equal(ally.hp, 55, 'phase rescue restores 30 on rising, then 25 effective healing');
  assert.equal(kinds(phase, 'rescue').at(-1).amount, 1);
  ally.hp = 0;
  ally.x = source.x + 180;
  ally.y = source.y;
  phase.skill(source, 'heal');
  assert.ok(ally.hp > 0);
  assert.equal(
    ally.barrierOwner,
    source.id,
    'the restored healing shield keeps support contribution on its actual source',
  );
});
