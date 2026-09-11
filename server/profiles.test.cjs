function readUser(file, name) {
  const store = require('./profiles.cjs').createProfiles(file);
  try {
    return store.byName(name);
  } finally {
    store.close();
  }
}
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { once } = require('node:events');
const { createServer } = require('./server.cjs');
async function setup(t, seedCoins = null, seedProfile = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-profiles-')),
    file = path.join(dir, 'profiles.sqlite');
  if (seedCoins !== null) {
    const store = require('./profiles.cjs').createProfiles(file);
    await store.register('shop_pilot', 'password123', { setHeader() {} });
    store.mutate(store.byName('shop_pilot'), (p) => {
      p.coins = seedCoins;
      Object.assign(p, seedProfile);
    });
    store.close();
  }
  const app = createServer({ allowLegacyClients: true, profilesFile: file });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  return {
    ...app,
    file,
    request: async (route, body, cookie = '', extra = {}) =>
      fetch(url + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...extra },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(
                ['/api/shop', '/api/draw', '/api/tutorial'].includes(route) &&
                  !Object.hasOwn(body, 'operationId')
                  ? { ...body, operationId: require('node:crypto').randomUUID() }
                  : body,
              ),
      }),
  };
}
test('registration hashes password, cookie authenticates, logout revokes, disk survives reload', async (t) => {
  const a = await setup(t);
  const r = await a.request('/api/register', { username: 'pilot_one', password: 'password123' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await r.json()).profile.characters.Asuka.xp, 0);
  assert.equal(
    (await (await a.request('/api/me', undefined, cookie)).json()).user.username,
    'pilot_one',
  );
  const disk = readUser(a.file, 'pilot_one');
  assert.notEqual(disk.hash, 'password123');
  assert.equal(disk.profile.characters.Rei.xp, 0);
  await a.request('/api/logout', {}, cookie);
  assert.equal((await (await a.request('/api/me', undefined, cookie)).json()).user, null);
  assert.equal(
    (await a.request('/api/login', { username: 'pilot_one', password: 'wrongpass' })).status,
    400,
  );
  assert.equal(
    (await a.request('/api/login', { username: 'pilot_one', password: 'password123' })).status,
    200,
  );
});
test('validation, duplicate users, cross-origin and request limits', async (t) => {
  const a = await setup(t);
  assert.equal(
    (await a.request('/api/register', { username: 'ab', password: 'short' })).status,
    400,
  );
  await a.request('/api/register', { username: 'pilot_two', password: 'password123' });
  assert.equal(
    (await a.request('/api/register', { username: 'PILOT_TWO', password: 'password123' })).status,
    400,
  );
  assert.equal(
    (await a.request('/api/login', {}, '', { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal((await a.request('/api/login', { x: 'x'.repeat(9000) })).status, 413);
  assert.equal((await a.request('/api/build', { character: 'Asuka', nodes: [] })).status, 401);
});
test('tutorial is account specific and clients cannot write XP through build', async (t) => {
  const a = await setup(t);
  const r = await a.request('/api/register', { username: 'pilot_three', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  assert.equal((await a.request('/api/tutorial', { complete: true }, cookie)).status, 200);
  const result = await a.request(
    '/api/build',
    { character: 'Asuka', nodes: [], xp: 99999 },
    cookie,
  );
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.profile.characters.Asuka.xp, 0);
  assert.equal(data.profile.tutorialComplete, true);
  assert.equal(
    (await a.request('/api/build', { character: 'Asuka', nodes: ['fake-node'] }, cookie)).status,
    400,
  );
});

test('shop debits once, enforces ownership and slot, persists equipment; never trusts client coins', async (t) => {
  const a = await setup(t, 1000);
  const login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  let r = await a.request('/api/shop', { itemId: 'pulse-coil', coins: 99999 }, cookie);
  assert.equal(r.status, 200);
  let p = (await r.json()).profile;
  assert.equal(p.coins, 910);
  assert.deepEqual(p.inventory, ['pulse-coil']);
  assert.equal((await a.request('/api/shop', { itemId: 'pulse-coil' }, cookie)).status, 400);
  assert.equal(
    (
      await a.request(
        '/api/equip',
        { character: 'Asuka', slot: 'armor', itemId: 'pulse-coil' },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await a.request(
        '/api/equip',
        { character: 'Asuka', slot: 'weapon', itemId: 'resonance-core' },
        cookie,
      )
    ).status,
    400,
  );
  r = await a.request(
    '/api/equip',
    { character: 'Asuka', slot: 'weapon', itemId: 'pulse-coil' },
    cookie,
  );
  assert.equal((await r.json()).profile.equipment.Asuka.weapon, 'pulse-coil');
  const disk = readUser(a.file, 'shop_pilot');
  assert.equal(disk.profile.equipment.Asuka.weapon, 'pulse-coil');
  r = await a.request('/api/equip', { character: 'Asuka', slot: 'weapon', itemId: null }, cookie);
  assert.equal((await r.json()).profile.equipment.Asuka.weapon, null);
});
test('insufficient balance refuses purchase without changing inventory', async (t) => {
  const a = await setup(t, 0),
    login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  assert.equal((await a.request('/api/shop', { itemId: 'pulse-coil' }, cookie)).status, 400);
  const { profile } = await (await a.request('/api/me', undefined, cookie)).json();
  assert.equal(profile.coins, 0);
  assert.deepEqual(profile.inventory, []);
});
test('appearance persists strict pilot and motion settings across reload', async (t) => {
  const a = await setup(t),
    r = await a.request('/api/register', { username: 'appearance_pilot', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  assert.equal(
    (await a.request('/api/appearance', { pilot: 'Other', reducedMotion: false }, cookie)).status,
    400,
  );
  assert.equal(
    (await a.request('/api/appearance', { pilot: 'Rei', reducedMotion: 'true' }, cookie)).status,
    400,
  );
  const saved = await a.request('/api/appearance', { pilot: 'Rei', reducedMotion: true }, cookie);
  assert.deepEqual((await saved.json()).profile.appearance, { pilot: 'Rei', reducedMotion: true });
  const store = { byName: (name) => readUser(a.file, name) };
  assert.deepEqual(store.byName('appearance_pilot').profile.appearance, {
    pilot: 'Rei',
    reducedMotion: true,
  });
});
test('loadouts validate enum values, stay free, and survive profile reload', async (t) => {
  const a = await setup(t),
    r = await a.request('/api/register', { username: 'loadout_pilot', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  for (const body of [
    { character: 'Other', ammo: 'AP', melee: 'blade' },
    { character: 'Asuka', ammo: 'Nuke', melee: 'blade' },
    { character: 'Asuka', ammo: 'HE', melee: 'laser' },
  ])
    assert.equal((await a.request('/api/loadout', body, cookie)).status, 400);
  const saved = await a.request(
    '/api/loadout',
    { character: 'Asuka', ammo: 'HESH', melee: 'spear' },
    cookie,
  );
  const { profile } = await saved.json();
  assert.deepEqual(profile.loadouts.Asuka, { ammo: 'HESH', melee: 'spear' });
  assert.equal(profile.coins, 0);
  const store = { byName: (name) => readUser(a.file, name) };
  assert.deepEqual(store.byName('loadout_pilot').profile.loadouts.Asuka, {
    ammo: 'HESH',
    melee: 'spear',
  });
  assert.deepEqual(store.byName('loadout_pilot').profile.loadouts.Rei, {
    ammo: 'AP',
    melee: 'spear',
  });
});

test('draw rejects no tickets and tutorial grants three tickets only once', async (t) => {
  const a = await setup(t),
    r = await a.request('/api/register', { username: 'draw_pilot', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  assert.equal((await a.request('/api/draw', {}, cookie)).status, 400);
  for (let i = 0; i < 2; i++) {
    const result = await a.request('/api/tutorial', { complete: true }, cookie);
    assert.equal((await result.json()).profile.tickets, 3);
  }
  const draw = await a.request('/api/draw', { itemId: 'resonance-core', rarity: 'rare' }, cookie),
    data = await draw.json();
  assert.equal(data.profile.tickets, 2);
  assert.equal(data.reward.duplicate, false);
  assert.equal(data.reward.coins, 0);
  assert(data.profile.inventory.includes(data.reward.itemId));
  assert.equal(data.profile.drawHistory.length, 1);
  const store = { byName: (name) => readUser(a.file, name) };
  assert.equal(store.byName('draw_pilot').profile.tickets, 2);
  assert.equal(store.byName('draw_pilot').profile.drawHistory.length, 1);
});
test('tenth draw guarantees rare, consumes ticket, converts duplicate and resets pity', async (t) => {
  const all = require('../packages/simulation/dist/index.js').Equipment.ITEMS.map((i) => i.id),
    a = await setup(t, 0, { tickets: 1, pity: 9, inventory: all }),
    r = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  const { profile, reward } = await (await a.request('/api/draw', {}, cookie)).json();
  assert.equal(reward.rarity, 'rare');
  assert.equal(reward.pityTriggered, true);
  assert.equal(reward.duplicate, true);
  assert.equal(reward.coins, 80);
  assert.equal(profile.coins, 80);
  assert.equal(profile.tickets, 0);
  assert.equal(profile.pity, 0);
  assert.deepEqual(profile.inventory, all);
  assert.equal((await a.request('/api/draw', {}, cookie)).status, 400);
});
test('ordinary duplicate converts to forty coins and increments pity with capped history', async (t) => {
  const all = require('../packages/simulation/dist/index.js').Equipment.ITEMS.map((i) => i.id),
    a = await setup(t, 0, {
      tickets: 1,
      pity: 2,
      inventory: all,
      drawHistory: Array.from({ length: 30 }, () => ({
        itemId: 'pulse-coil',
        rarity: 'standard',
        duplicate: false,
        coins: 0,
        pityTriggered: false,
        at: '2026-09-10T00:00:00.000Z',
      })),
    }),
    r = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = r.headers.get('set-cookie');
  t.mock.method(require('node:crypto'), 'randomInt', (max) => (max === 100 ? 99 : 0));
  const { profile, reward } = await (await a.request('/api/draw', {}, cookie)).json();
  assert.equal(reward.rarity, 'standard');
  assert.equal(reward.pityTriggered, false);
  assert.equal(reward.duplicate, true);
  assert.equal(reward.coins, 40);
  assert.equal(profile.coins, 40);
  assert.equal(profile.pity, 3);
  assert.equal(profile.drawHistory.length, 30);
});
test('concurrent purchase requests debit once and reject the duplicate', async (t) => {
  const a = await setup(t, 1000),
    login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  const results = await Promise.all([
    a.request('/api/shop', { itemId: 'pulse-coil' }, cookie),
    a.request('/api/shop', { itemId: 'pulse-coil' }, cookie),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const { profile } = await (await a.request('/api/me', undefined, cookie)).json();
  assert.equal(profile.coins, 910);
  assert.deepEqual(profile.inventory, ['pulse-coil']);
});
test('SQLite write failures return generic 500 and preserve balance; business rejection stays 400', async (t) => {
  const a = await setup(t, 1000),
    login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  assert.equal((await a.request('/api/shop', { itemId: 'missing' }, cookie)).status, 400);
  const db = new (require('node:sqlite').DatabaseSync)(a.file);
  try {
    db.exec(
      "CREATE TRIGGER reject_http_write BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'internal disk failure secret'); END;",
    );
    const r = await a.request('/api/shop', { itemId: 'pulse-coil' }, cookie);
    assert.equal(r.status, 500);
    assert(!JSON.stringify(await r.json()).includes('internal disk failure secret'));
    const { profile } = await (await a.request('/api/me', undefined, cookie)).json();
    assert.equal(profile.coins, 1000);
    assert.deepEqual(profile.inventory, []);
  } finally {
    db.close();
  }
});
test('corrupt stored profile returns 500 instead of silently replacing player progress', async (t) => {
  const a = await setup(t, 1000),
    login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  const db = new (require('node:sqlite').DatabaseSync)(a.file);
  try {
    db.prepare('UPDATE profiles SET json=? WHERE user_key=?').run(
      JSON.stringify({ coins: 'broken' }),
      'shop_pilot',
    );
    const r = await a.request('/api/me', undefined, cookie);
    assert.equal(r.status, 500);
    assert.deepEqual(
      JSON.parse(db.prepare('SELECT json FROM profiles WHERE user_key=?').get('shop_pilot').json),
      { coins: 'broken' },
    );
  } finally {
    db.close();
  }
});

test('HTTP draw retries with one operation ID return the same reward and debit once', async (t) => {
  const a = await setup(t, 0, { tickets: 3 }),
    login = await a.request('/api/login', { username: 'shop_pilot', password: 'password123' }),
    cookie = login.headers.get('set-cookie');
  const responses = await Promise.all([
    a.request('/api/draw', { operationId: 'http-draw-retry' }, cookie),
    a.request('/api/draw', { operationId: 'http-draw-retry' }, cookie),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  const [first, second] = await Promise.all(responses.map((r) => r.json()));
  assert.deepEqual(second.reward, first.reward);
  assert.equal(first.profile.tickets, 2);
  assert.equal(second.profile.tickets, 2);
  assert.equal(second.user.revision, first.user.revision);
  assert.equal(second.profile.drawHistory.length, 1);
  assert.equal((await a.request('/api/draw', { operationId: null }, cookie)).status, 400);
  assert.equal(
    (await a.request('/api/shop', { itemId: 'pulse-coil', operationId: 'http-draw-retry' }, cookie))
      .status,
    400,
  );
  assert.equal(readUser(a.file, 'shop_pilot').profile.tickets, 2);
});
