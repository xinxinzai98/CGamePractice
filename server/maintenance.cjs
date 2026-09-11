'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DATABASE = path.resolve(__dirname, '../data/profiles.sqlite');

function verifyDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw Error('SQLite 完整性检查失败');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('SQLite 外键检查失败');
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    for (const name of ['users', 'profiles', 'ledger', 'migrations'])
      if (!tables.has(name)) throw Error(`缺少游戏数据表：${name}`);
    const missing = db
      .prepare(
        'SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_key=u.key WHERE p.user_key IS NULL',
      )
      .get().n;
    if (missing) throw Error('存在没有个人档案的账号');
    for (const row of db.prepare('SELECT json FROM profiles').iterate()) {
      const profile = JSON.parse(row.json);
      if (!profile || typeof profile !== 'object' || Array.isArray(profile))
        throw Error('个人档案不是 JSON 对象');
    }
    return {
      schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
      accounts: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      profiles: db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n,
      integrity: 'ok',
    };
  } finally {
    db.close();
  }
}

function snapshotDatabase(source, destination) {
  const input = path.resolve(source),
    output = path.resolve(destination);
  verifyDatabase(input);
  if (['-wal', '-shm', '-journal'].some((suffix) => fs.existsSync(output + suffix)))
    throw Error('目标存在SQLite日志文件，请改用新的恢复目录');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const fd = fs.openSync(output, 'wx', 0o600);
  fs.closeSync(fd);
  let db;
  try {
    db = new DatabaseSync(input, { readOnly: true });
    // SQLite copies a consistent committed snapshot, including an open database's WAL.
    db.prepare('VACUUM INTO ?').run(output);
    return { source: input, destination: output, ...verifyDatabase(output) };
  } catch (error) {
    fs.unlinkSync(output);
    throw error;
  } finally {
    db?.close();
  }
}

function passwordFrom(env, key) {
  const password = env[key];
  if (!password) throw Error(`请通过环境变量 ${key} 提供密码；不要放入命令参数`);
  return password;
}

async function seedTestAccount(file, username, pilot, password) {
  const database = path.resolve(file);
  const canonical = (p) => (fs.existsSync(p) ? fs.realpathSync(p) : p);
  if (canonical(database) === canonical(DEFAULT_DATABASE))
    throw Error('测试账号必须使用明确指定的独立测试库，不能写入默认玩家库');
  if (!['Asuka', 'Rei'].includes(pilot)) throw Error('看板角色须为 Asuka 或 Rei');
  const store = require('./profiles.cjs').createProfiles(database, { recoverRounds: false });
  try {
    const user = await store.register(username, password, { setHeader() {} });
    store.mutate(user, (p) => {
      p.coins = 2000;
      p.tickets = 10;
      p.unlocked = 12;
      p.characters.Asuka.xp = 2400;
      p.characters.Rei.xp = 2400;
      p.appearance.pilot = pilot;
      p.eva.wallet.silver = 2000;
      p.eva.wallet.tickets = 10;
      for (const machine of Object.values(p.eva.machines)) {
        machine.data = 5000;
        machine.totalData = 5000;
      }
      for (const member of Object.values(p.eva.members)) {
        member.data = 5000;
        member.totalData = 5000;
      }
    });
    return {
      database,
      username: user.username,
      testResources: true,
      coins: user.profile.coins,
      tickets: user.profile.tickets,
      characterXp: 2400,
      unlockedStages: user.profile.unlocked,
    };
  } finally {
    store.close();
  }
}

async function resetPassword(file, username, password) {
  verifyDatabase(file);
  const store = require('./profiles.cjs').createProfiles(file, { recoverRounds: false });
  try {
    return { database: path.resolve(file), ...(await store.resetPassword(username, password)) };
  } finally {
    store.close();
  }
}

function previewEvaMigration(file) {
  const information = verifyDatabase(file),
    db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db
      .prepare(
        'SELECT u.username,p.* FROM profiles p JOIN users u ON u.key=p.user_key ORDER BY p.user_key',
      )
      .all();
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const pending = tables.has('rounds')
      ? db.prepare("SELECT * FROM rounds WHERE state='pending' ORDER BY round_id").all()
      : [];
    const operations = tables.has('operations')
      ? db
          .prepare('SELECT user_key,operation_id FROM operations ORDER BY user_key,operation_id')
          .all()
      : [];
    const { parseEnvelope, applyLegacyAward } = require('./profiles.cjs');
    const accounts = rows.map((row) => {
      const before = JSON.parse(row.json),
        raw = structuredClone(before);
      const appliedPending = [];
      for (const pendingRound of pending) {
        const result = { ...JSON.parse(pendingRound.result_json), at: pendingRound.recorded_at };
        const participant = result.participants.find(
          (p) => p.username.toLowerCase() === row.user_key,
        );
        if (
          participant &&
          !operations.some(
            (o) =>
              o.user_key === row.user_key && o.operation_id === `round:${pendingRound.round_id}`,
          )
        ) {
          applyLegacyAward(raw, result, participant);
          appliedPending.push(pendingRound.round_id);
        }
      }
      const after = parseEnvelope(raw);
      return {
        username: row.username,
        revision: row.revision || 0,
        alreadyMigrated: before.eva !== undefined,
        pendingLegacyRounds: appliedPending,
        before: {
          coins: before.coins,
          tickets: before.tickets,
          pity: before.pity,
          characters: before.characters,
          inventory: before.inventory,
          equipment: before.equipment,
          records: before.records,
          eva: before.eva || null,
        },
        after: after.eva,
        changed: before.eva === undefined || appliedPending.length > 0,
      };
    });
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ version: information.schemaVersion, rows, pending, operations }))
      .digest('hex');
    return {
      database: path.resolve(file),
      readOnly: true,
      ...information,
      previewHash: fingerprint,
      pendingLegacyRounds: pending.length,
      accounts,
    };
  } finally {
    db.close();
  }
}
function applyEvaMigration(file, expectedHash) {
  const preview = previewEvaMigration(file);
  if (preview.previewHash !== expectedHash)
    throw Error('迁移预览已过期或不匹配；请重新运行 migration-preview 并核对');
  const store = require('./profiles.cjs').createProfiles(file);
  try {
    return {
      database: path.resolve(file),
      migrated: true,
      schema: store.schemaInfo(),
      accounts: preview.accounts.map((entry) => ({
        username: entry.username,
        eva: store.byName(entry.username).profile.eva,
      })),
    };
  } finally {
    store.close();
  }
}
function quotaCommand(command, options) {
  verifyDatabase(options.database);
  const store = require('./profiles.cjs').createProfiles(options.database, {
    recoverRounds: false,
  });
  try {
    if (command === 'quota-confirm')
      return store.quotaRecordPayment({
        orderId: options.order,
        tier: options.tier,
        receiptReference: options.receipt,
        operator: options.operator,
      });
    if (command === 'quota-issue') return store.quotaIssue(options.order, options.operator);
    if (command === 'quota-reissue') return store.quotaReissue(options.order, options.operator);
    if (command === 'quota-revoke') return store.quotaRevoke(options.order, options.operator);
    if (command === 'quota-audit') return store.quotaAudit(options.order);
    return store.quotaOrders();
  } finally {
    store.close();
  }
}

const commands = {
  verify: ['database'],
  backup: ['database', 'output'],
  restore: ['backup', 'database'],
  'seed-test': ['database', 'username', 'pilot'],
  'reset-password': ['database', 'username', 'offline'],
  'migration-preview': ['database'],
  'migrate-eva': ['database', 'preview-hash', 'offline'],
  'quota-confirm': ['database', 'order', 'tier', 'receipt', 'operator'],
  'quota-issue': ['database', 'order', 'operator'],
  'quota-reissue': ['database', 'order', 'operator'],
  'quota-revoke': ['database', 'order', 'operator'],
  'quota-orders': ['database'],
  'quota-audit': ['database', 'order'],
};

async function run(args, env = process.env) {
  const [command, ...flags] = args;
  if (!commands[command])
    throw Error(`命令：${Object.keys(commands).join('、')}；用法见 docs/multiplayer.md`);
  const options = {};
  for (let i = 0; i < flags.length; i++) {
    const name = flags[i].slice(2);
    if (!flags[i].startsWith('--') || !commands[command].includes(name) || name in options)
      throw Error(`无效或重复参数：${flags[i]}`);
    if (name === 'offline') options[name] = true;
    else {
      const value = flags[++i];
      if (!value || value.startsWith('--')) throw Error(`缺少 --${name} 的值`);
      options[name] = value;
    }
  }
  for (const name of commands[command])
    if (!options[name])
      throw Error(`缺少 --${name}${name === 'offline' ? '：请先停止游戏服务再执行维护写入' : ''}`);
  if (command === 'migration-preview') return previewEvaMigration(options.database);
  if (command === 'migrate-eva')
    return applyEvaMigration(options.database, options['preview-hash']);
  if (command.startsWith('quota-')) return quotaCommand(command, options);
  if (command === 'verify')
    return { database: path.resolve(options.database), ...verifyDatabase(options.database) };
  if (command === 'backup') return snapshotDatabase(options.database, options.output);
  if (command === 'restore') return snapshotDatabase(options.backup, options.database);
  if (command === 'seed-test')
    return seedTestAccount(
      options.database,
      options.username,
      options.pilot,
      passwordFrom(env, 'DAWN_TEST_PASSWORD'),
    );
  return resetPassword(
    options.database,
    options.username,
    passwordFrom(env, 'DAWN_ADMIN_PASSWORD'),
  );
}

if (require.main === module)
  run(process.argv.slice(2)).then(
    (result) => console.log(JSON.stringify(result, null, 2)),
    (error) => {
      console.error(`维护失败：${error.message}`);
      process.exitCode = 1;
    },
  );

module.exports = {
  verifyDatabase,
  snapshotDatabase,
  seedTestAccount,
  resetPassword,
  previewEvaMigration,
  applyEvaMigration,
  run,
};
