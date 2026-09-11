'use strict';
const fs = require('node:fs');

const DATABASE_VERSION = 2;
const PROFILE_VERSION = 2;
const CONTENT_VERSION = 2;

// Version 0 is the existing, unversioned SQLite profile. Its content IDs and
// skill points are unchanged in version 1, so this migration must preserve it.
const profileSteps = new Map([
  [0, (profile) => profile],
  [1, (profile) => profile],
]);
const contentSteps = new Map([
  [0, (profile) => profile],
  [1, (profile) => profile],
]);

function upgradeProfile(value, profileVersion, contentVersion, parseProfile) {
  if (
    !Number.isInteger(profileVersion) ||
    profileVersion < 0 ||
    profileVersion > PROFILE_VERSION ||
    !Number.isInteger(contentVersion) ||
    contentVersion < 0 ||
    contentVersion > CONTENT_VERSION
  )
    throw Error('Unsupported saved profile or content version');
  let upgraded = structuredClone(value);
  for (let v = profileVersion; v < PROFILE_VERSION; v++) upgraded = profileSteps.get(v)(upgraded);
  for (let v = contentVersion; v < CONTENT_VERSION; v++) upgraded = contentSteps.get(v)(upgraded);
  return parseProfile(upgraded);
}

function migrateDatabase(db, file, parseProfile, beforeProfiles = () => {}) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > DATABASE_VERSION) throw Error('Database was created by a newer game server');
  const hasProfiles = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='profiles'").get(),
  );
  const needsProfiles =
    version === DATABASE_VERSION &&
    db
      .prepare('SELECT 1 FROM profiles WHERE profile_version<>? OR content_version<>? LIMIT 1')
      .get(PROFILE_VERSION, CONTENT_VERSION);
  if (version === DATABASE_VERSION && !needsProfiles) return null;

  let backupFile = null;
  if (hasProfiles) {
    backupFile = `${file}.before-v${DATABASE_VERSION}-${Date.now()}.sqlite`;
    db.prepare('VACUUM INTO ?').run(backupFile);
    fs.chmodSync(backupFile, 0o600);
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    if (version === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (key TEXT PRIMARY KEY, username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS profiles (user_key TEXT PRIMARY KEY REFERENCES users(key), json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ledger (user_key TEXT NOT NULL REFERENCES users(key), event_key TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(user_key,event_key));
        CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, at TEXT NOT NULL);
        ALTER TABLE profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE profiles ADD COLUMN content_version INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE operations (
          user_key TEXT NOT NULL REFERENCES users(key), operation_id TEXT NOT NULL,
          kind TEXT NOT NULL, request_json TEXT NOT NULL, result_json TEXT NOT NULL,
          delta_json TEXT NOT NULL, balance_json TEXT NOT NULL,
          revision INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY(user_key,operation_id)
        );
        CREATE TABLE rounds (
          round_id TEXT PRIMARY KEY, result_json TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','settled')),
          recorded_at TEXT NOT NULL, settled_at TEXT
        );
        PRAGMA user_version=1;
      `);
    }
    if (version < 2) {
      db.exec(`
        CREATE TABLE eva_rounds (
          round_id TEXT PRIMARY KEY, context_json TEXT NOT NULL, checkpoint_json TEXT NOT NULL,
          terminal_json TEXT, result_json TEXT, state TEXT NOT NULL CHECK(state IN ('active','pending','settled','aborted')),
          started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE eva_reservations (
          round_id TEXT NOT NULL REFERENCES eva_rounds(round_id), user_key TEXT NOT NULL REFERENCES users(key),
          entity_id TEXT NOT NULL, reserved_json TEXT NOT NULL, used_json TEXT NOT NULL DEFAULT '{}',
          returned_json TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL CHECK(state IN ('reserved','settled')),
          PRIMARY KEY(round_id,user_key), UNIQUE(round_id,entity_id)
        );
        CREATE INDEX eva_reservations_user ON eva_reservations(user_key,state);
        CREATE TABLE quota_orders (
          order_id TEXT PRIMARY KEY, tier TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
          receipt_reference TEXT NOT NULL UNIQUE, operator TEXT NOT NULL, paid_at INTEGER NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('confirmed','issued','redeemed','revoked')), redeemed_by TEXT REFERENCES users(key)
        );
        CREATE TABLE quota_vouchers (
          token_hash TEXT PRIMARY KEY, suffix TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES quota_orders(order_id),
          state TEXT NOT NULL CHECK(state IN ('active','redeemed','revoked')), issued_at INTEGER NOT NULL,
          operator TEXT NOT NULL, redeemed_by TEXT REFERENCES users(key), redeemed_at INTEGER
        );
        CREATE UNIQUE INDEX quota_one_active_per_order ON quota_vouchers(order_id) WHERE state='active';
        CREATE UNIQUE INDEX quota_one_redeemed_per_order ON quota_vouchers(order_id) WHERE state='redeemed';
        CREATE TABLE quota_audit (
          id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES quota_orders(order_id),
          action TEXT NOT NULL, operator TEXT NOT NULL, detail_json TEXT NOT NULL, at INTEGER NOT NULL
        );
        PRAGMA user_version=2;
      `);
    }
    // Complete already recorded old rewards before deriving the canonical EVA wallet.
    beforeProfiles(db);
    for (const row of db
      .prepare('SELECT * FROM profiles WHERE profile_version<>? OR content_version<>?')
      .all(PROFILE_VERSION, CONTENT_VERSION)) {
      const upgraded = upgradeProfile(
        JSON.parse(row.json),
        row.profile_version,
        row.content_version,
        parseProfile,
      );
      db.prepare(
        'UPDATE profiles SET json=?,profile_version=?,content_version=? WHERE user_key=?',
      ).run(JSON.stringify(upgraded), PROFILE_VERSION, CONTENT_VERSION, row.user_key);
    }
    db.prepare('INSERT OR IGNORE INTO migrations VALUES (?,?)').run(
      'eva-v3.1-profile-v2',
      new Date().toISOString(),
    );
    db.exec('COMMIT');
    return backupFile;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = {
  DATABASE_VERSION,
  PROFILE_VERSION,
  CONTENT_VERSION,
  upgradeProfile,
  migrateDatabase,
};
