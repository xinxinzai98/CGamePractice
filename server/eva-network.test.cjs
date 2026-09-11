'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createServer } = require('./server.cjs');
const { createProfiles } = require('./profiles.cjs');
const { Eva } = require('../packages/simulation/dist/index.js');

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawn-eva-wire-'));
  let store;
  const app = createServer({
    profilesFile: path.join(dir, 'profiles.sqlite'),
    profilesFactory(file, options) {
      store = createProfiles(file, options);
      return store;
    },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function request(route, cookie, body) {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function account(name) {
    const result = await request('/api/register', null, {
      username: name,
      password: 'eva-network-test-password',
    });
    assert.equal(result.status, 200);
    return { name, cookie: result.cookie };
  }
  async function client(account) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws', {
      headers: { cookie: account.cookie },
    });
    const packets = [],
      listeners = new Set();
    ws.on('message', (raw) => {
      const packet = JSON.parse(raw);
      packets.push(packet);
      for (const listener of listeners) listener();
    });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    function wait(type, predicate = () => true) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(Error(`Timed out waiting for ${type}: ${JSON.stringify(packets.slice(-3))}`));
        }, 5000);
        function check() {
          const index = packets.findIndex((p) => p.type === type && predicate(p));
          if (index < 0) return;
          clearTimeout(timer);
          listeners.delete(check);
          resolve(packets.splice(index, 1)[0]);
        }
        listeners.add(check);
        check();
      });
    }
    return { ws, send: (message) => ws.send(JSON.stringify(message)), wait };
  }
  return { app, store, request, account, client, file: path.join(dir, 'profiles.sqlite') };
}

test('v3 HTTP exposes canonical gifts and rejects obsolete economy and room protocols', async (t) => {
  const f = await fixture(t),
    account = await f.account('eva_wire_one');
  const snapshot = await f.request('/api/eva', account.cookie);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.protocolVersion, 3);
  assert.equal(snapshot.data.profile.owned.machines.length, 2);
  assert.equal(snapshot.data.profile.owned.members.length, 3);
  assert.equal(snapshot.data.profile.wallet.gold, 0);
  assert.equal(
    (await f.request('/api/draw', account.cookie, { operationId: 'obsolete-draw' })).status,
    409,
  );
  const socket = await f.client(account);
  socket.send({ type: 'create' });
  assert.match((await socket.wait('error')).message, /刷新|协议/);
  socket.ws.close();
});

test('v3 same driver and machine preserve independent loadouts, resume and atomically settle once', async (t) => {
  const f = await fixture(t),
    a = await f.account('eva_wire_alpha'),
    b = await f.account('eva_wire_beta');
  const accountB = f.store.byName(b.name);
  f.store.mutate(accountB, (p) => {
    const item = Eva.EQUIPMENT.find((e) => e.category === 'ordinary');
    if (!p.eva.owned.equipment.includes(item.id)) p.eva.owned.equipment.push(item.id);
    p.eva.presets.find((preset) => preset.id === p.eva.activePresetId).equipment = [item.id];
  });
  const ca = await f.client(a),
    cb = await f.client(b);
  ca.send({ type: 'create', protocolVersion: 3, missionId: 'mission.campaign.1' });
  const joinedA = await ca.wait('joined');
  cb.send({ type: 'join', protocolVersion: 3, code: joinedA.code });
  const joinedB = await cb.wait('joined');
  ca.send({ type: 'ready', ready: true });
  cb.send({ type: 'ready', ready: true });
  const started = await ca.wait('start');
  await cb.wait('start');
  assert.equal(started.participants[0].driverId, started.participants[1].driverId);
  assert.equal(started.participants[0].machineId, started.participants[1].machineId);
  assert.notDeepEqual(
    started.participants[0].preset.equipment,
    started.participants[1].preset.equipment,
  );
  assert.notEqual(started.participants[0].accountId, started.participants[1].accountId);
  const room = f.app.rooms.get(joinedA.code);
  assert.equal(room.game.players[0].resolved.accountId, a.name);
  assert.equal(room.game.players[1].resolved.accountId, b.name);
  ca.send({
    type: 'input',
    round: started.round,
    input: { dir: -1, fire: false },
    commands: [{ seq: 1, key: 'ultimate' }],
  });
  assert.match((await ca.wait('error')).message, /战术槽/);
  assert.equal(
    room.slots[0].commandSeq,
    0,
    'rejected obsolete abilities do not advance command acknowledgement',
  );
  const checkpoint = f.store.evaCheckpoint;
  f.store.evaCheckpoint = () => {
    throw Error('injected storage outage');
  };
  room.paused = 'storage';
  ca.send({ type: 'pause', paused: false });
  assert.match((await ca.wait('error')).message, /持久化/);
  assert.equal(room.paused, 'storage', 'the browser cannot bypass a failed durable checkpoint');
  f.store.evaCheckpoint = checkpoint;
  cb.ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const resumed = await f.client(b);
  resumed.send({ type: 'resume', protocolVersion: 3, code: joinedA.code, token: joinedB.token });
  assert.equal((await resumed.wait('start')).round, started.round);
  assert.equal(room.game.players[1].resolved.accountId, b.name);
  // Synthetic terminal state isolates transport and transaction behavior from combat balance.
  room.game.status = 'won';
  room.game.completedStages = 1;
  room.game.time = 120;
  room.game.battleEvents.push(
    ...room.participants.flatMap((p, i) => [
      {
        id: `fixture-${i}-objective`,
        seq: 100 + i * 2,
        time: 119,
        kind: 'objective',
        actorId: p.entityId,
        amount: 1,
      },
      {
        id: `fixture-${i}-participation`,
        seq: 101 + i * 2,
        time: 120,
        kind: 'participation',
        actorId: p.entityId,
        amount: 120,
      },
    ]),
  );
  await ca.wait('state', (p) => p.rewardsSaved);
  const before = f.store.byName(a.name).profile.eva;
  assert.equal(before.battles.filter((record) => record.round === started.round).length, 1);
  const review = await f.request(`/api/eva/review?round=${started.round}`, a.cookie);
  assert.equal(review.status, 200);
  assert.equal(review.data.result.record.entityId, 'p0');
  const repeatedRecords = [a, b].map(
    (account) => f.store.evaReview(f.store.byName(account.name), started.round).record,
  );
  const result = f.store.evaFinishRound(started.round, repeatedRecords);
  assert.equal(result.state, 'settled');
  assert.deepEqual(f.store.byName(a.name).profile.eva.wallet, before.wallet);
  const outsider = await f.account('eva_wire_outsider');
  assert.notEqual(
    (await f.request(`/api/eva/review?round=${started.round}`, outsider.cookie)).status,
    200,
  );
  ca.ws.close();
  resumed.ws.close();
});

test('single-player recovery is authoritative, reward-limited and leaves owned machines and stock unchanged', async (t) => {
  const f = await fixture(t),
    a = await f.account('eva_wire_recovery');
  const user = f.store.byName(a.name);
  f.store.mutate(user, (p) => {
    p.eva.wallet.silver = 0;
    for (const machine of Object.values(p.eva.machines)) {
      machine.damage = 1;
      machine.repairDue = 100;
    }
  });
  const before = f.store.byName(a.name).profile.eva;
  const socket = await f.client(a);
  socket.send({
    type: 'create',
    protocolVersion: 3,
    mode: 'recovery',
    solo: true,
    missionId: 'mission.recovery',
  });
  const joined = await socket.wait('joined');
  socket.send({ type: 'ready', ready: true });
  const started = await socket.wait('start');
  assert.equal(started.participants.length, 1);
  assert.equal(started.participants[0].hpFraction, 1);
  const room = f.app.rooms.get(joined.code);
  room.game.status = 'won';
  room.game.completedStages = 1;
  room.game.time = 60;
  room.game.battleEvents.push({
    id: 'fixture-recovery-active',
    seq: 100,
    time: 60,
    kind: 'participation',
    actorId: 'p0',
    amount: 60,
  });
  room.game.battleEvents.push({
    id: 'fixture-recovery-objective',
    seq: 101,
    time: 60,
    kind: 'objective',
    actorId: 'p0',
    amount: 1,
  });
  await socket.wait('state', (p) => p.rewardsSaved);
  const after = f.store.byName(a.name).profile.eva;
  assert.ok(after.wallet.silver > 0);
  assert.equal(after.wallet.gold, before.wallet.gold);
  assert.equal(after.wallet.tickets, before.wallet.tickets);
  assert.deepEqual(after.machines, before.machines);
  assert.deepEqual(after.members, before.members);
  assert.deepEqual(after.stock, before.stock);
  socket.ws.close();
});

test('shutdown flushes a terminal EVA result even after the room was removed', async (t) => {
  const f = await fixture(t),
    a = await f.account('eva_wire_shutdown');
  const socket = await f.client(a);
  socket.send({
    type: 'create',
    protocolVersion: 3,
    mode: 'recovery',
    solo: true,
    missionId: 'mission.recovery',
  });
  const joined = await socket.wait('joined');
  socket.send({ type: 'ready', ready: true });
  const started = await socket.wait('start');
  const room = f.app.rooms.get(joined.code),
    finish = f.store.evaFinishRound;
  f.store.evaFinishRound = () => {
    throw Error('injected terminal write outage');
  };
  room.game.status = 'won';
  room.game.time = 60;
  room.game.completedStages = 1;
  room.game.battleEvents.push({
    id: 'shutdown-objective',
    seq: 100,
    time: 60,
    kind: 'objective',
    actorId: 'p0',
    amount: 1,
  });
  socket.send({ type: 'leave' });
  await socket.wait('ended');
  assert.equal(f.app.rooms.has(joined.code), false);
  f.store.evaFinishRound = finish;
  await f.app.close();
  const reopened = createProfiles(f.file);
  try {
    assert.equal(reopened.evaReview(reopened.byName(a.name), started.round).record.won, true);
    assert.equal(reopened.evaRoundStatus(started.round), 'settled');
  } finally {
    reopened.close();
  }
});

test('a newly created MAGI room deploys its requested unowned trial instead of the account preset', async (t) => {
  const f = await fixture(t),
    a = await f.account('eva_wire_magi');
  const before = f.store.byName(a.name).profile.eva;
  const preset = Eva.defaultPreset(Eva.IDS.eva01, Eva.IDS.shinji, Eva.IDS.ritsuko);
  const socket = await f.client(a);
  socket.send({
    type: 'create',
    protocolVersion: 3,
    mode: 'magi',
    solo: true,
    missionId: 'mission.assault',
    preset,
    seed: 482,
    difficulty: 'hard',
  });
  const joined = await socket.wait('joined');
  const lobby = await socket.wait('lobby');
  assert.equal(lobby.slots[0].machineId, Eva.IDS.eva01);
  assert.equal(lobby.slots[0].driverId, Eva.IDS.shinji);
  socket.send({ type: 'ready', ready: true });
  const start = await socket.wait('start');
  assert.equal(start.participants[0].machineId, Eva.IDS.eva01);
  assert.equal(start.participants[0].driverId, Eva.IDS.shinji);
  assert.equal(start.difficulty, 'hard');
  const room = f.app.rooms.get(joined.code);
  assert.equal(room.seed, 482);
  assert.equal(room.game.players.length, 2);
  assert.equal(room.game.players[1].accountId, 'simulation');
  socket.send({ type: 'leave' });
  await socket.wait('ended');
  assert.deepEqual(f.store.byName(a.name).profile.eva, before);
});
