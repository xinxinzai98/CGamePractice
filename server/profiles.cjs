'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite'),
  { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const rules = () => require('../packages/simulation/dist/index.js');
const blank = () => rules().Progression.normalizeProfile({});
function createProfiles(
  file,
  { legacyFile = path.join(path.dirname(file), 'profiles.json') } = {},
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users (key TEXT PRIMARY KEY, username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS profiles (user_key TEXT PRIMARY KEY REFERENCES users(key), json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ledger (user_key TEXT NOT NULL REFERENCES users(key), event_key TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(user_key,event_key));
 CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, at TEXT NOT NULL);`);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('legacy-json-v1')) {
    const legacy = fs.existsSync(legacyFile)
      ? JSON.parse(fs.readFileSync(legacyFile, 'utf8'))
      : null;
    if (legacy && (!legacy.users || typeof legacy.users !== 'object'))
      throw Error('Invalid legacy profiles file');
    transaction(() => {
      for (const u of Object.values(legacy?.users || {})) {
        if (
          typeof u.username !== 'string' ||
          typeof u.salt !== 'string' ||
          typeof u.hash !== 'string'
        )
          throw Error('Invalid legacy user');
        const key = u.username.toLowerCase();
        const inserted = db
          .prepare('INSERT OR IGNORE INTO users VALUES (?,?,?,?)')
          .run(key, u.username, u.salt, u.hash);
        if (inserted.changes)
          db.prepare('INSERT INTO profiles VALUES (?,?)').run(
            key,
            JSON.stringify(rules().Progression.normalizeProfile(u.profile)),
          );
      }
      db.prepare('INSERT INTO migrations VALUES (?,?)').run(
        'legacy-json-v1',
        new Date().toISOString(),
      );
    });
  }
  let closed = false;
  const sessions = new Map(),
    pending = new Set();
  const byName = (name) => {
    if (typeof name !== 'string') return null;
    const row = db
      .prepare('SELECT u.*,p.json FROM users u JOIN profiles p ON p.user_key=u.key WHERE u.key=?')
      .get(name.toLowerCase());
    return row
      ? { username: row.username, salt: row.salt, hash: row.hash, profile: JSON.parse(row.json) }
      : null;
  };
  function mutate(user, fn, eventKey = null, kind = 'update') {
    let committed;
    const result = transaction(() => {
      const fresh = byName(user.username);
      if (!fresh) throw Error('账户不存在');
      if (eventKey) {
        const inserted = db
          .prepare('INSERT OR IGNORE INTO ledger VALUES (?,?,?,?)')
          .run(user.username.toLowerCase(), eventKey, kind, new Date().toISOString());
        if (!inserted.changes) {
          committed = fresh.profile;
          return false;
        }
      }
      const result = fn(fresh.profile);
      if (result && typeof result.then === 'function')
        throw Error('Profile mutations must be synchronous');
      db.prepare('UPDATE profiles SET json=? WHERE user_key=?').run(
        JSON.stringify(fresh.profile),
        user.username.toLowerCase(),
      );
      committed = fresh.profile;
      return result;
    });
    user.profile = committed;
    return result;
  }
  function credentials(username, password) {
    if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,20}$/u.test(username))
      throw Error('用户名须为 3–20 位字母、数字、中文、下划线或短横线');
    if (typeof password !== 'string' || password.length < 8 || password.length > 72)
      throw Error('密码须为 8–72 位');
    return username.toLowerCase();
  }
  const tokenOf = (req) =>
    String(req.headers.cookie || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('dawn_session='))
      ?.slice(13);
  const get = (req) => {
    const token = tokenOf(req),
      session = sessions.get(token);
    if (!session) return null;
    if (session.expires < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return byName(session.key);
  };
  function loginCookie(user, res) {
    const token = crypto.randomBytes(32).toString('hex');
    if (sessions.size > 10000) {
      const now = Date.now();
      for (const [key, s] of sessions) if (s.expires < now) sessions.delete(key);
      if (sessions.size > 10000) sessions.delete(sessions.keys().next().value);
    }
    sessions.set(token, { key: user.username.toLowerCase(), expires: Date.now() + 7 * 86400000 });
    res.setHeader(
      'Set-Cookie',
      `dawn_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
    );
  }
  return {
    get,
    byName,
    mutate,
    close: () => {
      if (!closed) {
        db.close();
        closed = true;
      }
    },
    async register(username, password, res) {
      const key = credentials(username, password);
      if (byName(key) || pending.has(key)) throw Error('用户名已存在');
      pending.add(key);
      try {
        const salt = crypto.randomBytes(16).toString('hex'),
          hash = (await scrypt(password, salt, 64)).toString('hex');
        const user = { username, salt, hash, profile: blank() };
        transaction(() => {
          db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(key, username, salt, hash);
          db.prepare('INSERT INTO profiles VALUES (?,?)').run(key, JSON.stringify(user.profile));
        });
        loginCookie(user, res);
        return user;
      } finally {
        pending.delete(key);
      }
    },
    async login(username, password, res) {
      const key = credentials(username, password),
        user = byName(key);
      const hash = await scrypt(password, user?.salt || '00000000000000000000000000000000', 64);
      if (!user || !crypto.timingSafeEqual(hash, Buffer.from(user.hash, 'hex')))
        throw Error('用户名或密码错误');
      loginCookie(user, res);
      return user;
    },
    logout(req, res) {
      sessions.delete(tokenOf(req));
      res.setHeader('Set-Cookie', 'dawn_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    },
    draw(user) {
      return mutate(
        user,
        (p) => {
          if (p.tickets < 1) throw Error('补给券不足，请完成教学或联网通关');
          const pityTriggered = p.pity >= 9,
            rare = pityTriggered || crypto.randomInt(100) < 25,
            rarity = rare ? 'rare' : 'standard';
          const pool = rules().Equipment.ITEMS.filter((i) =>
              rare ? i.price >= 180 : i.price < 180,
            ),
            item = pool[crypto.randomInt(pool.length)],
            duplicate = p.inventory.includes(item.id),
            coins = duplicate ? (rare ? 80 : 40) : 0;
          p.tickets--;
          p.pity = rare ? 0 : p.pity + 1;
          if (!duplicate) p.inventory.push(item.id);
          p.coins += coins;
          const reward = { itemId: item.id, rarity, duplicate, coins, pityTriggered };
          p.drawHistory.unshift({ ...reward, at: new Date().toISOString() });
          p.drawHistory = p.drawHistory.slice(0, 30);
          return reward;
        },
        crypto.randomUUID(),
        'draw',
      );
    },
    award(username, character, game, room) {
      const user = byName(username);
      if (!user) return;
      return mutate(
        user,
        (p) => {
          const won = game.status === 'won',
            player = game.players.find((p) => p.character === character),
            xp = won ? 100 + room.mission * 50 : 0;
          p.characters[character].xp = Math.min(300000, p.characters[character].xp + xp);
          if (won) {
            p.unlocked = Math.max(
              p.unlocked,
              Math.min(12, room.mission * 3 + (room.stage || 0) + 2),
            );
            p.tickets++;
            p.coins += 60 + (room.mission * 3 + (room.stage || 0)) * 15;
          }
          p.records.history.unshift({
            round: room.round,
            at: new Date().toISOString(),
            character,
            mission: room.mission,
            stage: room.stage || 0,
            won,
            xp,
            score: game.score,
            time: game.time,
            stats: player?.stats || {},
          });
          p.records.history = p.records.history.slice(0, 50);
          p.records[won ? 'wins' : 'losses']++;
          return true;
        },
        `round:${room.round}:${character}`,
        'battle',
      );
    },
  };
}
module.exports = { createProfiles, blank };
