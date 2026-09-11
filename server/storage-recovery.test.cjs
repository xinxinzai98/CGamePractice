'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createProfiles, blank } = require('./profiles.cjs');
const D = require('../packages/simulation/dist/index.js');
const { DATABASE_VERSION, PROFILE_VERSION, CONTENT_VERSION } = require('./profile-migrations.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-storage-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'profiles.sqlite') };
}
const response = () => ({
  cookie: '',
  setHeader(name, value) {
    if (name === 'Set-Cookie') this.cookie = value;
  },
});
const request = (res) => ({ headers: { cookie: res.cookie } });
const register = (store, name) => store.register(name, 'password123', response());
function round(roundId = 'recover-round', mission = 0, stage = 0) {
  const game = new D.Game(D.campaign(0), { coop: true });
  return {
    round: roundId,
    mission,
    stage,
    status: 'won',
    score: 10,
    time: 12.5,
    participants: game.players.map((p, i) => ({
      username: `pilot_${i + 1}`,
      character: p.character,
      stats: p.stats,
    })),
  };
}
function oldDatabase(file, profile = D.Progression.createProfile()) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (key TEXT PRIMARY KEY,username TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);
    CREATE TABLE profiles (user_key TEXT PRIMARY KEY REFERENCES users(key),json TEXT NOT NULL);
    CREATE TABLE ledger (user_key TEXT NOT NULL,event_key TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(user_key,event_key));
    CREATE TABLE migrations (name TEXT PRIMARY KEY,at TEXT NOT NULL);
    INSERT INTO users VALUES ('old_pilot','old_pilot','saved-salt','saved-hash');
    INSERT INTO migrations VALUES ('legacy-json-v1','2026-01-01T00:00:00.000Z');
  `);
  db.prepare('INSERT INTO profiles VALUES (?,?)').run('old_pilot', JSON.stringify(profile));
  db.close();
}

test('unversioned SQLite migration backs up and preserves coins, gear, skills and battle history', (t) => {
  const { file } = fixture(t),
    p = D.Progression.createProfile();
  p.coins = 2000;
  p.tickets = 10;
  p.unlocked = 7;
  p.characters.Asuka = { xp: 2400, nodes: ['a-cannon-1', 'a-cannon-2', 'a-cannon-3'] };
  p.inventory = ['pulse-coil'];
  p.equipment.Asuka.weapon = 'pulse-coil';
  p.records.wins = 1;
  p.records.history = [
    {
      round: 'old-round',
      at: '2026-01-01T00:00:00.000Z',
      character: 'Asuka',
      mission: 0,
      stage: 0,
      won: true,
      xp: 100,
      score: 0,
      time: 12,
      stats: round().participants[0].stats,
    },
  ];
  oldDatabase(file, p);
  const store = createProfiles(file);
  try {
    const user = store.byName('old_pilot');
    assert.deepEqual(user.profile, { ...p, eva: D.Eva.migrateProfile(p) });
    assert.equal(user.revision, 0);
    const info = store.schemaInfo();
    assert.equal(info.databaseVersion, DATABASE_VERSION);
    assert.equal(info.profileVersion, PROFILE_VERSION);
    assert.equal(info.contentVersion, CONTENT_VERSION);
    assert(fs.existsSync(info.migrationBackup));
    const backup = new DatabaseSync(info.migrationBackup, { readOnly: true });
    try {
      assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0);
      assert.deepEqual(JSON.parse(backup.prepare('SELECT json FROM profiles').get().json), p);
    } finally {
      backup.close();
    }
  } finally {
    store.close();
  }
  const second = createProfiles(file);
  try {
    assert.equal(second.schemaInfo().migrationBackup, null);
  } finally {
    second.close();
  }
});

test('failed migration leaves old schema and malformed data intact with a restorable backup', (t) => {
  const { dir, file } = fixture(t),
    source = { coins: 'do-not-reset-me' };
  oldDatabase(file, source);
  assert.throws(() => createProfiles(file), /expected object/);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
    assert.deepEqual(
      db
        .prepare('PRAGMA table_info(profiles)')
        .all()
        .map((x) => x.name),
      ['user_key', 'json'],
    );
    assert.deepEqual(JSON.parse(db.prepare('SELECT json FROM profiles').get().json), source);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='operations'").get().n,
      0,
    );
  } finally {
    db.close();
  }
  assert.equal(
    fs.readdirSync(dir).filter((name) => name.includes(`.before-v${DATABASE_VERSION}-`)).length,
    1,
  );
});

test('newer database and content versions reject startup without rewriting progress', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file);
  const original = await register(store, 'future_pilot');
  store.close();
  let db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version=${DATABASE_VERSION + 1}`);
  db.close();
  assert.throws(() => createProfiles(file), /newer game server/);
  db = new DatabaseSync(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, DATABASE_VERSION + 1);
    db.exec(
      `PRAGMA user_version=${DATABASE_VERSION}; UPDATE profiles SET content_version=${CONTENT_VERSION + 1}`,
    );
  } finally {
    db.close();
  }
  assert.throws(() => createProfiles(file), /Unsupported saved profile or content version/);
  db = new DatabaseSync(file, { readOnly: true });
  try {
    const saved = db.prepare('SELECT * FROM profiles').get();
    assert.equal(saved.content_version, CONTENT_VERSION + 1);
    assert.deepEqual(JSON.parse(saved.json), original.profile);
  } finally {
    db.close();
  }
});

test('revision uses latest persisted profile and failed writes leave snapshots and revision untouched', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file);
  try {
    const user = await register(store, 'revision_pilot'),
      stale = store.byName(user.username);
    store.mutate(user, (p) => {
      p.coins = 100;
    });
    store.mutate(stale, (p) => {
      p.coins += 50;
    });
    assert.equal(stale.revision, 2);
    assert.equal(stale.profile.coins, 150);
    const snapshot = structuredClone(stale);
    assert.throws(
      () =>
        store.mutate(stale, (p) => {
          p.coins = -1;
        }),
      /invalid number/,
    );
    assert.deepEqual(stale, snapshot);
    assert.equal(store.byName(user.username).revision, 2);
    assert.equal(store.operations(user.username).length, 2);
  } finally {
    store.close();
  }
});

test('draw operation retry returns original reward across restart with no second debit or revision', async (t) => {
  const { file } = fixture(t);
  let store = createProfiles(file);
  const user = await register(store, 'draw_retry');
  store.completeTutorial(user, 'tutorial-request');
  const reward = store.draw(user, 'draw-request-001'),
    revision = user.revision;
  assert.deepEqual(store.draw(user, 'draw-request-001'), reward);
  assert.equal(user.revision, revision);
  assert.equal(user.profile.tickets, 2);
  store.close();
  store = createProfiles(file);
  try {
    const reloaded = store.byName(user.username);
    assert.deepEqual(store.draw(reloaded, 'draw-request-001'), reward);
    assert.equal(reloaded.revision, revision);
    assert.equal(reloaded.profile.drawHistory.length, 1);
    assert.throws(() => store.draw(reloaded), /操作编号/);
    assert.throws(() => store.purchase(reloaded, 'pulse-coil', 'draw-request-001'), /另一项请求/);
    const op = store.operations(user.username).find((o) => o.operation_id === 'draw-request-001');
    assert.deepEqual(JSON.parse(op.result_json), reward);
    assert.equal(JSON.parse(op.delta_json).tickets, -1);
    assert.equal(JSON.parse(op.balance_json).before.tickets, 3);
    assert.equal(JSON.parse(op.balance_json).after.tickets, 2);
    assert.equal(reloaded.profile.tickets, 2);
  } finally {
    store.close();
  }
});

test('purchases and tutorial retries preserve results and reject operation ID reuse for a different item', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file);
  try {
    const user = await register(store, 'shop_retry');
    store.mutate(user, (p) => {
      p.coins = 1000;
    });
    const result = store.purchase(user, 'pulse-coil', 'purchase-request');
    assert.deepEqual(store.purchase(user, 'pulse-coil', 'purchase-request'), result);
    assert.equal(user.profile.coins, 910);
    assert.equal(user.revision, 2);
    assert.throws(() => store.purchase(user, 'at-lining', 'purchase-request'), /另一项请求/);
    const tutorial = store.completeTutorial(user, 'tutorial-one');
    assert.deepEqual(store.completeTutorial(user, 'tutorial-one'), tutorial);
    assert.deepEqual(store.completeTutorial(user, 'tutorial-two'), { granted: false, tickets: 0 });
    assert.equal(user.profile.tickets, 3);
  } finally {
    store.close();
  }
});

test('economy journal outlives capped draw history and SQL failure rolls back rewards and ledger together', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file),
    db = new DatabaseSync(file);
  try {
    const user = await register(store, 'journal_pilot');
    store.mutate(user, (p) => {
      p.tickets = 40;
    });
    for (let i = 0; i < 35; i++) store.draw(user, `journal-draw-${i}`);
    assert.equal(user.profile.drawHistory.length, 30);
    assert.equal(store.operations(user.username).filter((o) => o.kind === 'draw').length, 35);
    const before = structuredClone(user);
    db.exec(
      "CREATE TRIGGER reject_operation BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT,'journal failure'); END;",
    );
    assert.throws(() => store.draw(user, 'failed-draw-op'), /journal failure/);
    assert.deepEqual(user, before);
    assert.deepEqual(store.byName(user.username), before);
    assert.equal(store.operations(user.username).length, 36);
    db.exec('DROP TRIGGER reject_operation');
    store.draw(user, 'failed-draw-op');
    assert.equal(user.profile.tickets, 4);
  } finally {
    db.close();
    store.close();
  }
});

test('second player write failure rolls back both rewards, then startup recovers registered round exactly once', async (t) => {
  const { file } = fixture(t);
  let store = createProfiles(file);
  await register(store, 'pilot_1');
  await register(store, 'pilot_2');
  const result = round();
  assert.equal(store.recordRound(result), true);
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TRIGGER reject_second_player BEFORE UPDATE ON profiles WHEN NEW.user_key='pilot_2' BEGIN SELECT RAISE(ABORT,'second player failure'); END;",
  );
  assert.throws(() => store.settleRound(result.round), /second player failure/);
  assert.equal(store.roundStatus(result.round), 'pending');
  assert.equal(store.health().pendingRounds, 1);
  for (const name of ['pilot_1', 'pilot_2']) {
    const user = store.byName(name);
    assert.equal(user.profile.coins, 0);
    assert.equal(user.profile.records.wins, 0);
    assert.equal(user.revision, 0);
    assert.deepEqual(store.operations(name), []);
  }
  store.close();
  assert.throws(() => createProfiles(file), /second player failure/);
  db.exec('DROP TRIGGER reject_second_player');
  db.close();
  store = createProfiles(file);
  try {
    assert.equal(store.roundStatus(result.round), 'settled');
    assert.equal(store.recordRound(result), false);
    assert.equal(store.settleRound(result.round), false);
    assert.equal(store.settlePending(), 0);
    for (const name of ['pilot_1', 'pilot_2']) {
      const user = store.byName(name);
      assert.equal(user.profile.coins, 60);
      assert.equal(user.profile.records.wins, 1);
      assert.equal(user.profile.unlocked, 2);
      assert.equal(user.revision, 1);
      assert.equal(store.operations(name).filter((o) => o.kind === 'battle').length, 1);
    }
  } finally {
    store.close();
  }
});

test('round identity rejects duplicate account seats and conflicting results, and recording failure grants nothing', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file),
    db = new DatabaseSync(file);
  try {
    await register(store, 'pilot_1');
    await register(store, 'pilot_2');
    const duplicate = round();
    duplicate.participants[1].username = 'PILOT_1';
    assert.throws(() => store.recordRound(duplicate), /twice/);
    assert.equal(store.roundStatus(duplicate.round), null);
    db.exec(
      "CREATE TRIGGER reject_round BEFORE INSERT ON rounds BEGIN SELECT RAISE(ABORT,'cannot record result'); END;",
    );
    assert.throws(() => store.recordRound(round()), /cannot record result/);
    assert.throws(() => store.settleRound('recover-round'), /not been recorded/);
    assert.equal(store.byName('pilot_1').profile.coins, 0);
    db.exec('DROP TRIGGER reject_round');
    store.recordRound(round());
    assert.throws(() => store.recordRound({ ...round(), score: 999 }), /conflicts/);
    store.settleRound('recover-round');
    assert.equal(store.byName('pilot_1').profile.records.history[0].score, 10);
  } finally {
    db.close();
    store.close();
  }
});

test('being carried through a later stage grants rewards without skipping personal unlock progression', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file);
  try {
    await register(store, 'pilot_1');
    await register(store, 'pilot_2');
    for (const r of [
      round('late-round', 3, 2),
      round('first-round', 0, 0),
      round('repeat-first', 0, 0),
      round('third-too-early', 0, 2),
    ]) {
      store.recordRound(r);
      store.settleRound(r.round);
    }
    const p = store.byName('pilot_1').profile;
    assert.equal(p.unlocked, 2);
    assert.equal(p.records.wins, 4);
    assert.equal(p.tickets, 4);
    const next = round('next-stage', 0, 1);
    store.recordRound(next);
    store.settleRound(next.round);
    assert.equal(store.byName('pilot_1').profile.unlocked, 3);
  } finally {
    store.close();
  }
});

test('password change revokes every old session, issues only a fresh secure cookie and stores no password in journal', async (t) => {
  const { file } = fixture(t),
    store = createProfiles(file, { secureCookies: true });
  try {
    const first = response(),
      second = response(),
      changed = response();
    const user = await store.register('password_pilot', 'password123', first);
    await store.login(user.username, 'password123', second);
    assert.equal(store.sessionValid(request(first)), true);
    await assert.rejects(
      () => store.changePassword(user, 'wrong-password', 'new-password-456', changed),
      /当前密码错误/,
    );
    assert.equal(store.sessionValid(request(first)), true);
    const updated = await store.changePassword(user, 'password123', 'new-password-456', changed);
    assert.equal(updated.revision, 1);
    assert.equal(store.sessionValid(request(first)), false);
    assert.equal(store.sessionValid(request(second)), false);
    assert.equal(store.get(request(first)), null);
    assert.equal(store.get(request(changed)).username, user.username);
    assert.match(changed.cookie, /; Secure/);
    await assert.rejects(
      () => store.login(user.username, 'password123', response()),
      /用户名或密码错误/,
    );
    await store.login(user.username, 'new-password-456', response());
    const log = JSON.stringify(store.operations(user.username));
    assert(!log.includes('new-password-456'));
    assert(!log.includes(updated.hash));
    await store.resetPassword(user.username, 'admin-recovery-789');
    assert.equal(store.sessionValid(request(changed)), false);
    await store.login(user.username, 'admin-recovery-789', response());
    assert.equal(store.byName(user.username).revision, 2);
    assert.equal(store.operations(user.username).at(-1).kind, 'password-reset');
  } finally {
    store.close();
  }
});
