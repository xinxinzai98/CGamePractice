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
  const server = createServer({ profilesFile: path.join(folder, 'profiles.sqlite') });
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
  const host = client({ type: 'create' });
  const [code, hostSlot] = await host.wait('joined');
  assert.equal(hostSlot, 0);
  host.room.send({ type: 'configure', mission: 0, stage: 2, difficulty: 'normal' });
  await host.wait('lobby', ([l]) => l.stage === 2);
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
