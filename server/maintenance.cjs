'use strict';
const fs = require('node:fs');
const path = require('node:path');
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
  const store = require('./profiles.cjs').createProfiles(database);
  try {
    const user = await store.register(username, password, { setHeader() {} });
    store.mutate(user, (p) => {
      p.coins = 2000;
      p.tickets = 10;
      p.unlocked = 12;
      p.characters.Asuka.xp = 2400;
      p.characters.Rei.xp = 2400;
      p.appearance.pilot = pilot;
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
  const store = require('./profiles.cjs').createProfiles(file);
  try {
    return { database: path.resolve(file), ...(await store.resetPassword(username, password)) };
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
};

async function run(args, env = process.env) {
  const [command, ...flags] = args;
  if (!commands[command])
    throw Error(
      '命令：verify、backup、restore、seed-test、reset-password；用法见 docs/multiplayer.md',
    );
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
      throw Error(`缺少 --${name}${name === 'offline' ? '：请先停止游戏服务再执行改密' : ''}`);
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

module.exports = { verifyDatabase, snapshotDatabase, seedTestAccount, resetPassword, run };
