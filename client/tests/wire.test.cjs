const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { WebSocket } = require('ws');
const { createServer } = require('../../server/server.cjs');
require('./register-loader.cjs');

test('typed room client parses real server lobby, Boss start and pause without fallback', async (t) => {
  const { RoomClient } = await import('../src/services/room-client.ts');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-wire-'));
  const server = createServer({
    allowLegacyClients: true,
    profilesFile: path.join(folder, 'profiles.sqlite'),
  });
  server.server.listen(0, '127.0.0.1');
  await once(server.server, 'listening');
  const clients = [];
  t.after(async () => {
    clients.forEach((c) => c.close(false));
    await server.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const address = server.server.address();
  for (const [key, value] of Object.entries({
    WebSocket,
    location: { protocol: 'http:', host: `127.0.0.1:${address.port}` },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() =>
      descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key],
    );
  }
  function client(initial) {
    const messages = [],
      pending = [];
    const callbacks = Object.fromEntries(
      [
        'joined',
        'lobby',
        'start',
        'state',
        'error',
        'ended',
        'latency',
        'connection',
        'briefing',
      ].map((type) => [
        type,
        (...args) => {
          messages.push({ type, args });
          for (const waiter of [...pending])
            if (waiter.type === type && waiter.predicate(args)) {
              clearTimeout(waiter.timer);
              pending.splice(pending.indexOf(waiter), 1);
              waiter.resolve(args);
            }
        },
      ]),
    );
    const room = new RoomClient(initial, callbacks);
    clients.push(room);
    const wait = (type, predicate = () => true) =>
      new Promise((resolve, reject) => {
        const previous = messages.find((m) => m.type === type && predicate(m.args));
        if (previous) return resolve(previous.args);
        const waiter = {
          type,
          predicate,
          resolve,
          timer: setTimeout(() => reject(Error('Timeout ' + type)), 4000),
        };
        pending.push(waiter);
      });
    return { room, wait, messages };
  }
  async function account(username) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password123' }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie');
  }
  const hostCookie = await account('wire_host'),
    guestCookie = await account('wire_guest');
  const profiles = require('../../server/profiles.cjs').createProfiles(
    path.join(folder, 'profiles.sqlite'),
  );
  profiles.mutate(profiles.byName('wire_host'), (p) => {
    p.unlocked = 3;
  });
  profiles.close();
  let cookie = hostCookie;
  globalThis.WebSocket = class extends WebSocket {
    constructor(url) {
      super(url, { headers: { Cookie: cookie } });
    }
  };
  const host = client({ type: 'create' });
  const [code, hostSlot] = await host.wait('joined');
  assert.equal(hostSlot, 0);
  host.room.send({ type: 'configure', mission: 0, stage: 2, difficulty: 'normal' });
  await host.wait('lobby', ([l]) => l.stage === 2);
  cookie = guestCookie;
  const guest = client({ type: 'join', code });
  const [, guestSlot] = await guest.wait('joined');
  assert.equal(guestSlot, 1);
  host.room.send({ type: 'ready', ready: true });
  guest.room.send({ type: 'ready', ready: true });
  const [[startA], [startB]] = await Promise.all([host.wait('start'), guest.wait('start')]);
  assert.equal(startA.stage, 2);
  assert.equal(startA.round, startB.round);
  const [state] = await host.wait('state');
  assert(state.enemies.some((e) => e.boss));
  assert.equal(state.cooperation.pads.length, 2);
  await t.test(
    'short fire followed immediately by release fires exactly one authoritative shot',
    async () => {
      const game = server.rooms.get(code).game;
      const shoot = game.shoot.bind(game);
      let shots = 0;
      game.shoot = (actor, ...args) => {
        if (actor.id === 'p0') shots++;
        return shoot(actor, ...args);
      };
      const startTime = game.time;
      host.room.input({ fire: true });
      host.room.input({});
      // Repeating the held release retransmits the same unacknowledged command.
      host.room.input({});
      await host.wait('state', ([snapshot]) => snapshot.time >= startTime + 0.8);
      assert.equal(shots, 1);
      assert.equal(server.rooms.get(code).slots[0].commandAck, 1);
      game.shoot = shoot;
    },
  );
  host.room.send({ type: 'pause', paused: true });
  const [[a], [b]] = await Promise.all([
    host.wait('state', (args) => args[1] === true),
    guest.wait('state', (args) => args[1] === true),
  ]);
  assert.equal(a.time, b.time);
  assert.equal(
    host.messages.some((m) => m.type === 'error' || m.type === 'ended'),
    false,
  );
  assert.equal(
    guest.messages.some((m) => m.type === 'error' || m.type === 'ended'),
    false,
  );
});
