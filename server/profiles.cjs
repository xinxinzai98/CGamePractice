'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite'),
  { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const { RequestError } = require('./errors.cjs');
const {
  DATABASE_VERSION,
  PROFILE_VERSION,
  CONTENT_VERSION,
  migrateDatabase,
} = require('./profile-migrations.cjs');
const rules = () => require('../packages/simulation/dist/index.js');
const blank = () => ({ ...rules().Progression.createProfile(), eva: rules().Eva.createProfile() });
function parseEnvelope(value) {
  const profile = rules().Progression.parseProfile(value);
  profile.eva =
    value.eva === undefined
      ? rules().Eva.migrateProfile(profile)
      : rules().Eva.parseProfile(value.eva);
  return profile;
}
function applyLegacyAward(p, result, participant) {
  const record = rules().Progression.parseBattleRecord({
    round: result.round,
    at: result.at,
    character: participant.character,
    mission: result.mission,
    stage: result.stage,
    won: result.status === 'won',
    xp: result.status === 'won' ? 100 + result.mission * 50 : 0,
    score: result.score,
    time: result.time,
    stats: participant.stats,
  });
  const xpBefore = p.characters[participant.character].xp;
  p.characters[participant.character].xp = Math.min(300000, xpBefore + record.xp);
  record.xp = p.characters[participant.character].xp - xpBefore;
  if (record.won) {
    const stageNumber = result.mission * 3 + result.stage + 1;
    if (stageNumber <= p.unlocked) p.unlocked = Math.max(p.unlocked, Math.min(12, stageNumber + 1));
    p.tickets++;
    p.coins += 60 + (stageNumber - 1) * 15;
  }
  p.records.history.unshift(record);
  p.records.history = p.records.history.slice(0, 50);
  p.records[record.won ? 'wins' : 'losses']++;
  return record;
}
function settleLegacyBeforeMigration(db) {
  for (const row of db.prepare("SELECT * FROM rounds WHERE state='pending'").all()) {
    const result = { ...JSON.parse(row.result_json), at: row.recorded_at };
    for (const participant of result.participants) {
      const key = participant.username.toLowerCase(),
        operationId = `round:${row.round_id}`;
      if (
        db
          .prepare('SELECT 1 FROM operations WHERE user_key=? AND operation_id=?')
          .get(key, operationId)
      )
        continue;
      const saved = db.prepare('SELECT * FROM profiles WHERE user_key=?').get(key);
      if (!saved) throw Error('Pending legacy reward account does not exist');
      const raw = JSON.parse(saved.json),
        profile = rules().Progression.parseProfile(raw);
      if (raw.eva !== undefined) profile.eva = raw.eva;
      const before = {
        coins: profile.coins,
        tickets: profile.tickets,
        inventory: [...profile.inventory],
      };
      const record = applyLegacyAward(profile, result, participant);
      const after = {
        coins: profile.coins,
        tickets: profile.tickets,
        inventory: [...profile.inventory],
      };
      const revision = saved.revision + 1;
      db.prepare('UPDATE profiles SET json=?,revision=? WHERE user_key=?').run(
        JSON.stringify(profile),
        revision,
        key,
      );
      db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?)').run(
        key,
        operationId,
        'battle',
        JSON.stringify({ round: row.round_id }),
        JSON.stringify(record),
        JSON.stringify({
          coins: after.coins - before.coins,
          tickets: after.tickets - before.tickets,
          inventoryAdded: [],
          inventoryRemoved: [],
        }),
        JSON.stringify({ before, after }),
        revision,
        row.recorded_at,
      );
    }
    db.prepare("UPDATE rounds SET state='settled',settled_at=? WHERE round_id=?").run(
      new Date().toISOString(),
      row.round_id,
    );
  }
}

function createProfiles(
  file,
  {
    legacyFile = path.join(path.dirname(file), 'profiles.json'),
    secureCookies = false,
    recoverRounds = true,
  } = {},
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  fs.chmodSync(file, 0o600);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  let migrationBackup;
  try {
    migrationBackup = migrateDatabase(db, file, parseEnvelope, settleLegacyBeforeMigration);
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
            db.prepare(
              'INSERT INTO profiles (user_key,json,profile_version,content_version) VALUES (?,?,?,?)',
            ).run(
              key,
              JSON.stringify(
                parseEnvelope(
                  rules().Progression.migrateLegacyProfile(u.profile, (message) =>
                    console.warn('Legacy profile migration:', message),
                  ),
                ),
              ),
              PROFILE_VERSION,
              CONTENT_VERSION,
            );
        }
        db.prepare('INSERT INTO migrations VALUES (?,?)').run(
          'legacy-json-v1',
          new Date().toISOString(),
        );
      });
    }
  } catch (error) {
    db.close();
    throw error;
  }

  let closed = false;
  const sessions = new Map(),
    pending = new Set();
  const byName = (name) => {
    if (typeof name !== 'string') return null;
    const row = db
      .prepare(
        'SELECT u.*,p.json,p.revision,p.profile_version,p.content_version FROM users u JOIN profiles p ON p.user_key=u.key WHERE u.key=?',
      )
      .get(name.toLowerCase());
    if (!row) return null;
    if (row.profile_version !== PROFILE_VERSION || row.content_version !== CONTENT_VERSION)
      throw Error('Stored profile version requires server migration');
    return {
      username: row.username,
      salt: row.salt,
      hash: row.hash,
      revision: row.revision,
      profile: parseEnvelope(JSON.parse(row.json)),
    };
  };
  const resources = (p) => ({
    coins: p.coins,
    tickets: p.tickets,
    inventory: [...p.inventory],
    eva: p.eva
      ? structuredClone({
          wallet: p.eva.wallet,
          stock: p.eva.stock,
          owned: p.eva.owned,
          machines: p.eva.machines,
          members: p.eva.members,
          licenseExpiresAt: p.eva.licenseExpiresAt,
          pity: p.eva.pity,
        })
      : null,
  });
  function commitMutation(fresh, fn, operationId, kind, request) {
    const key = fresh.username.toLowerCase(),
      requestJson = JSON.stringify(request);
    const previous = db
      .prepare(
        'SELECT kind,request_json,result_json FROM operations WHERE user_key=? AND operation_id=?',
      )
      .get(key, operationId);
    if (previous) {
      if (previous.kind !== kind || previous.request_json !== requestJson)
        throw new RequestError('操作编号已用于另一项请求');
      return { result: JSON.parse(previous.result_json), replayed: true };
    }
    const before = resources(fresh.profile),
      result = fn(fresh.profile);
    if (result && typeof result.then === 'function')
      throw Error('Profile mutations must be synchronous');
    fresh.profile = parseEnvelope(fresh.profile);
    const after = resources(fresh.profile),
      delta = {
        coins: after.coins - before.coins,
        tickets: after.tickets - before.tickets,
        inventoryAdded: after.inventory.filter((id) => !before.inventory.includes(id)),
        inventoryRemoved: before.inventory.filter((id) => !after.inventory.includes(id)),
        eva:
          before.eva && after.eva
            ? {
                wallet: Object.fromEntries(
                  Object.keys(after.eva.wallet).map((id) => [
                    id,
                    after.eva.wallet[id] - before.eva.wallet[id],
                  ]),
                ),
                stock: Object.fromEntries(
                  [
                    ...new Set([...Object.keys(before.eva.stock), ...Object.keys(after.eva.stock)]),
                  ].map((id) => [id, (after.eva.stock[id] || 0) - (before.eva.stock[id] || 0)]),
                ),
              }
            : null,
      };
    fresh.revision++;
    db.prepare('UPDATE profiles SET json=?,revision=? WHERE user_key=?').run(
      JSON.stringify(fresh.profile),
      fresh.revision,
      key,
    );
    db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?)').run(
      key,
      operationId,
      kind,
      requestJson,
      JSON.stringify(result === undefined ? null : result),
      JSON.stringify(delta),
      JSON.stringify({ before, after }),
      fresh.revision,
      new Date().toISOString(),
    );
    return { result, replayed: false };
  }
  function mutate(user, fn, eventKey = null, kind = 'update') {
    let fresh;
    const result = transaction(() => {
      fresh = byName(user.username);
      if (!fresh) throw Error('账户不存在');
      if (
        eventKey &&
        db
          .prepare('SELECT 1 FROM ledger WHERE user_key=? AND event_key=?')
          .get(user.username.toLowerCase(), eventKey)
      )
        return false;
      const operation = commitMutation(
        fresh,
        fn,
        eventKey || `mutation:${crypto.randomUUID()}`,
        kind,
        {},
      );
      if (eventKey)
        db.prepare('INSERT INTO ledger VALUES (?,?,?,?)').run(
          user.username.toLowerCase(),
          eventKey,
          kind,
          new Date().toISOString(),
        );
      return operation.result;
    });
    Object.assign(user, { profile: fresh.profile, revision: fresh.revision });
    return result;
  }
  function operation(user, operationId, kind, request, fn) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(operationId))
      throw new RequestError('缺少有效操作编号');
    let fresh;
    const result = transaction(() => {
      fresh = byName(user.username);
      if (!fresh) throw Error('账户不存在');
      return commitMutation(fresh, fn, operationId, kind, request).result;
    });
    Object.assign(user, { profile: fresh.profile, revision: fresh.revision });
    return result;
  }
  function credentials(username, password) {
    if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,20}$/u.test(username))
      throw new RequestError('用户名须为 3–20 位字母、数字、中文、下划线或短横线');
    if (typeof password !== 'string' || password.length < 8 || password.length > 72)
      throw new RequestError('密码须为 8–72 位');
    return username.toLowerCase();
  }
  const tokenOf = (req) =>
    String(req.headers.cookie || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('dawn_session='))
      ?.slice(13);
  const sessionOf = (req) => {
    const token = tokenOf(req),
      session = sessions.get(token);
    if (!session) return null;
    if (session.expires <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  };
  const get = (req) => {
    const session = sessionOf(req);
    return session ? byName(session.key) : null;
  };
  const cookieOptions = `HttpOnly; SameSite=Strict; Path=/${secureCookies ? '; Secure' : ''}`;
  function loginCookie(user, res) {
    const token = crypto.randomBytes(32).toString('hex');
    if (sessions.size > 10000) {
      const now = Date.now();
      for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key);
      if (sessions.size > 10000) sessions.delete(sessions.keys().next().value);
    }
    sessions.set(token, { key: user.username.toLowerCase(), expires: Date.now() + 7 * 86400000 });
    res.setHeader('Set-Cookie', `dawn_session=${token}; ${cookieOptions}; Max-Age=604800`);
  }
  function revokeSessions(username) {
    const key = username.toLowerCase();
    for (const [token, session] of sessions) if (session.key === key) sessions.delete(token);
  }
  async function verifyPassword(user, password) {
    const hash = await scrypt(password, user?.salt || '00000000000000000000000000000000', 64);
    return Boolean(user && crypto.timingSafeEqual(hash, Buffer.from(user.hash, 'hex')));
  }
  async function writePassword(username, password, expectedHash = null, kind = 'password-reset') {
    const key = credentials(username, password),
      salt = crypto.randomBytes(16).toString('hex'),
      hash = (await scrypt(password, salt, 64)).toString('hex');
    transaction(() => {
      const fresh = byName(key);
      if (!fresh) throw new RequestError('账户不存在');
      if (expectedHash !== null && fresh.hash !== expectedHash)
        throw new RequestError('密码已更新，请重新登录');
      db.prepare('UPDATE users SET salt=?,hash=? WHERE key=?').run(salt, hash, key);
      commitMutation(
        fresh,
        () => ({ username: fresh.username }),
        `credential:${crypto.randomUUID()}`,
        kind,
        {},
      );
    });
    revokeSessions(username);
    return byName(username);
  }
  function battleRecord(result, participant) {
    return rules().Progression.parseBattleRecord({
      round: result.round,
      at: result.at,
      character: participant.character,
      mission: result.mission,
      stage: result.stage,
      won: result.status === 'won',
      xp: result.status === 'won' ? 100 + result.mission * 50 : 0,
      score: result.score,
      time: result.time,
      stats: participant.stats,
    });
  }
  function normalizeRound(result) {
    if (typeof result.round !== 'string' || !result.round.length || result.round.length > 128)
      throw Error('Reward round is invalid');
    if (result.status !== 'won' && result.status !== 'lost')
      throw Error('Reward result is not terminal');
    if (
      !Array.isArray(result.participants) ||
      !result.participants.length ||
      result.participants.length > 2
    )
      throw Error('Reward participants are invalid');
    const usernames = new Set();
    const normalized = {
      round: result.round,
      mission: result.mission,
      stage: result.stage,
      status: result.status,
      score: result.score,
      time: result.time,
    };
    normalized.participants = result.participants.map((participant) => {
      const user = byName(participant.username);
      if (!user) throw Error('Reward account does not exist');
      const key = user.username.toLowerCase();
      if (usernames.has(key)) throw Error('Reward account appears twice in one round');
      usernames.add(key);
      const record = battleRecord({ ...normalized, at: '2000-01-01T00:00:00.000Z' }, participant);
      return { username: user.username, character: record.character, stats: record.stats };
    });
    return normalized;
  }
  function recordRound(result) {
    const normalized = normalizeRound(result),
      encoded = JSON.stringify(normalized);
    return transaction(() => {
      const previous = db
        .prepare('SELECT result_json FROM rounds WHERE round_id=?')
        .get(result.round);
      if (previous) {
        if (previous.result_json !== encoded)
          throw Error('Round result conflicts with its recorded result');
        return false;
      }
      db.prepare("INSERT INTO rounds VALUES (?,?,'pending',?,NULL)").run(
        result.round,
        encoded,
        new Date().toISOString(),
      );
      return true;
    });
  }
  function applyAward(p, result, participant) {
    return applyLegacyAward(p, result, participant);
  }
  function settleRound(round) {
    return transaction(() => {
      const row = db.prepare('SELECT * FROM rounds WHERE round_id=?').get(round);
      if (!row) throw Error('Round result has not been recorded');
      if (row.state === 'settled') return false;
      const result = { ...JSON.parse(row.result_json), at: row.recorded_at };
      for (const participant of result.participants) {
        const fresh = byName(participant.username);
        if (!fresh) throw Error('Reward account does not exist');
        // Account + round, never character + round, is the reward identity.
        commitMutation(
          fresh,
          (p) => applyAward(p, result, participant),
          `round:${round}`,
          'battle',
          { round },
        );
      }
      db.prepare("UPDATE rounds SET state='settled',settled_at=? WHERE round_id=?").run(
        new Date().toISOString(),
        round,
      );
      return true;
    });
  }
  function settlePending() {
    const rows = db
      .prepare("SELECT round_id FROM rounds WHERE state='pending' ORDER BY recorded_at,round_id")
      .all();
    for (const row of rows) settleRound(row.round_id);
    return rows.length;
  }
  try {
    settlePending();
  } catch (error) {
    db.close();
    throw error;
  }

  const evaStore = require('./eva-store.cjs').createEvaStore({
    db,
    transaction,
    byName,
    commitMutation,
    operation,
    rules,
  });
  try {
    if (recoverRounds) evaStore.evaRecover();
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    ...evaStore,
    get,
    byName,
    mutate,
    revokeSessions,
    recordRound,
    settleRound,
    settlePending,
    sessionValid: (req) => sessionOf(req) !== null,
    schemaInfo: () => ({
      databaseVersion: DATABASE_VERSION,
      profileVersion: PROFILE_VERSION,
      contentVersion: CONTENT_VERSION,
      migrationBackup,
    }),
    health: () => ({
      evaActiveRounds: db
        .prepare("SELECT COUNT(*) AS count FROM eva_rounds WHERE state='active'")
        .get().count,
      evaPendingRounds: db
        .prepare("SELECT COUNT(*) AS count FROM eva_rounds WHERE state='pending'")
        .get().count,
      databaseVersion: db.prepare('PRAGMA user_version').get().user_version,
      pendingRounds: db.prepare("SELECT COUNT(*) AS count FROM rounds WHERE state='pending'").get()
        .count,
    }),
    roundStatus: (round) =>
      db.prepare('SELECT state FROM rounds WHERE round_id=?').get(round)?.state || null,
    operations: (username) =>
      db
        .prepare(
          'SELECT operation_id,kind,request_json,result_json,delta_json,balance_json,revision,at FROM operations WHERE user_key=? ORDER BY revision',
        )
        .all(username.toLowerCase()),
    close: () => {
      if (!closed) {
        db.close();
        closed = true;
      }
    },
    async register(username, password, res) {
      const key = credentials(username, password);
      if (byName(key) || pending.has(key)) throw new RequestError('用户名已存在');
      pending.add(key);
      try {
        const salt = crypto.randomBytes(16).toString('hex'),
          hash = (await scrypt(password, salt, 64)).toString('hex');
        const user = { username, salt, hash, revision: 0, profile: blank() };
        transaction(() => {
          db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(key, username, salt, hash);
          db.prepare(
            'INSERT INTO profiles (user_key,json,profile_version,content_version) VALUES (?,?,?,?)',
          ).run(key, JSON.stringify(user.profile), PROFILE_VERSION, CONTENT_VERSION);
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
      if (!(await verifyPassword(user, password))) throw new RequestError('用户名或密码错误');
      // A concurrent reset must not allow the previous password to issue a new token.
      const fresh = byName(key);
      if (fresh.hash !== user.hash) throw new RequestError('密码已更新，请重新登录');
      loginCookie(fresh, res);
      return fresh;
    },
    logout(req, res) {
      sessions.delete(tokenOf(req));
      res.setHeader('Set-Cookie', `dawn_session=; ${cookieOptions}; Max-Age=0`);
    },
    async changePassword(user, currentPassword, newPassword, res) {
      credentials(user.username, currentPassword);
      const fresh = byName(user.username);
      if (!(await verifyPassword(fresh, currentPassword))) throw new RequestError('当前密码错误');
      const updated = await writePassword(
        user.username,
        newPassword,
        fresh.hash,
        'password-change',
      );
      Object.assign(user, updated);
      loginCookie(updated, res);
      return updated;
    },
    async resetPassword(username, newPassword) {
      const user = await writePassword(username, newPassword);
      return { username: user.username };
    },
    purchase(user, itemId, operationId) {
      return operation(user, operationId, 'purchase', { itemId }, (p) => {
        const item = rules().Equipment.ITEMS.find((i) => i.id === itemId);
        if (!item) throw new RequestError('装备不存在');
        if (p.inventory.includes(item.id)) throw new RequestError('已经拥有此装备');
        if (p.coins < item.price) throw new RequestError('金币不足');
        p.coins -= item.price;
        p.inventory.push(item.id);
        return { itemId: item.id, price: item.price };
      });
    },
    completeTutorial(user, operationId) {
      return operation(user, operationId, 'tutorial', {}, (p) => {
        const granted = !p.tutorialComplete;
        if (granted) {
          p.tutorialComplete = true;
          p.tickets += 3;
        }
        return { granted, tickets: granted ? 3 : 0 };
      });
    },
    draw(user, operationId) {
      return operation(user, operationId, 'draw', {}, (p) => {
        if (p.tickets < 1) throw new RequestError('补给券不足，请完成教学或联网通关');
        const pityTriggered = p.pity >= 9,
          rare = pityTriggered || crypto.randomInt(100) < 25,
          rarity = rare ? 'rare' : 'standard';
        const pool = rules().Equipment.ITEMS.filter((i) => (rare ? i.price >= 180 : i.price < 180)),
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
      });
    },
    // Kept for older one-player integrations. Multiplayer uses recordRound + settleRound.
    award(username, character, game, room) {
      const user = byName(username);
      if (!user) throw Error('Reward account does not exist');
      const player = game.players.find((p) => p.character === character);
      if (!player) throw Error('Reward character is absent from the round');
      if (!Number.isInteger(room.stage) || room.stage < 0 || room.stage > 2)
        throw Error('Reward stage is invalid');
      const result = normalizeRound({
        round: room.round,
        mission: room.mission,
        stage: room.stage,
        status: game.status,
        score: game.score,
        time: game.time,
        participants: [{ username, character, stats: player.stats }],
      });
      return mutate(
        user,
        (p) => {
          applyAward(p, { ...result, at: new Date().toISOString() }, result.participants[0]);
          return true;
        },
        `round:${room.round}`,
        'battle',
      );
    },
  };
}
module.exports = { createProfiles, blank, parseEnvelope, applyLegacyAward };
