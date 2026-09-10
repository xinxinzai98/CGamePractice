const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { once } = require('node:events');
const { WebSocket } = require('ws');
const { createServer } = require('./server.cjs');
const D = require('../packages/simulation/dist/index.js');
async function setup(t, options = {}) {
  const dir = require('node:fs').mkdtempSync(
    require('node:path').join(require('node:os').tmpdir(), 'dawn-network-'),
  );
  require('node:fs').writeFileSync(
    require('node:path').join(dir, 'index.html'),
    '<title>Test client</title>',
  );
  const app = createServer({
    webRoot: dir,
    profilesFile: require('node:path').join(dir, 'profiles.sqlite'),
    ...options,
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => {
    await app.close();
    require('node:fs').rmSync(dir, { recursive: true, force: true });
  });
  const port = app.server.address().port;
  return { ...app, port, url: `ws://127.0.0.1:${port}/ws` };
}
async function client(url, options = {}) {
  const ws = new WebSocket(url, options),
    messages = [],
    waiters = [];
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    messages.push(m);
    for (const w of [...waiters])
      if (w.p(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        clearTimeout(w.timer);
        w.resolve(m);
      }
  });
  await once(ws, 'open');
  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (type, p = () => true) =>
      new Promise((resolve, reject) => {
        const w = { p: (m) => m.type === type && p(m), resolve };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(Error('Timeout: ' + type));
        }, 4000);
        waiters.push(w);
      }),
    messages,
  };
}
async function room(t, opts = {}) {
  const app = await setup(t, opts),
    a = await client(app.url),
    b = await client(app.url);
  let joined = a.wait('joined');
  a.send({ type: 'create', mission: 0 });
  const seat = await joined;
  joined = b.wait('joined');
  b.send({ type: 'join', code: seat.code });
  const other = await joined;
  return { app, a, b, seat, other };
}
async function ready(a, b) {
  const ga = a.wait('start'),
    gb = b.wait('start');
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  await Promise.all([ga, gb]);
}
test('HTTP serves game, denies path escape; origin mismatch refuses websocket', async (t) => {
  const app = await setup(t);
  assert.equal((await fetch(`http://127.0.0.1:${app.port}/`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${app.port}/%2e%2e%2fpackage.json`)).status, 404);
  const ws = new WebSocket(app.url, { origin: 'https://example.invalid' });
  ws.on('error', () => {});
  const [res] = await once(ws, 'unexpected-response');
  assert(res);
  ws.terminate();
});
test('two clients own distinct seats; room full and readiness enforced', async (t) => {
  const { app, a, b, seat, other } = await room(t);
  assert.equal(seat.slot, 0);
  assert.equal(other.slot, 1);
  assert.notEqual(seat.token, other.token);
  const c = await client(app.url);
  let err = c.wait('error');
  c.send({ type: 'join', code: seat.code });
  assert.match((await err).message, /满/);
  await ready(a, b);
  const state = await a.wait('state');
  assert.equal(state.state.players.length, 2);
  assert.equal(state.state.enemies.length, 4);
});
test('server applies inputs, ignores client coordinates, synchronizes snapshots and pause', async (t) => {
  const { a, b } = await room(t);
  await ready(a, b);
  const first = (await a.wait('state')).state.players[0];
  a.send({ type: 'input', input: { dir: 0, fire: true, x: 999999, hp: 999999 } });
  const next = await a.wait('state', (m) => m.state.players[0].y < first.y);
  assert.equal(next.state.players[0].hp, 100);
  assert(next.state.players[0].x < 999999);
  const pausedA = a.wait('state', (m) => m.paused),
    pausedB = b.wait('state', (m) => m.paused);
  b.send({ type: 'pause', paused: true });
  const [pa, pb] = await Promise.all([pausedA, pausedB]);
  assert.equal(pa.state.time, pb.state.time);
  const frozen = await a.wait('state');
  assert.equal(pa.state.time, frozen.state.time);
  const resume = a.wait('state', (m) => !m.paused);
  a.send({ type: 'pause', paused: false });
  await resume;
});
test('disconnect pauses room; resume token restores same player and round', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const first = await b.wait('state');
  const waiting = b.wait('state', (m) => m.waiting);
  a.ws.terminate();
  await waiting;
  const c = await client(app.url);
  const joined = c.wait('joined'),
    start = c.wait('start'),
    resumed = b.wait('state', (m) => !m.waiting);
  c.send({ type: 'resume', code: seat.code, token: seat.token });
  assert.equal((await joined).slot, 0);
  assert.equal((await start).round, first.round);
  await resumed;
});
test('invalid resume token rejected; disconnected room expires', async (t) => {
  const { app, a, b, seat } = await room(t, { reconnectMs: 120 });
  const c = await client(app.url);
  let err = c.wait('error');
  c.send({ type: 'resume', code: seat.code, token: 'invalid' });
  assert.match((await err).message, /座位/);
  const ended = b.wait('ended');
  a.ws.terminate();
  assert.match((await ended).message, /超时/);
  assert.equal(app.rooms.size, 0);
});
test('authoritative victory reaches both players; only host advances campaign', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const winA = a.wait('state', (m) => m.state.status === 'won'),
    winB = b.wait('state', (m) => m.state.status === 'won');
  const g = app.rooms.get(seat.code).game;
  g.enemies.forEach((e) => g.damage(e, 1000, 'p0'));
  const [sa, sb] = await Promise.all([winA, winB]);
  assert.equal(sa.state.score, sb.state.score);
  const err = b.wait('error');
  b.send({ type: 'next' });
  assert.match((await err).message, /房主/);
  const startA = a.wait('start'),
    startB = b.wait('start');
  a.send({ type: 'next' });
  assert.equal((await startA).stage, 1);
  assert.equal((await startB).stage, 1);
});
test('network custom map receives same validation as workshop', async (t) => {
  const app = await setup(t),
    a = await client(app.url),
    map = D.blankMap();
  map.tiles[map.spawns[0].y][map.spawns[0].x] = 1;
  const err = a.wait('error');
  a.send({ type: 'create', map });
  assert.match((await err).message, /出生/);
  assert.equal(app.rooms.size, 0);
});

test('host configures mission, swapping characters clears readiness and respects ready partner', async (t) => {
  const { app, a, b, seat } = await room(t);
  let event = a.wait('lobby', (m) => m.mission === 2);
  a.send({ type: 'configure', mission: 2 });
  await event;
  event = a.wait('lobby', (m) => m.slots[0].character === 'Rei');
  a.send({ type: 'choose', character: 'Rei' });
  await event;
  event = a.wait('lobby', (m) => m.slots[1].ready);
  b.send({ type: 'ready', ready: true });
  await event;
  let err = a.wait('error');
  a.send({ type: 'choose', character: 'Asuka' });
  assert.match((await err).message, /取消准备/);
  event = a.wait('lobby', (m) => m.mission === 1 && !m.slots[1].ready);
  a.send({ type: 'configure', mission: 1 });
  await event;
  await ready(a, b);
  assert.deepEqual(
    app.rooms.get(seat.code).game.players.map((p) => p.character),
    ['Rei', 'Asuka'],
  );
});
test('authenticated builds and victory save are authoritative; guest cannot steal reconnect', async (t) => {
  const app = await setup(t);
  const base = `http://127.0.0.1:${app.port}`;
  const api = async (route, body, cookie = '') =>
    fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
  const reg = await api('/api/register', { username: 'network_pilot', password: 'password123' }),
    cookie = reg.headers.get('set-cookie');
  await api('/api/build', { character: 'Asuka', nodes: ['a-guard-1'] }, cookie);
  await api('/api/loadout', { character: 'Asuka', ammo: 'HESH', melee: 'spear' }, cookie);
  const a = await client(app.url, { headers: { Cookie: cookie } }),
    b = await client(app.url);
  let j = a.wait('joined');
  a.send({ type: 'create' });
  const seat = await j;
  j = b.wait('joined');
  b.send({ type: 'join', code: seat.code });
  await j;
  await ready(a, b);
  const game = app.rooms.get(seat.code).game;
  assert.equal(game.players[0].maxHp, 125);
  assert.equal(game.players[0].loadout.ammo, 'HESH');
  assert.equal(game.players[0].loadout.melee, 'spear');
  const win = b.wait('state', (m) => m.state.status === 'won');
  game.enemies.forEach((e) => game.damage(e, 1000, 'p0'));
  await win;
  let data = await (await api('/api/me', undefined, cookie)).json();
  assert.equal(data.profile.characters.Asuka.xp, 100);
  assert.equal(data.profile.coins, 60);
  assert.equal(data.profile.tickets, 1);
  assert.equal(data.profile.records.history[0].stage, 0);
  assert.equal(data.profile.records.wins, 1);
  assert.equal(data.profile.unlocked, 2);
  await b.wait('state');
  data = await (await api('/api/me', undefined, cookie)).json();
  assert.equal(data.profile.records.wins, 1);
  const closed = once(a.ws, 'close');
  a.ws.terminate();
  await closed;
  const c = await client(app.url);
  const err = c.wait('error');
  c.send({ type: 'resume', code: seat.code, token: seat.token });
  assert.match((await err).message, /座位/);
});
test('campaign advances across three stages and ends after twelfth stage', async (t) => {
  const { app, a, b, seat } = await room(t);
  let changed = a.wait('lobby', (m) => m.stage === 2 && m.difficulty === 'hard');
  a.send({ type: 'configure', mission: 0, stage: 2, difficulty: 'hard' });
  await changed;
  await ready(a, b);
  const r = app.rooms.get(seat.code);
  await a.wait('state', (m) => m.state.cooperation?.openFor > 0);
  let won = a.wait('state', (m) => m.state.status === 'won');
  r.game.enemies.forEach((e) => r.game.damage(e, 1000, 'p0'));
  await won;
  let started = a.wait('start');
  a.send({ type: 'next' });
  const next = await started;
  assert.equal(next.mission, 1);
  assert.equal(next.stage, 0);
  assert.equal(next.difficulty, 'hard');
  r.mission = 3;
  r.stage = 2;
  r.game.status = 'won';
  r.awarded = true;
  let err = a.wait('error');
  a.send({ type: 'next' });
  assert.match((await err).message, /没有下一关/);
});

test('input accepts boolean active item and only supported live ammo values', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const r = app.rooms.get(seat.code);
  let pong = a.wait('pong');
  a.send({ type: 'input', input: { item: true, ammo: 'HE' } });
  a.send({ type: 'ping' });
  await pong;
  assert.equal(r.slots[0].input.item, true);
  assert.equal(r.slots[0].input.ammo, 'HE');
  pong = a.wait('pong');
  a.send({ type: 'input', input: { item: 'true', ammo: 'Nuke' } });
  a.send({ type: 'ping' });
  await pong;
  assert.equal(r.slots[0].input.item, false);
  assert.equal(Object.hasOwn(r.slots[0].input, 'ammo'), false);
});

test('Boss cooperation mechanism is included in authoritative snapshots', async (t) => {
  const { app, a, b, seat } = await room(t);
  let lobby = a.wait('lobby', (m) => m.stage === 2);
  a.send({ type: 'configure', mission: 0, stage: 2 });
  await lobby;
  await ready(a, b);
  const snap = await a.wait('state');
  assert(snap.state.cooperation);
  assert.deepEqual(snap.state.cooperation, app.rooms.get(seat.code).game.cooperation);
  assert(snap.state.enemies.some((e) => e.boss));
});

test('public rooms exposes only joinable waiting rooms with no private fields', async (t) => {
  const app = await setup(t),
    a = await client(app.url);
  let j = a.wait('joined');
  a.send({ type: 'create' });
  const seat = await j;
  const list = async () => {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/rooms`);
    assert.equal(response.status, 200);
    return (await response.json()).rooms;
  };
  let rooms = await list();
  assert.deepEqual(rooms, [
    { code: seat.code, mission: 0, stage: 0, difficulty: 'normal', playersCount: 1 },
  ]);
  const b = await client(app.url);
  j = b.wait('joined');
  b.send({ type: 'join', code: seat.code });
  await j;
  assert.deepEqual(await list(), []);
  const close = once(b.ws, 'close');
  b.ws.terminate();
  await close;
  assert.deepEqual(await list(), []);
  assert.equal(app.rooms.get(seat.code).slots[1].ws, null);
});
test('webRoot serves built client and supported asset MIME types', async (t) => {
  const fs = require('node:fs'),
    path = require('node:path'),
    dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dawn-client-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<title>Built client</title>');
  fs.writeFileSync(path.join(dir, 'icon.svg'), '<svg/>');
  const app = await setup(t, { webRoot: dir });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const base = `http://127.0.0.1:${app.port}`;
  assert.match(await (await fetch(base + '/')).text(), /Built client/);
  assert.match((await fetch(base + '/icon.svg')).headers.get('content-type'), /image\/svg\+xml/);
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 404);
});

test('host returns finished round to briefing and both players ready a fresh round', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const r = app.rooms.get(seat.code),
    oldRound = r.round;
  let err = a.wait('error');
  a.send({ type: 'prepare' });
  assert.match((await err).message, /尚未结束/);
  const won = a.wait('state', (m) => m.state.status === 'won');
  r.game.enemies.forEach((e) => r.game.damage(e, 1000, 'p0'));
  await won;
  err = b.wait('error');
  b.send({ type: 'prepare' });
  assert.match((await err).message, /房主/);
  const ba = a.wait('briefing'),
    bb = b.wait('briefing'),
    lobby = a.wait('lobby', (m) => m.slots.every((s) => s && !s.ready));
  a.send({ type: 'prepare' });
  await Promise.all([ba, bb, lobby]);
  assert.equal(r.game, null);
  assert.equal(r.round, null);
  assert.equal(r.paused, false);
  assert.equal(r.mission, 0);
  assert.equal(r.stage, 0);
  assert.equal(r.difficulty, 'normal');
  assert(r.slots.every((s) => Object.keys(s.input).length === 0));
  await ready(a, b);
  assert.notEqual(r.round, oldRound);
  assert.equal(r.game.status, 'playing');
  assert.equal(r.game.players.length, 2);
});
test('failed reward retries after one second, preserves successful slot and saves exactly once', async (t) => {
  const calls = { retry_one: 0, retry_two: 0 };
  const app = await setup(t, {
    profilesFactory: (file) => {
      const store = require('./profiles.cjs').createProfiles(file),
        award = store.award.bind(store);
      store.award = (name, ...args) => {
        calls[name]++;
        if (name === 'retry_two' && calls[name] === 1)
          throw Error('injected one-time SQLite failure');
        return award(name, ...args);
      };
      return store;
    },
  });
  const base = `http://127.0.0.1:${app.port}`;
  async function account(name) {
    const response = await fetch(base + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: 'password123' }),
    });
    return response.headers.get('set-cookie');
  }
  const ca = await account('retry_one'),
    cb = await account('retry_two'),
    a = await client(app.url, { headers: { Cookie: ca } }),
    b = await client(app.url, { headers: { Cookie: cb } });
  let j = a.wait('joined');
  a.send({ type: 'create' });
  const seat = await j;
  j = b.wait('joined');
  b.send({ type: 'join', code: seat.code });
  await j;
  await ready(a, b);
  const r = app.rooms.get(seat.code),
    won = a.wait('state', (m) => m.state.status === 'won' && !m.rewardsSaved);
  r.game.enemies.forEach((e) => r.game.damage(e, 1000, 'p0'));
  await won;
  assert.equal(r.awarded, false);
  assert.deepEqual(r.rewardSlots, [true, false]);
  const err = a.wait('error');
  a.send({ type: 'prepare' });
  assert.match((await err).message, /保存/);
  const saved = await a.wait('state', (m) => m.rewardsSaved);
  assert.equal(saved.state.status, 'won');
  assert.equal(r.awarded, true);
  assert.deepEqual(calls, { retry_one: 1, retry_two: 2 });
  for (const cookie of [ca, cb]) {
    const { profile } = await (
      await fetch(base + '/api/me', { headers: { Cookie: cookie } })
    ).json();
    assert.equal(profile.coins, 60);
    assert.equal(profile.tickets, 1);
    assert.equal(profile.records.wins, 1);
  }
  await a.wait('state');
  assert.deepEqual(calls, { retry_one: 1, retry_two: 2 });
});
test('guest legacy upgrades cannot increase health or shot damage', async (t) => {
  const { app, a, b, seat } = await room(t);
  const start = a.wait('start');
  a.send({ type: 'ready', ready: true, upgrades: { power: 3, mobility: 3, support: 3 } });
  b.send({ type: 'ready', ready: true });
  await start;
  const g = app.rooms.get(seat.code).game;
  assert.equal(g.players[0].maxHp, 100);
  g.shoot(g.players[0]);
  assert.equal(g.bullets.at(-1).damage, 20);
});
test('missing default client build returns 503 without falling back to web but APIs remain available', async (t) => {
  const fs = require('node:fs'),
    original = fs.existsSync;
  t.mock.method(fs, 'existsSync', (p) =>
    String(p).endsWith('/client/dist/index.html') ? false : original(p),
  );
  const app = await setup(t, { webRoot: undefined });
  const base = `http://127.0.0.1:${app.port}`;
  const page = await fetch(base + '/');
  assert.equal(page.status, 503);
  assert.match(await page.text(), /客户端尚未构建/);
  assert.equal((await fetch(base + '/api/me')).status, 200);
});
test('missing reward account does not mark round saved', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const r = app.rooms.get(seat.code);
  r.slots[0].username = 'missing_account';
  const error = a.wait('error'),
    state = a.wait('state', (m) => m.state.status === 'won');
  r.game.enemies.forEach((e) => r.game.damage(e, 1000, 'p0'));
  await error;
  assert.equal((await state).rewardsSaved, false);
  assert.equal(r.rewardSlots[0], false);
  assert.equal(r.awarded, false);
});
