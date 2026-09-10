const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
require('./register-loader.cjs');
const modules = Promise.all([
  import('../src/services/room-client.ts'),
  import('../src/services/room-protocol.ts'),
  import('@dawn/simulation'),
]);

class FakeWebSocket {
  static OPEN = 1;
  static sockets = [];
  readyState = 0;
  sent = [];
  constructor(url) {
    this.url = url;
    FakeWebSocket.sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(value) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) });
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}
async function setup(t) {
  const [{ RoomClient }, protocol, simulation] = await modules;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const [key, value] of Object.entries({
    WebSocket: FakeWebSocket,
    location: { protocol: 'http:', host: 'localhost:8178' },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() =>
      descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key],
    );
  }
  FakeWebSocket.sockets = [];
  const events = [];
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
    ].map((name) => [name, (...args) => events.push([name, ...args])]),
  );
  const client = new RoomClient({ type: 'create' }, callbacks);
  t.after(() => client.close(false));
  const ws = FakeWebSocket.sockets[0];
  ws.open();
  return { client, ws, events, ...protocol, ...simulation };
}
const joined = { type: 'joined', code: 'ABC123', token: 'resume-token', slot: 1 };
function start(map) {
  return {
    type: 'start',
    map,
    mission: 0,
    stage: 0,
    difficulty: 'normal',
    characters: ['Asuka', 'Rei'],
    round: 'round-1',
  };
}
function snapshot(simulation) {
  const game = new simulation.Game(simulation.campaign(0), { coop: true });
  const { map, practice, ...state } = game;
  return { type: 'state', state, paused: false, waiting: false, rewardsSaved: false };
}

describe('RoomClient boundary parsing', { concurrency: false }, () => {
  for (const [name, payload] of [
    ['malformed JSON', '{broken'],
    ['joined without token', { type: 'joined', code: 'ABC123', slot: 0 }],
    ['joined with invalid slot', { ...joined, slot: '1' }],
    ['start without map', { ...start(undefined) }],
  ]) {
    test(`${name} closes instead of waiting forever`, async (t) => {
      const { ws, events } = await setup(t);
      ws.receive(payload);
      assert.equal(ws.readyState, 3);
      assert.equal(events.filter(([name]) => name === 'ended').length, 1);
      assert.match(events.find(([name]) => name === 'ended')[1], /格式错误/);
      assert.equal(
        events.some(([name]) => name === 'joined' || name === 'start'),
        false,
      );
      t.mock.timers.tick(20000);
      assert.equal(
        FakeWebSocket.sockets.length,
        1,
        'protocol errors must not reconnect with the same invalid session',
      );
    });
  }
  test('unknown extension types are ignored; normal joined and briefing continue', async (t) => {
    const { ws, events, parseRoomMessage } = await setup(t);
    assert.equal(parseRoomMessage('{"type":"future-extension","payload":42}'), null);
    ws.receive({ type: 'future-extension', payload: 42 });
    ws.receive(joined);
    ws.receive({ type: 'briefing' });
    assert.equal(ws.readyState, 1);
    assert.deepEqual(
      events.find(([name]) => name === 'joined'),
      ['joined', 'ABC123', 1],
    );
    assert.equal(events.filter(([name]) => name === 'briefing').length, 1);
    assert.equal(
      events.some(([name]) => name === 'ended'),
      false,
    );
  });
  test('normal lobby, start and map-free simulation state reach callbacks unchanged', async (t) => {
    const s = await setup(t);
    s.ws.receive(joined);
    s.ws.receive({
      type: 'lobby',
      code: 'ABC123',
      mission: 0,
      stage: 1,
      difficulty: 'normal',
      map: '旧日清晨',
      slots: [
        { character: 'Asuka', username: null, connected: true, ready: false },
        { character: 'Rei', username: 'friend', connected: true, ready: true },
      ],
    });
    s.ws.receive(start(s.campaign(0)));
    const packet = snapshot(s);
    s.ws.receive(packet);
    assert.equal(s.events.filter(([name]) => name === 'start').length, 1);
    const event = s.events.find(([name]) => name === 'state');
    assert.ok(event);
    assert.equal('map' in event[1], false);
    assert.equal('practice' in event[1], false);
    assert.deepEqual(event[1].players, packet.state.players);
    assert.deepEqual(event.slice(2), [false, false, false]);
    assert.equal(
      s.events.some(([name]) => name === 'ended'),
      false,
    );
  });
  test('malformed known state flags close a joined connection', async (t) => {
    const s = await setup(t);
    s.ws.receive(joined);
    s.ws.receive({ ...snapshot(s), paused: 'false' });
    assert.equal(s.ws.readyState, 3);
    assert.match(s.events.find(([name]) => name === 'ended')[1], /paused/);
  });
  test('disconnect resumes with token; explicit leave does not reconnect', async (t) => {
    const { ws, events, client } = await setup(t);
    ws.receive(joined);
    ws.close();
    assert.ok(events.some(([name, status]) => name === 'connection' && status === 'reconnecting'));
    t.mock.timers.tick(1200);
    const resumed = FakeWebSocket.sockets[1];
    resumed.open();
    assert.deepEqual(resumed.sent[0], { type: 'resume', code: 'ABC123', token: 'resume-token' });
    resumed.receive(joined);
    client.close();
    assert.deepEqual(resumed.sent.at(-1), { type: 'leave' });
    t.mock.timers.tick(20000);
    assert.equal(FakeWebSocket.sockets.length, 2);
  });
  test('reconnect retains bounded attempts', async (t) => {
    const { ws, events } = await setup(t);
    ws.receive(joined);
    for (let attempt = 0; attempt < 16; attempt++) {
      FakeWebSocket.sockets.at(-1).close();
      t.mock.timers.tick(1200);
    }
    assert.equal(FakeWebSocket.sockets.length, 16);
    assert.deepEqual(events.at(-1), ['ended', '重连超时，请重新组队。']);
  });
  test('unexpected callback failures remain visible programming errors', async (t) => {
    const { ws, client } = await setup(t);
    client.callbacks.briefing = () => {
      throw new TypeError('render bug');
    };
    assert.throws(() => ws.receive({ type: 'briefing' }), /render bug/);
    assert.equal(ws.readyState, 1);
  });
});
