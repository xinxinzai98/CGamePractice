const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { createProfiles, blank } = require('./profiles.cjs');
function location(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-sqlite-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'profiles.sqlite') };
}
test('legacy JSON imports once without changing original or overwriting SQLite data', async (t) => {
  const { dir, file } = location(t),
    legacy = path.join(dir, 'profiles.json');
  const original = JSON.stringify({
    users: {
      pilot: { username: 'pilot', salt: 'abc', hash: 'def', profile: { ...blank(), coins: 123 } },
    },
  });
  fs.writeFileSync(legacy, original);
  let store = createProfiles(file);
  assert.equal(store.byName('pilot').profile.coins, 123);
  store.mutate(store.byName('pilot'), (p) => (p.coins = 456));
  store.close();
  store = createProfiles(file);
  assert.equal(store.byName('pilot').profile.coins, 456);
  assert.equal(fs.readFileSync(legacy, 'utf8'), original);
  store.close();
});
test('transaction errors roll back profile and event ledger without corrupting returned user', async (t) => {
  const { file } = location(t),
    store = createProfiles(file);
  try {
    const user = await store.register('rollback_pilot', 'password123', { setHeader() {} });
    const before = structuredClone(user.profile);
    assert.throws(
      () =>
        store.mutate(
          user,
          (p) => {
            p.coins = 999;
            p.inventory.push('pulse-coil');
            throw Error('forced failure');
          },
          'test-event',
          'test',
        ),
      /forced failure/,
    );
    assert.deepEqual(user.profile, before);
    assert.deepEqual(store.byName(user.username).profile, before);
    store.mutate(user, (p) => (p.coins = 1), 'test-event', 'test');
    assert.equal(store.byName(user.username).profile.coins, 1);
  } finally {
    store.close();
  }
});
test('round ledger prevents duplicate rewards after reopening database', async (t) => {
  const { file } = location(t);
  let store = createProfiles(file);
  await store.register('reward_pilot', 'password123', { setHeader() {} });
  const game = { status: 'won', players: [], score: 100, time: 10 },
    room = { round: 'unique-round', mission: 0, stage: 0 };
  assert.equal(store.award('reward_pilot', 'Asuka', game, room), true);
  assert.equal(store.award('reward_pilot', 'Asuka', game, room), false);
  store.close();
  store = createProfiles(file);
  assert.equal(store.award('reward_pilot', 'Asuka', game, room), false);
  const p = store.byName('reward_pilot').profile;
  assert.equal(p.coins, 60);
  assert.equal(p.tickets, 1);
  assert.equal(p.records.wins, 1);
  store.close();
});
test('SQLite write rejection rolls back debit and preserves caller snapshot', async (t) => {
  const { file } = location(t),
    store = createProfiles(file),
    { DatabaseSync } = require('node:sqlite');
  try {
    const user = await store.register('sql_failure', 'password123', { setHeader() {} });
    store.mutate(user, (p) => (p.coins = 100));
    const before = structuredClone(user.profile),
      observer = new DatabaseSync(file);
    observer.exec(
      "CREATE TRIGGER reject_profile_update BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'test write rejection'); END;",
    );
    assert.throws(
      () =>
        store.mutate(user, (p) => {
          p.coins -= 90;
          p.inventory.push('pulse-coil');
        }),
      /test write rejection/,
    );
    assert.deepEqual(user.profile, before);
    assert.deepEqual(store.byName(user.username).profile, before);
    observer.exec('DROP TRIGGER reject_profile_update');
    observer.close();
  } finally {
    store.close();
  }
});
