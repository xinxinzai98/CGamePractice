'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createProfiles } = require('./profiles.cjs');
const { verifyDatabase, snapshotDatabase, run } = require('./maintenance.cjs');

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-maintenance-'));
  const file = path.join(dir, 'profiles.sqlite');
  const store = createProfiles(file);
  const user = await store.register('maintenance_pilot', 'fixture-password', { setHeader() {} });
  store.mutate(user, (p) => {
    p.coins = 321;
  });
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, file, store };
}

test('backup captures committed WAL while source is open, restore preserves accounts and permissions', async (t) => {
  const { dir, file, store } = await fixture(t);
  const backup = path.join(dir, 'backups with spaces', "pilot's-backup.sqlite");
  assert(fs.existsSync(file + '-wal'));
  const result = snapshotDatabase(file, backup);
  assert.equal(result.accounts, 1);
  assert.equal(result.integrity, 'ok');
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
  store.mutate(store.byName('maintenance_pilot'), (p) => {
    p.coins = 999;
  });
  const restored = path.join(dir, 'restore-drill.sqlite');
  await run(['restore', '--backup', backup, '--database', restored]);
  const recovered = createProfiles(restored);
  try {
    assert.equal(recovered.byName('maintenance_pilot').profile.coins, 321);
    assert.equal(
      (await recovered.login('maintenance_pilot', 'fixture-password', { setHeader() {} })).username,
      'maintenance_pilot',
    );
    assert.equal(store.byName('maintenance_pilot').profile.coins, 999);
  } finally {
    recovered.close();
  }
});

test('backup and restore refuse existing targets without changing their bytes', async (t) => {
  const { dir, file } = await fixture(t);
  const target = path.join(dir, 'do-not-overwrite.sqlite');
  fs.writeFileSync(target, 'keep existing data');
  assert.throws(() => snapshotDatabase(file, target), { code: 'EEXIST' });
  await assert.rejects(run(['restore', '--backup', file, '--database', target]), {
    code: 'EEXIST',
  });
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep existing data');
  assert.throws(() => snapshotDatabase(file, file));
  assert.equal(verifyDatabase(file).accounts, 1);
  const orphan = path.join(dir, 'orphan.sqlite');
  fs.writeFileSync(orphan + '-wal', 'old wal');
  assert.throws(() => snapshotDatabase(file, orphan), /日志文件/);
  assert(!fs.existsSync(orphan));
  assert.equal(fs.readFileSync(orphan + '-wal', 'utf8'), 'old wal');
});

test('verification rejects unrelated SQLite and invalid profile relations before writing a backup', async (t) => {
  const { dir, file } = await fixture(t);
  const unrelated = path.join(dir, 'other.sqlite');
  const other = new DatabaseSync(unrelated);
  other.exec('CREATE TABLE unrelated(value TEXT)');
  other.close();
  assert.throws(() => verifyDatabase(unrelated), /缺少游戏数据表/);
  const observer = new DatabaseSync(file);
  observer.exec('DELETE FROM profiles');
  observer.close();
  const backup = path.join(dir, 'invalid-backup.sqlite');
  assert.throws(() => snapshotDatabase(file, backup), /没有个人档案/);
  assert(!fs.existsSync(backup));
});

test('verification is read-only and never creates a missing database', async (t) => {
  const { dir, file } = await fixture(t);
  const before = fs.readFileSync(file);
  assert.equal(verifyDatabase(file).profiles, 1);
  assert.deepEqual(fs.readFileSync(file), before);
  const missing = path.join(dir, 'missing.sqlite');
  assert.throws(() => verifyDatabase(missing));
  assert(!fs.existsSync(missing));
});

test('test account seeding uses explicit environment password and preserves existing accounts', async (t) => {
  const { file, store } = await fixture(t);
  const result = await run(
    ['seed-test', '--database', file, '--username', 'Test_Rei', '--pilot', 'Rei'],
    { DAWN_TEST_PASSWORD: 'environment-test-password' },
  );
  assert.equal(result.testResources, true);
  assert(!JSON.stringify(result).includes('environment-test-password'));
  const user = store.byName('Test_Rei');
  assert.equal(user.profile.coins, 2000);
  assert.equal(user.profile.tickets, 10);
  assert.equal(user.profile.characters.Rei.xp, 2400);
  assert.equal(user.profile.appearance.pilot, 'Rei');
  assert.equal(user.profile.unlocked, 12);
  await store.login('Test_Rei', 'environment-test-password', { setHeader() {} });
  await assert.rejects(
    run(['seed-test', '--database', file, '--username', 'Test_Rei', '--pilot', 'Asuka'], {
      DAWN_TEST_PASSWORD: 'another-test-password',
    }),
    /用户名已存在/,
  );
  assert.equal(store.byName('maintenance_pilot').profile.coins, 321);
  assert.equal(store.byName('Test_Rei').profile.appearance.pilot, 'Rei');
});

test('test seeding rejects default player database and password arguments', async () => {
  await assert.rejects(
    run(
      [
        'seed-test',
        '--database',
        path.resolve(__dirname, '../data/profiles.sqlite'),
        '--username',
        'Test_Refused',
        '--pilot',
        'Asuka',
      ],
      { DAWN_TEST_PASSWORD: 'environment-test-password' },
    ),
    /不能写入默认玩家库/,
  );
  await assert.rejects(
    run(
      [
        'seed-test',
        '--database',
        'unused.sqlite',
        '--username',
        'Test_Refused',
        '--pilot',
        'Asuka',
      ],
      {},
    ),
    /DAWN_TEST_PASSWORD/,
  );
  await assert.rejects(
    run([
      'reset-password',
      '--database',
      'unused.sqlite',
      '--username',
      'Test_Refused',
      '--password',
      'do-not-accept',
    ]),
    /无效或重复参数/,
  );
});

test('offline password reset preserves progress and requires explicit stopped-service acknowledgement', async (t) => {
  const { file, store } = await fixture(t);
  const args = ['reset-password', '--database', file, '--username', 'maintenance_pilot'];
  await assert.rejects(
    run(args, { DAWN_ADMIN_PASSWORD: 'new-environment-password' }),
    /停止游戏服务/,
  );
  const before = structuredClone(store.byName('maintenance_pilot').profile);
  const result = await run([...args, '--offline'], {
    DAWN_ADMIN_PASSWORD: 'new-environment-password',
  });
  assert.equal(result.username, 'maintenance_pilot');
  assert(!JSON.stringify(result).includes('new-environment-password'));
  await assert.rejects(
    store.login('maintenance_pilot', 'fixture-password', { setHeader() {} }),
    /用户名或密码错误/,
  );
  await store.login('maintenance_pilot', 'new-environment-password', { setHeader() {} });
  assert.deepEqual(store.byName('maintenance_pilot').profile, before);
});
