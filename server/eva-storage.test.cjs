'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createProfiles } = require('./profiles.cjs');
const { run, previewEvaMigration } = require('./maintenance.cjs');
const E = require('../packages/simulation/dist/index.js').Eva;
const { DATABASE_VERSION } = require('./profile-migrations.cjs');
const reply = { setHeader() {} };
async function fixture(t, count = 2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-storage-')),
    file = path.join(dir, 'isolated.sqlite');
  const box = { dir, file, store: createProfiles(file), users: [] };
  for (const name of ['pilot_alpha', 'pilot_beta'].slice(0, count))
    box.users.push(await box.store.register(name, 'fixture-password', reply));
  t.after(() => {
    box.store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return box;
}
function begin(
  box,
  round = 'test-round',
  mode = 'operation',
  missionId = 'mission.campaign.1',
  overrides = [],
) {
  const mission = E.MISSIONS.find((m) => m.id === missionId);
  const participants = box.users.map((user, i) => {
    const profile = box.store.byName(user.username).profile.eva;
    const preset = { ...structuredClone(profile.presets[0]), ...(overrides[i] || {}) };
    return E.resolveLoadout(profile, preset, {
      accountId: user.username,
      entityId: `entity-${i + 1}`,
      levelCap: mission.levelCap,
      simulation: mode !== 'operation',
    });
  });
  const context = {
    round,
    mode,
    missionId,
    seed: 42,
    condition: mission.condition,
    participants,
    at: Date.now(),
  };
  const started = box.store.evaBeginRound(context);
  return { context, started };
}
function records(started, changes = []) {
  return started.participants.map((entry, i) => ({
    round: started.round,
    at: Date.now(),
    mode: 'operation',
    missionId: 'mission.campaign.1',
    ruleVersion: E.RULE_VERSION,
    seed: 42,
    condition: null,
    won: true,
    elapsed: 60,
    participants: started.participants.map((p) => p.resolved),
    entityId: entry.entityId,
    events: [
      {
        id: 'event-1',
        seq: 1,
        time: 10,
        kind: 'damage',
        actorId: 'entity-1',
        targetId: 'enemy-1',
        amount: 500,
      },
      {
        id: 'event-2',
        seq: 2,
        time: 11,
        kind: 'damage',
        actorId: 'entity-2',
        targetId: 'enemy-1',
        amount: 500,
      },
    ],
    hpFraction: 0.7,
    used: {},
    license: false,
    completedStages: 1,
    ...(changes[i] || {}),
  }));
}
function sql(file, query) {
  const db = new DatabaseSync(file);
  try {
    return db.exec(query);
  } finally {
    db.close();
  }
}
function scalar(file, query) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(query).get();
  } finally {
    db.close();
  }
}

test('canonical EVA actions survive unrelated legacy mutations and replay exactly without double debit', async (t) => {
  const box = await fixture(t, 1),
    user = box.users[0];
  const stockBefore = user.profile.eva.stock['ammo.precision'];
  const result = box.store.evaAction(
    user,
    'purchase',
    { offerId: 'offer.ammo.precision', quantity: 3, silver: 999999 },
    'purchase-operation',
  );
  const balance = user.profile.eva.wallet.silver,
    revision = user.revision;
  assert.equal(user.profile.eva.stock['ammo.precision'], stockBefore + 3);
  assert.deepEqual(
    box.store.evaAction(
      user,
      'purchase',
      { quantity: 3, offerId: 'offer.ammo.precision' },
      'purchase-operation',
    ),
    result,
  );
  assert.equal(user.profile.eva.wallet.silver, balance);
  assert.equal(user.revision, revision);
  assert.throws(
    () =>
      box.store.evaAction(
        user,
        'purchase',
        { offerId: 'offer.ammo.precision', quantity: 4 },
        'purchase-operation',
      ),
    /另一项请求/,
  );
  const eva = structuredClone(user.profile.eva);
  box.store.mutate(user, (p) => {
    p.coins = 9000;
    p.characters.Asuka.xp = 100;
  });
  assert.deepEqual(box.store.byName(user.username).profile.eva, eva);
  assert.equal(box.store.evaOperations(user)[0].delta.eva.wallet.silver, -9);
});

test('supply debit, draw reward and pity roll back together on storage failure', async (t) => {
  const box = await fixture(t, 1),
    user = box.users[0],
    before = structuredClone(user);
  sql(
    box.file,
    "CREATE TRIGGER fail_action BEFORE INSERT ON operations WHEN NEW.kind='eva:draw' BEGIN SELECT RAISE(ABORT,'injected draw write'); END;",
  );
  assert.throws(
    () => box.store.evaAction(user, 'draw', {}, 'draw-operation-one'),
    /injected draw write/,
  );
  assert.deepEqual(box.store.byName(user.username), before);
  assert.deepEqual(user, before);
  sql(box.file, 'DROP TRIGGER fail_action');
  const reward = box.store.evaAction(user, 'draw', {}, 'draw-operation-one');
  assert.equal(user.profile.eva.wallet.tickets, before.profile.eva.wallet.tickets - 1);
  assert.deepEqual(box.store.evaAction(user, 'draw', {}, 'draw-operation-one'), reward);
  assert.equal(user.profile.eva.draws.length, 1);
});

test('two same-driver accounts reserve atomically, freeze separate equipment and return unused inventory without repurchasing', async (t) => {
  const box = await fixture(t);
  box.store.mutate(box.users[1], (p) => {
    p.eva.owned.equipment.push('equipment.composite-armor');
  });
  const before = box.users.map((u) => box.store.byName(u.username).profile);
  const { context, started } = begin(box, 'inventory-round', 'operation', 'mission.campaign.1', [
    { ammo: { 'ammo.precision': 4 } },
    { ammo: { 'ammo.precision': 6 }, equipment: ['equipment.composite-armor'] },
  ]);
  assert.equal(
    started.participants[0].resolved.driverId,
    started.participants[1].resolved.driverId,
  );
  assert.notEqual(
    started.participants[0].resolved.stats.hp,
    started.participants[1].resolved.stats.hp,
  );
  assert.equal(box.store.byName(box.users[0].username).profile.eva.stock['ammo.precision'], 16);
  assert.equal(box.store.evaBeginRound(context).replayed, true);
  assert.throws(() => begin(box, 'parallel-round'), /待结算局次/);
  const completed = records(started, [
    { used: { 'ammo.precision': 2 } },
    { used: { 'ammo.precision': 3 } },
  ]);
  const outcome = box.store.evaFinishRound(started.round, completed);
  assert.equal(outcome.state, 'settled');
  assert.deepEqual(box.store.evaFinishRound(started.round, completed), outcome);
  for (let i = 0; i < 2; i++) {
    const after = box.store.byName(box.users[i].username).profile;
    assert.equal(
      after.eva.stock['ammo.precision'],
      before[i].eva.stock['ammo.precision'] - (i + 2),
    );
    assert.equal(after.coins, before[i].coins);
    assert.equal(after.characters.Asuka.xp, before[i].characters.Asuka.xp);
    assert.equal(after.unlocked, 2);
    assert.equal(
      outcome.participants[i].result.silverNet,
      after.eva.wallet.silver - before[i].eva.wallet.silver,
    );
  }
  const review = box.store.evaReview(box.users[0], started.round);
  assert.equal(review.record.entityId, 'entity-1');
  assert.equal(review.record.events[0].id, 'event-1');
  assert.throws(() => box.store.evaReview({ username: 'unknown-user' }, started.round), /自己的/);
});

test('second account inventory failure rolls back the first reservation and all revisions', async (t) => {
  const box = await fixture(t);
  box.store.mutate(box.users[1], (p) => {
    p.eva.stock['ammo.precision'] = 0;
  });
  const before = box.users.map((u) => box.store.byName(u.username));
  assert.throws(
    () =>
      begin(box, 'reservation-failure', 'operation', 'mission.campaign.1', [
        { ammo: { 'ammo.precision': 5 } },
        { ammo: { 'ammo.precision': 5 } },
      ]),
    /库存不足/,
  );
  assert.equal(box.store.evaRoundStatus('reservation-failure'), null);
  box.users.forEach((u, i) => assert.deepEqual(box.store.byName(u.username), before[i]));
});

test('pending terminal recovery is atomic for both accounts and never repeats rewards', async (t) => {
  const box = await fixture(t),
    { started } = begin(box, 'pending-terminal', 'operation', 'mission.campaign.1', [
      { ammo: { 'ammo.precision': 3 } },
      { ammo: { 'ammo.precision': 3 } },
    ]);
  const before = box.users.map((u) => box.store.byName(u.username));
  sql(
    box.file,
    "CREATE TRIGGER fail_settlement BEFORE INSERT ON operations WHEN NEW.kind='eva:battle' AND NEW.user_key='pilot_beta' BEGIN SELECT RAISE(ABORT,'injected second account'); END;",
  );
  const completed = records(started, [
    { used: { 'ammo.precision': 1 } },
    { used: { 'ammo.precision': 2 } },
  ]);
  assert.throws(
    () => box.store.evaFinishRound(started.round, completed),
    /injected second account/,
  );
  assert.equal(box.store.evaRoundStatus(started.round), 'pending');
  box.users.forEach((u, i) => assert.deepEqual(box.store.byName(u.username), before[i]));
  sql(box.file, 'DROP TRIGGER fail_settlement');
  box.store.close();
  box.store = createProfiles(box.file);
  assert.equal(box.store.evaRoundStatus(started.round), 'settled');
  const after = box.users.map((u) => box.store.byName(u.username));
  assert(after[0].profile.eva.wallet.silver > before[0].profile.eva.wallet.silver);
  assert.equal(after[0].profile.eva.stock['ammo.precision'], 19);
  assert.equal(after[1].profile.eva.stock['ammo.precision'], 18);
  assert.deepEqual(box.store.evaRecover(), { recovered: 0 });
  box.users.forEach((u, i) => assert.deepEqual(box.store.byName(u.username), after[i]));
});

test('restart abort consumes only the durable checkpoint and retains confirmed damage', async (t) => {
  const box = await fixture(t),
    { started } = begin(box, 'active-checkpoint', 'operation', 'mission.campaign.1', [
      { ammo: { 'ammo.precision': 5 } },
      { ammo: { 'ammo.precision': 5 } },
    ]);
  const confirmed = records(started, [
    { won: false, completedStages: 0, elapsed: 12, used: { 'ammo.precision': 2 }, hpFraction: 0.6 },
    { won: false, completedStages: 0, elapsed: 12, used: {}, hpFraction: 0.9 },
  ]);
  box.store.evaCheckpoint(started.round, confirmed);
  assert.throws(
    () => box.store.evaCheckpoint(started.round, records(started, [{ elapsed: 5 }, {}])),
    /不能回退/,
  );
  box.store.close();
  box.store = createProfiles(box.file);
  assert.equal(box.store.evaRoundStatus(started.round), 'aborted');
  assert.equal(box.store.byName(box.users[0].username).profile.eva.stock['ammo.precision'], 18);
  assert.equal(box.store.byName(box.users[1].username).profile.eva.stock['ammo.precision'], 20);
  assert.equal(
    box.store.byName(box.users[0].username).profile.eva.machines[E.IDS.eva02].damage,
    0.4,
  );
  const review = box.store.evaReview(box.users[0], started.round);
  assert.equal(review.record.won, false);
  assert.equal(review.record.elapsed, 12);
});

test('empty aborted rounds award nothing and do not create a repair debt', async (t) => {
  const box = await fixture(t, 1),
    before = box.store.byName(box.users[0].username).profile.eva;
  const { started } = begin(box, 'empty-abort');
  const outcome = box.store.evaAbortRound(started.round);
  assert.equal(outcome.participants[0].result.silverGross, 0);
  assert.deepEqual(box.store.byName(box.users[0].username).profile.eva.wallet, before.wallet);
  assert.equal(box.store.byName(box.users[0].username).profile.eva.machines[E.IDS.eva02].damage, 0);
});

test('license is frozen at server start and gold, old XP and existing stock are not spent by auto maintenance', async (t) => {
  const box = await fixture(t);
  box.store.mutate(box.users[0], (p) => {
    p.eva.licenseExpiresAt = Date.now() + 60000;
    p.eva.autoRepair = true;
    p.eva.autoSupply = true;
  });
  const { started } = begin(box, 'license-snapshot', 'operation', 'mission.campaign.1', [
    { ammo: { 'ammo.precision': 20 } },
    {},
  ]);
  box.store.mutate(box.users[0], (p) => {
    p.eva.licenseExpiresAt = 0;
  });
  box.store.mutate(box.users[1], (p) => {
    p.eva.licenseExpiresAt = Date.now() + 60000;
  });
  const before = box.users.map((u) => box.store.byName(u.username).profile.eva.wallet.silver);
  const outcome = box.store.evaFinishRound(
    started.round,
    records(started, [
      { license: false, used: { 'ammo.precision': 4 }, hpFraction: 0.5 },
      { license: true, hpFraction: 0.5 },
    ]),
  );
  assert.equal(outcome.participants[0].record.license, true);
  assert.equal(outcome.participants[1].record.license, false);
  assert(outcome.participants[0].result.licenseBonus > 0);
  assert.equal(outcome.participants[1].result.licenseBonus, 0);
  const reward = outcome.participants[0].result;
  assert.equal(reward.supplyCost, 12);
  assert(reward.repairCost > 0);
  assert.equal(reward.silverNet, reward.silverGross - reward.repairCost - reward.supplyCost);
  assert.equal(
    box.store.byName(box.users[0].username).profile.eva.wallet.silver - before[0],
    reward.silverNet,
  );
  assert.equal(box.store.byName(box.users[0].username).profile.eva.stock['ammo.precision'], 20);
  assert.equal(box.store.byName(box.users[0].username).profile.eva.machines[E.IDS.eva02].damage, 0);
});

test('MAGI unowned trial leaves canonical account unchanged and recovery uses a healthy basic temporary machine', async (t) => {
  const box = await fixture(t, 1),
    user = box.users[0];
  box.store.mutate(user, (p) => {
    p.eva.machines[E.IDS.eva02].damage = 1;
    p.eva.machines[E.IDS.eva02].repairDue = 220;
    p.eva.wallet.silver = 0;
  });
  const before = box.store.byName(user.username).profile.eva;
  const target = E.defaultPreset(E.IDS.eva08, E.IDS.mari, E.IDS.maya);
  const { started } = begin(box, 'magi-trial', 'magi', 'mission.assault', [target]);
  const simulated = records(started, [
    { mode: 'magi', missionId: 'mission.assault', hpFraction: 0, completedStages: 3 },
  ]);
  box.store.evaFinishRound(started.round, simulated);
  assert.deepEqual(box.store.byName(user.username).profile.eva, before);
  const recovery = begin(box, 'recovery-trial', 'recovery', 'mission.recovery', [target]).started;
  assert.equal(recovery.participants[0].resolved.hpFraction, 1);
  assert.equal(recovery.participants[0].resolved.level, 1);
  assert.equal(recovery.participants[0].resolved.machineId, E.IDS.eva02);
  assert.equal(
    recovery.participants[0].resolved.stats.hp,
    E.createProfile().machines[E.IDS.eva02]
      ? E.MACHINES.find((m) => m.id === E.IDS.eva02).stats.hp
      : 0,
  );
  const result = box.store.evaFinishRound(
    recovery.round,
    records(recovery, [{ mode: 'recovery', missionId: 'mission.recovery' }]),
  );
  assert.equal(result.participants[0].result.silverGross, E.BALANCE.recoverySilver);
  const after = box.store.byName(user.username).profile.eva;
  assert.equal(after.wallet.silver, E.BALANCE.recoverySilver);
  assert.equal(after.machines[E.IDS.eva02].damage, 1);
  assert.deepEqual(after.stock, before.stock);
  assert.deepEqual(after.members, before.members);
  assert.equal(after.wallet.tickets, before.wallet.tickets);
});

test('manual order, replacement and redemption are unique, hash-only, transactional and safe to retry', async (t) => {
  const box = await fixture(t),
    [alice, bob] = box.users;
  assert.throws(() => box.store.quotaIssue('order-a', 'fixture-operator'), /登记收款/);
  box.store.quotaRecordPayment({
    orderId: 'order-a',
    tier: 'quota300',
    receiptReference: 'fixture-receipt-a',
    operator: 'fixture-operator',
  });
  assert.throws(
    () =>
      box.store.quotaRecordPayment({
        orderId: 'order-b',
        tier: 'quota300',
        receiptReference: 'fixture-receipt-a',
        operator: 'fixture-operator',
      }),
    /其他订单/,
  );
  const old = box.store.quotaIssue('order-a', 'fixture-operator');
  const voucher = box.store.quotaReissue('order-a', 'fixture-operator');
  assert.notEqual(old.code, voucher.code);
  assert.throws(
    () => box.store.evaAction(alice, 'redeem', { code: old.code }, 'redeem-old-voucher'),
    /撤销/,
  );
  const before = structuredClone(alice);
  sql(
    box.file,
    "CREATE TRIGGER fail_redeem BEFORE INSERT ON operations WHEN NEW.kind='eva:redeem' BEGIN SELECT RAISE(ABORT,'injected redeem failure'); END;",
  );
  assert.throws(
    () =>
      box.store.evaAction(
        alice,
        'redeem',
        { code: voucher.code, amount: 999999 },
        'redeem-new-voucher',
      ),
    /injected redeem failure/,
  );
  assert.deepEqual(box.store.byName(alice.username), before);
  assert.equal(
    box.store.quotaOrders().find((row) => row.suffix === voucher.suffix).voucher_state,
    'active',
  );
  sql(box.file, 'DROP TRIGGER fail_redeem');
  const result = box.store.evaAction(
    alice,
    'redeem',
    { code: voucher.code, amount: 999999 },
    'redeem-new-voucher',
  );
  assert.equal(result.amount, 300);
  assert.equal(alice.profile.eva.wallet.gold, 300);
  assert.deepEqual(
    box.store.evaAction(alice, 'redeem', { code: voucher.code }, 'redeem-new-voucher'),
    result,
  );
  assert.equal(
    box.store.evaAction(alice, 'redeem', { code: voucher.code }, 'redeem-same-account')
      .alreadyRedeemed,
    true,
  );
  assert.throws(
    () => box.store.evaAction(bob, 'redeem', { code: voucher.code }, 'redeem-other-user'),
    /已使用/,
  );
  assert.throws(() => box.store.quotaReissue('order-a', 'fixture-operator'), /已核销/);
  assert.throws(() => box.store.quotaRevoke('order-a', 'fixture-operator'), /已核销/);
  const ledger = JSON.stringify(box.store.operations(alice.username));
  assert(!ledger.includes(voucher.code));
  assert(!JSON.stringify(box.store.quotaOrders()).includes(voucher.code));
  const dump = scalar(
    box.file,
    'SELECT group_concat(token_hash) AS hashes FROM quota_vouchers',
  ).hashes;
  assert(!dump.includes(voucher.code));
  assert.equal(alice.profile.eva.wallet.gold, 300);
});

test('maintenance quota issuance does not abort an active game and explicit preview is read-only', async (t) => {
  const box = await fixture(t, 1),
    { started } = begin(box, 'admin-running-round');
  const snapshot = fs.readFileSync(box.file);
  const preview = await run(['migration-preview', '--database', box.file]);
  assert.equal(preview.readOnly, true);
  assert.equal(preview.schemaVersion, DATABASE_VERSION);
  assert.deepEqual(fs.readFileSync(box.file), snapshot);
  await run([
    'quota-confirm',
    '--database',
    box.file,
    '--order',
    'cli-order',
    '--tier',
    'quota60',
    '--receipt',
    'fixture-receipt-cli',
    '--operator',
    'fixture-operator',
  ]);
  const voucher = await run([
    'quota-issue',
    '--database',
    box.file,
    '--order',
    'cli-order',
    '--operator',
    'fixture-operator',
  ]);
  assert.match(voucher.code, /^EV3-/);
  assert.equal(box.store.evaRoundStatus(started.round), 'active');
  await assert.rejects(
    run(['migrate-eva', '--database', box.file, '--preview-hash', 'stale', '--offline']),
    /不匹配/,
  );
});

test('real legacy format previews and migrates wallets after pending historical rewards once', async (t) => {
  const box = await fixture(t, 1);
  box.store.close();
  const db = new DatabaseSync(box.file),
    D = require('../packages/simulation/dist/index.js');
  const legacy = D.Progression.createProfile();
  legacy.coins = 321;
  legacy.tickets = 7;
  legacy.characters.Asuka.xp = 1200;
  legacy.characters.Asuka.nodes = ['a-cannon-1'];
  legacy.inventory = ['pulse-coil'];
  legacy.equipment.Asuka.weapon = 'pulse-coil';
  const game = new D.Game(D.campaign(0), { coop: false });
  const result = {
    round: 'legacy-pending',
    mission: 0,
    stage: 0,
    status: 'won',
    score: 3,
    time: 10,
    participants: [
      { username: box.users[0].username, character: 'Asuka', stats: game.players[0].stats },
    ],
  };
  db.prepare('UPDATE profiles SET json=?,profile_version=1,content_version=1').run(
    JSON.stringify(legacy),
  );
  db.prepare("INSERT INTO rounds VALUES (?,?,'pending',?,NULL)").run(
    result.round,
    JSON.stringify(result),
    '2026-01-01T00:00:00.000Z',
  );
  db.close();
  const before = fs.readFileSync(box.file),
    preview = previewEvaMigration(box.file);
  assert.deepEqual(fs.readFileSync(box.file), before);
  assert.equal(preview.accounts[0].after.wallet.silver, 381);
  assert.equal(preview.accounts[0].after.wallet.gold, 0);
  assert.equal(preview.accounts[0].after.wallet.tickets, 8);
  assert.equal(preview.accounts[0].after.members[E.IDS.asuka].totalData, 1300);
  const applied = await run([
    'migrate-eva',
    '--database',
    box.file,
    '--preview-hash',
    preview.previewHash,
    '--offline',
  ]);
  assert(fs.existsSync(applied.schema.migrationBackup));
  box.store = createProfiles(box.file);
  const migrated = box.store.byName(box.users[0].username).profile;
  assert.equal(migrated.eva.wallet.silver, 381);
  assert.equal(migrated.eva.machines[E.IDS.eva02].data, 0);
  assert.equal(box.store.roundStatus('legacy-pending'), 'settled');
  const stable = structuredClone(migrated.eva);
  box.store.close();
  box.store = createProfiles(box.file);
  assert.deepEqual(box.store.byName(box.users[0].username).profile.eva, stable);
});

test('two independent SQLite connections race to redeem one voucher and exactly one account gains quota', async (t) => {
  const box = await fixture(t),
    { Worker } = require('node:worker_threads');
  box.store.quotaRecordPayment({
    orderId: 'race-order',
    tier: 'quota300',
    receiptReference: 'fixture-race-receipt',
    operator: 'fixture-operator',
  });
  const voucher = box.store.quotaIssue('race-order', 'fixture-operator');
  const gate = new SharedArrayBuffer(4),
    flag = new Int32Array(gate);
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    const store = require(workerData.module).createProfiles(workerData.file, { recoverRounds: false });
    parentPort.postMessage({ready:true});
    Atomics.wait(new Int32Array(workerData.gate),0,0);
    try { const user=store.byName(workerData.username); const result=store.evaAction(user,'redeem',{code:workerData.code},'race-voucher-operation'); parentPort.postMessage({ok:true,result}); }
    catch(error) { parentPort.postMessage({ok:false,message:error.message}); }
    finally { store.close(); }
  `;
  const workers = box.users.map((user) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        module: path.join(__dirname, 'profiles.cjs'),
        file: box.file,
        username: user.username,
        code: voucher.code,
        gate,
      },
    });
    let signalReady, signalResult;
    const ready = new Promise((resolve, reject) => {
      signalReady = resolve;
      worker.once('error', reject);
    });
    const result = new Promise((resolve, reject) => {
      signalResult = resolve;
      worker.once('error', reject);
    });
    worker.on('message', (message) => (message.ready ? signalReady() : signalResult(message)));
    t.after(() => worker.terminate());
    return { ready, result };
  });
  await Promise.all(workers.map((w) => w.ready));
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0, 2);
  const results = await Promise.all(workers.map((w) => w.result));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.match(results.find((r) => !r.ok).message, /已使用/);
  assert.equal(
    box.users.reduce(
      (total, user) => total + box.store.byName(user.username).profile.eva.wallet.gold,
      0,
    ),
    300,
  );
  assert.equal(
    box.store.quotaAudit('race-order').filter((item) => item.action === 'redeem').length,
    1,
  );
});

test('insufficient automatic repair and replenishment never spend quota or discard confirmed returns', async (t) => {
  const box = await fixture(t, 1),
    user = box.users[0];
  box.store.mutate(user, (p) => {
    p.eva.wallet.silver = 0;
    p.eva.wallet.gold = 980;
    p.eva.autoRepair = true;
    p.eva.autoSupply = true;
  });
  const { started } = begin(box, 'insufficient-maintenance', 'operation', 'mission.campaign.1', [
    { ammo: { 'ammo.precision': 20 } },
  ]);
  const outcome = box.store.evaFinishRound(
    started.round,
    records(started, [
      {
        won: false,
        elapsed: 1,
        completedStages: 0,
        events: [],
        hpFraction: 0,
        used: { 'ammo.precision': 4 },
      },
    ]),
  );
  const after = box.store.byName(user.username).profile.eva,
    reward = outcome.participants[0].result;
  assert.equal(after.wallet.gold, 980);
  assert.equal(after.wallet.silver, 0);
  assert.equal(after.stock['ammo.precision'], 16);
  assert.equal(after.machines[E.IDS.eva02].damage, 1);
  assert.equal(reward.repairCost, 0);
  assert.equal(reward.supplyCost, 0);
  assert(reward.maintenanceShortfall > 0);
});

test('difficulty is frozen, rejects changed terminal difficulty and reads back for complete and aborted replays', async (t) => {
  const box = await fixture(t, 1);
  const first = begin(box, 'difficulty-default').started;
  box.store.evaFinishRound(first.round, records(first));
  assert.equal(box.store.evaReview(box.users[0], first.round).record.difficulty, 'normal');
  const user = box.store.byName(box.users[0].username);
  const participants = [
    E.resolveLoadout(user.profile.eva, user.profile.eva.presets[0], {
      entityId: 'entity-1',
      accountId: user.username,
    }),
  ];
  const context = {
    round: 'difficulty-hard',
    mode: 'operation',
    missionId: 'mission.campaign.1',
    seed: 42,
    condition: null,
    difficulty: 'hard',
    participants,
  };
  assert.throws(
    () => box.store.evaBeginRound({ ...context, difficulty: 'impossible' }),
    /难度无效/,
  );
  const hard = box.store.evaBeginRound(context);
  assert.throws(() => box.store.evaBeginRound({ ...context, difficulty: 'relaxed' }), /另一场战斗/);
  assert.throws(
    () => box.store.evaFinishRound(hard.round, records(hard, [{ difficulty: 'relaxed' }])),
    /难度与开局快照/,
  );
  box.store.evaFinishRound(hard.round, records(hard, [{ difficulty: 'hard' }]));
  const review = box.store.evaReview(box.users[0], hard.round);
  assert.equal(review.record.difficulty, 'hard');
  assert.equal(review.review.difficulty, 'hard');
  const relaxed = box.store.evaBeginRound({
    ...context,
    round: 'difficulty-relaxed-abort',
    difficulty: 'relaxed',
  });
  box.store.evaAbortRound(relaxed.round);
  assert.equal(box.store.evaReview(box.users[0], relaxed.round).record.difficulty, 'relaxed');
});
