const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createServer } = require('../../server/server.cjs');
require('./register-loader.cjs');

for (const roundTripMs of [80, 150]) {
  test(`two clients retain short commands and resume the same round at ${roundTripMs} ms RTT with jitter`, async (t) => {
    const { RoomClient } = await import('../src/services/room-client.ts');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-latency-'));
    const app = createServer({
      allowLegacyClients: true,
      profilesFile: path.join(directory, 'profiles.sqlite'),
    });
    const clients = [],
      sockets = [];
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const base = `http://127.0.0.1:${app.server.address().port}`;
    t.after(async () => {
      clients.forEach((client) => client.close(false));
      sockets.forEach((socket) => socket.dispose());
      await app.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const cookies = [];
    for (const username of ['latency_pilot_a', 'latency_pilot_b']) {
      const response = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'latency-test-only' }),
      });
      assert.equal(response.status, 200);
      cookies.push(response.headers.get('set-cookie').split(';')[0]);
    }
    let cookie = cookies[0];
    class DelayedSocket {
      static OPEN = 1;
      constructor(url) {
        this.socket = new WebSocket(url, { headers: { Cookie: cookie } });
        this.timers = new Set();
        this.deadlines = { send: 0, receive: 0 };
        this.serial = 0;
        this.socket.on('open', () => this.schedule('receive', () => this.onopen?.()));
        this.socket.on('message', (data) =>
          this.schedule('receive', () => this.onmessage?.({ data: data.toString() })),
        );
        this.socket.on('close', () => this.schedule('receive', () => this.onclose?.()));
        this.socket.on('error', (error) => this.onerror?.(error));
        sockets.push(this);
      }
      get readyState() {
        return this.socket.readyState;
      }
      schedule(direction, action) {
        // Preserve WebSocket ordering while introducing reproducible jitter and batching.
        const jitter = [-15, 18, -6, 10, 0][this.serial++ % 5];
        const at = Math.max(this.deadlines[direction], Date.now() + roundTripMs / 2 + jitter);
        this.deadlines[direction] = at;
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          action();
        }, at - Date.now());
        this.timers.add(timer);
      }
      send(data) {
        this.schedule('send', () => {
          if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
        });
      }
      close() {
        this.socket.close();
      }
      dispose() {
        this.timers.forEach(clearTimeout);
        this.timers.clear();
        this.socket.terminate();
      }
    }
    for (const [key, value] of Object.entries({
      WebSocket: DelayedSocket,
      location: { protocol: 'http:', host: new URL(base).host },
    })) {
      const original = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
      t.after(() =>
        original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key],
      );
    }
    function connect(initial, auth) {
      cookie = auth;
      const history = [],
        waiting = [];
      const callbacks = Object.fromEntries(
        [
          'joined',
          'lobby',
          'start',
          'state',
          'events',
          'ended',
          'error',
          'connection',
          'latency',
          'briefing',
        ].map((type) => [
          type,
          (...args) => {
            history.push({ type, args });
            for (const entry of [...waiting])
              if (entry.type === type && entry.predicate(args)) {
                clearTimeout(entry.timer);
                waiting.splice(waiting.indexOf(entry), 1);
                entry.resolve(args);
              }
          },
        ]),
      );
      const client = new RoomClient(initial, callbacks);
      clients.push(client);
      const wait = (type, predicate = () => true) => {
        const old = history.find((item) => item.type === type && predicate(item.args));
        if (old) return Promise.resolve(old.args);
        return new Promise((resolve, reject) => {
          const entry = {
            type,
            predicate,
            resolve,
            timer: setTimeout(() => reject(Error(`Timed out: ${type}`)), 5000),
          };
          waiting.push(entry);
        });
      };
      return { client, history, wait };
    }
    const host = connect({ type: 'create' }, cookies[0]);
    const [code] = await host.wait('joined');
    const partner = connect({ type: 'join', code }, cookies[1]);
    await partner.wait('joined');
    host.client.send({ type: 'ready', ready: true });
    partner.client.send({ type: 'ready', ready: true });
    const [[initialRound]] = await Promise.all([host.wait('start'), partner.wait('start')]);
    const room = app.rooms.get(code);
    for (const enemy of room.game.enemies) {
      enemy.fire = 100;
      enemy.think = 100;
    }
    room.game.players[0].hp = 60;
    host.client.input({ heal: true });
    host.client.input({});
    const [healed] = await host.wait(
      'state',
      ([state]) => state.players[0].stats.skillUses.heal === 1,
    );
    assert.equal(healed.players[0].stats.heals, 1);
    await host.wait('events', ([events]) => events.includes('heal'));
    host.client.send({ type: 'pause', paused: true });
    const [[hostState], [partnerState]] = await Promise.all([
      host.wait('state', (args) => args[1] === true),
      partner.wait('state', (args) => args[1] === true),
    ]);
    assert.equal(hostState.time, partnerState.time);
    host.client.close(false);
    const response = await fetch(`${base}/api/room`, { headers: { Cookie: cookies[0] } });
    assert.equal(response.status, 200);
    const { room: resume } = await response.json();
    assert.equal(resume.code, code);
    const restored = connect({ type: 'resume', ...resume }, cookies[0]);
    const [restoredRound] = await restored.wait('start');
    assert.equal(restoredRound.round, initialRound.round);
    const [restoredState] = await restored.wait('state');
    assert.equal(restoredState.players[0].stats.skillUses.heal, 1);
    assert.equal(
      partner.history.some((item) => item.type === 'error' || item.type === 'ended'),
      false,
    );
  });
}
