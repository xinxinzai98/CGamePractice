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
    allowLegacyClients: true,
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
  return {
    ...app,
    profilesFile: require('node:path').join(dir, 'profiles.sqlite'),
    port,
    url: `ws://127.0.0.1:${port}/ws`,
  };
}
let nextAccount = 0;
async function client(url, options = {}) {
  if (!options.headers?.Cookie) {
    const response = await fetch(url.replace('ws:', 'http:').replace('/ws', '/api/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `network_${++nextAccount}`, password: 'password123' }),
    });
    assert.equal(response.status, 200);
    options = {
      ...options,
      headers: { ...options.headers, Cookie: response.headers.get('set-cookie') },
    };
  }
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
    cookie: options.headers.Cookie,
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (type, p = () => true, timeoutMs = 4000) =>
      new Promise((resolve, reject) => {
        const w = { p: (m) => m.type === type && p(m), resolve };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(Error('Timeout: ' + type));
        }, timeoutMs);
        waiters.push(w);
      }),
    messages,
  };
}
async function room(t, opts = {}) {
  const app = await setup(t, opts),
    a = await client(app.url),
    b = await client(app.url);
  if (opts.unlocked !== 1) {
    const store = require('./profiles.cjs').createProfiles(app.profilesFile);
    for (const cookie of [a.cookie, b.cookie]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/api/me`, {
        headers: { Cookie: cookie },
      });
      const { user } = await response.json();
      store.mutate(store.byName(user.username), (p) => {
        p.unlocked = 12;
      });
    }
    store.close();
  }
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
  const initial = a.wait('state');
  const [, snapshot] = await Promise.all([ready(a, b), initial]);
  const first = snapshot.state.players[0];
  const moved = a.wait(
    'state',
    (m) =>
      m.round === snapshot.round &&
      m.state.time > snapshot.state.time &&
      m.state.players[0].y < first.y,
  );
  const hold = () =>
    a.send({
      type: 'input',
      round: snapshot.round,
      input: { dir: 0, fire: true, x: 999999, hp: 999999 },
      commands: [],
    });
  // Held movement is refreshed by the real client every 40 ms. One old packet
  // may correctly expire under a stalled event loop before the next game tick.
  const heldInput = setInterval(hold, 40);
  hold();
  let next;
  try {
    next = await moved;
  } finally {
    clearInterval(heldInput);
  }
  assert.equal(next.state.players[0].maxHp, 100);
  assert(next.state.players[0].hp <= 100);
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
  const c = await client(app.url, { headers: { Cookie: a.cookie } });
  const joined = c.wait('joined'),
    start = c.wait('start'),
    resumed = b.wait('state', (m) => !m.waiting);
  c.send({ type: 'resume', code: seat.code, token: seat.token });
  assert.equal((await joined).slot, 0);
  assert.equal((await start).round, first.round);
  await resumed;
});
test('manual pause survives disconnect and resume until a player explicitly continues', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const pausedState = b.wait('state', (m) => m.paused);
  a.send({ type: 'pause', paused: true });
  const paused = await pausedState;
  const waiting = b.wait('state', (m) => m.waiting);
  a.ws.terminate();
  assert.equal((await waiting).paused, true);
  assert.equal(app.rooms.get(seat.code).paused, true);
  const resumed = await client(app.url, { headers: { Cookie: a.cookie } });
  const restored = b.wait('state', (m) => !m.waiting);
  resumed.send({ type: 'resume', code: seat.code, token: seat.token });
  const reconnected = await restored;
  assert.equal(reconnected.paused, true);
  assert.equal(reconnected.state.time, paused.state.time);
  const stillPaused = await b.wait('state');
  assert.equal(stillPaused.paused, true);
  assert.equal(stillPaused.state.time, paused.state.time);
  const continued = b.wait('state', (m) => !m.paused && m.state.time > paused.state.time);
  resumed.send({ type: 'pause', paused: false });
  await continued;
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
  const locked = await a.wait('state');
  assert.equal(locked.state.cooperation.openFor, 0, 'Boss must not unlock at spawn');
  let won = a.wait('state', (m) => m.state.status === 'won');
  r.game.status = 'won';
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

test('burst commands survive latest held state and retransmission executes once', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const r = app.rooms.get(seat.code),
    observed = [];
  const original = r.game.step.bind(r.game);
  r.game.step = (dt, inputs) => {
    observed.push({ ...inputs[0] });
    original(dt, inputs);
  };
  const command = { seq: 1, key: 'item' };
  const ack = a.wait('input-ack', (m) => m.seq === 2);
  a.send({ type: 'input', round: r.round, input: { dir: 0, fire: true }, commands: [command] });
  a.send({
    type: 'input',
    round: r.round,
    input: { dir: -1, fire: false },
    commands: [command, { seq: 2, key: 'ammo', value: 'HE' }],
  });
  a.send({
    type: 'input',
    round: r.round,
    input: { dir: -1, fire: false },
    commands: [command, { seq: 2, key: 'ammo', value: 'HE' }],
  });
  await ack;
  assert.equal(observed.filter((i) => i.item).length, 1);
  assert.equal(observed.filter((i) => i.ammo === 'HE').length, 1);
  assert.equal(r.game.players[0].loadout.ammo, 'HE');
  const error = a.wait('error');
  a.send({
    type: 'input',
    round: r.round,
    input: { dir: -1, fire: false },
    commands: [{ seq: 3, key: 'ammo', value: 'Nuke' }],
  });
  assert.match((await error).message, /命令无效/);
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
test('failed whole-round settlement retries and saves both accounts exactly once', async (t) => {
  let blocked = true,
    committed = 0;
  const app = await setup(t, {
    profilesFactory: (file) => {
      const store = require('./profiles.cjs').createProfiles(file),
        settle = store.settleRound.bind(store),
        pending = store.settlePending.bind(store);
      store.settleRound = (...args) => {
        if (blocked) throw Error('injected settlement barrier');
        const saved = settle(...args);
        if (saved) committed++;
        return saved;
      };
      store.settlePending = () => {
        if (blocked) throw Error('injected settlement barrier');
        const saved = pending();
        committed += saved;
        return saved;
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
  assert.equal(r.rewardRecorded, true);
  for (const cookie of [ca, cb]) {
    const { profile } = await (
      await fetch(base + '/api/me', { headers: { Cookie: cookie } })
    ).json();
    assert.equal(profile.coins, 0);
  }
  const err = a.wait('error');
  a.send({ type: 'prepare' });
  assert.match((await err).message, /保存/);
  const savedState = a.wait('state', (m) => m.rewardsSaved);
  blocked = false;
  const saved = await savedState;
  assert.equal(saved.state.status, 'won');
  assert.equal(r.awarded, true);
  assert.equal(committed, 1);
  for (const cookie of [ca, cb]) {
    const { profile } = await (
      await fetch(base + '/api/me', { headers: { Cookie: cookie } })
    ).json();
    assert.equal(profile.coins, 60);
    assert.equal(profile.tickets, 1);
    assert.equal(profile.records.wins, 1);
  }
  await a.wait('state');
  assert.equal(committed, 1);
});
test('client legacy upgrades cannot increase health or shot damage', async (t) => {
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
async function api(app, route, cookie, body) {
  return fetch(`http://127.0.0.1:${app.port}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test('anonymous websocket and room recovery lookup require authentication', async (t) => {
  const app = await setup(t);
  assert.equal((await api(app, '/api/room')).status, 401);
  const ws = new WebSocket(app.url);
  ws.on('error', () => {});
  const response = new Promise((resolve) =>
    ws.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode);
      ws.terminate();
    }),
  );
  assert.equal(await response, 401);
  assert.equal(app.rooms.size, 0);
});
test('same account cannot occupy a second seat; lookup and takeover restore only its own room', async (t) => {
  const { app, a, b, seat } = await room(t);
  const second = await client(app.url, { headers: { Cookie: a.cookie } });
  for (const type of ['create', 'join']) {
    const rejected = second.wait('error');
    second.send({ type, code: seat.code });
    assert.match((await rejected).message, /账号已经/);
  }
  const personal = await (await api(app, '/api/room', a.cookie)).json();
  assert.deepEqual(personal, { room: { code: seat.code, token: seat.token } });
  const stranger = await client(app.url);
  assert.deepEqual(await (await api(app, '/api/room', stranger.cookie)).json(), { room: null });
  const stolen = stranger.wait('error');
  stranger.send({ type: 'resume', ...personal.room });
  assert.match((await stolen).message, /座位/);
  const replaced = a.wait('ended'),
    joined = second.wait('joined');
  second.send({ type: 'resume', ...personal.room });
  assert.equal((await joined).slot, 0);
  assert.match((await replaced).message, /另一页面/);
  assert.equal(app.rooms.size, 1);
  const ended = b.wait('ended');
  second.send({ type: 'leave' });
  await ended;
  assert.deepEqual(await (await api(app, '/api/room', a.cookie)).json(), { room: null });
});
test('logout and session expiry immediately revoke websocket authority', async (t) => {
  const { app, a, b } = await room(t);
  const ended = b.wait('ended');
  assert.equal((await api(app, '/api/logout', a.cookie, {})).status, 200);
  assert.match((await ended).message, /登录已失效/);
  assert.equal(app.rooms.size, 0);
  const closed = await setup(t, {
    profilesFactory(file) {
      const store = require('./profiles.cjs').createProfiles(file),
        valid = store.sessionValid;
      store.sessionValid = (req) => !closed.expired && valid(req);
      return store;
    },
  });
  const c = await client(closed.url),
    joined = c.wait('joined');
  c.send({ type: 'create' });
  await joined;
  const revoked = c.wait('ended');
  closed.expired = true;
  assert.match((await revoked).message, /登录已失效/);
  assert.equal(closed.rooms.size, 0);
});
test('host unlocks constrain configuration while allowing a lower-progress partner', async (t) => {
  const { app, a, b, seat } = await room(t, { unlocked: 1 });
  const rejected = a.wait('error');
  a.send({ type: 'configure', mission: 3, stage: 2 });
  assert.match((await rejected).message, /尚未解锁/);
  assert.equal(app.rooms.get(seat.code).stage, 0);
  const { user } = await (await api(app, '/api/me', a.cookie)).json();
  const store = require('./profiles.cjs').createProfiles(app.profilesFile);
  store.mutate(store.byName(user.username), (p) => {
    p.unlocked = 4;
  });
  store.close();
  const configured = a.wait('lobby', (m) => m.mission === 1);
  a.send({ type: 'configure', mission: 1, stage: 0 });
  assert.equal((await configured).unlocked, 4);
  await ready(a, b);
  assert.equal(app.rooms.get(seat.code).game.status, 'playing');
});
test('build, equipment and loadout changes cancel ready; start reads latest persisted build', async (t) => {
  const { app, a, b, seat } = await room(t);
  for (const [route, body] of [
    ['/api/build', { character: 'Asuka', nodes: ['a-guard-1'] }],
    ['/api/equip', { character: 'Asuka', slot: 'weapon', itemId: null }],
    ['/api/loadout', { character: 'Asuka', ammo: 'HESH', melee: 'spear' }],
  ]) {
    const prepared = a.wait('lobby', (m) => m.slots[0].ready);
    a.send({ type: 'ready', ready: true });
    await prepared;
    const unready = a.wait('lobby', (m) => !m.slots[0].ready);
    assert.equal((await api(app, route, a.cookie, body)).status, 200);
    await unready;
  }
  const partner = a.wait('lobby', (m) => m.slots[1].ready);
  b.send({ type: 'ready', ready: true });
  await partner;
  assert.equal(app.rooms.get(seat.code).game, null);
  const started = a.wait('start');
  a.send({ type: 'ready', ready: true });
  await started;
  const p = app.rooms.get(seat.code).game.players[0];
  assert.equal(p.maxHp, 125);
  assert.deepEqual(p.loadout, { ammo: 'HESH', melee: 'spear' });
});
test('tick events are retained between snapshots and do not replay while paused', async (t) => {
  const { app, a, b, seat } = await room(t);
  await ready(a, b);
  const r = app.rooms.get(seat.code),
    original = r.game.step.bind(r.game);
  let emitted = false;
  r.game.step = (dt, input) => {
    original(dt, input);
    r.game.events = emitted ? [] : ['isolated-skill'];
    emitted = true;
  };
  const packet = await a.wait('events', (m) => m.events.some((e) => e.name === 'isolated-skill'));
  assert.equal(packet.round, r.round);
  assert.equal(packet.events.filter((e) => e.name === 'isolated-skill').length, 1);
  const paused = a.wait('state', (m) => m.paused);
  a.send({ type: 'pause', paused: true });
  await paused;
  await a.wait('state', (m) => m.paused);
  assert.equal(
    a.messages
      .filter((m) => m.type === 'events')
      .flatMap((m) => m.events)
      .filter((e) => e.name === 'isolated-skill').length,
    1,
  );
  assert(a.messages.filter((m) => m.type === 'state').every((m) => m.state.events.length === 0));
});
test('readiness distinguishes missing client assets from liveness', async (t) => {
  const app = await setup(t);
  assert.deepEqual(await (await api(app, '/ready')).json(), {
    ok: true,
    build: true,
    storage: true,
  });
  require('node:fs').unlinkSync(
    require('node:path').join(require('node:path').dirname(app.profilesFile), 'index.html'),
  );
  assert.equal((await api(app, '/ready')).status, 503);
  assert.equal((await api(app, '/health')).status, 200);
});
test('password change revokes active sockets and old cookies while issuing a working new session', async (t) => {
  const { app, a, b } = await room(t);
  // Password verification and replacement each perform scrypt; attach both
  // rejection handlers immediately and allow this crypto-bound route its own deadline.
  const [response, ended] = await Promise.all([
    api(app, '/api/password', a.cookie, {
      currentPassword: 'password123',
      newPassword: 'replacement123',
    }),
    b.wait('ended', () => true, 15000),
  ]);
  assert.equal(response.status, 200);
  assert.match(ended.message, /登录已失效/);
  const session = await response.json();
  assert(Number.isSafeInteger(session.user.revision));
  assert.deepEqual(await (await api(app, '/api/me', a.cookie)).json(), { user: null });
  const fresh = response.headers.get('set-cookie');
  assert.equal(
    (await (await api(app, '/api/me', fresh)).json()).user.username,
    session.user.username,
  );
});
test('login throttle separates accounts and trusts forwarded addresses only from configured proxies', async (t) => {
  async function login(app, username, forwarded) {
    return fetch(`http://127.0.0.1:${app.port}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded },
      body: JSON.stringify({ username, password: 'password123' }),
    });
  }
  for (const trusted of [false, true]) {
    const app = await setup(t, { trustedProxies: trusted ? ['127.0.0.1'] : [] });
    for (let attempt = 0; attempt < 15; attempt++)
      assert.equal((await login(app, 'limit_user', '198.51.100.1')).status, 400);
    assert.equal((await login(app, 'limit_user', '198.51.100.1')).status, 429);
    assert.equal((await login(app, 'limit_user', '198.51.100.2')).status, trusted ? 400 : 429);
    assert.equal((await login(app, 'another_user', '198.51.100.1')).status, 400);
  }
});
test('secure cookie configuration reaches real registration and logout headers', async (t) => {
  const app = await setup(t, { secureCookies: true });
  const response = await api(app, '/api/register', '', {
    username: 'secure_user',
    password: 'password123',
  });
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /; Secure/);
  const logout = await api(app, '/api/logout', cookie, {});
  assert.match(logout.headers.get('set-cookie'), /; Secure/);
});
test('failed round registration and settlement keep retrying after players leave without restart', async (t) => {
  let registrationBlocked = true,
    settlementBlocked = true;
  const { app, a, b, seat } = await room(t, {
    profilesFactory(file, options) {
      const store = require('./profiles.cjs').createProfiles(file, options);
      const record = store.recordRound.bind(store),
        settle = store.settleRound.bind(store),
        settlePending = store.settlePending.bind(store);
      store.recordRound = (result) => {
        if (registrationBlocked) throw Error('injected database locked');
        return record(result);
      };
      store.settleRound = (round) => {
        if (settlementBlocked) throw Error('injected settlement failure');
        return settle(round);
      };
      store.settlePending = () => {
        if (settlementBlocked) throw Error('injected settlement failure');
        return settlePending();
      };
      return store;
    },
  });
  await ready(a, b);
  const error = a.wait('error'),
    battleRoom = app.rooms.get(seat.code);
  battleRoom.game.status = 'won';
  await error;
  assert.equal(battleRoom.rewardRecorded, false);
  const ended = b.wait('ended');
  a.send({ type: 'leave' });
  await ended;
  assert.equal(app.rooms.size, 0);
  registrationBlocked = false;
  const fs = require('node:sqlite');
  const db = new fs.DatabaseSync(app.profilesFile, { readOnly: true });
  t.after(() => db.close());
  async function until(predicate) {
    const deadline = Date.now() + 3500;
    while (!predicate()) {
      if (Date.now() > deadline) throw Error('Timed out waiting for background settlement');
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  await until(() => db.prepare('SELECT COUNT(*) n FROM rounds').get().n === 1);
  assert.equal(db.prepare('SELECT state FROM rounds').get().state, 'pending');
  for (const cookie of [a.cookie, b.cookie])
    assert.equal((await (await api(app, '/api/me', cookie)).json()).profile.coins, 0);
  settlementBlocked = false;
  await until(() => db.prepare('SELECT state FROM rounds').get().state === 'settled');
  for (const cookie of [a.cookie, b.cookie]) {
    const { profile } = await (await api(app, '/api/me', cookie)).json();
    assert.equal(profile.coins, 60);
    assert.equal(profile.records.wins, 1);
  }
});
