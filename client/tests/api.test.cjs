const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
require('./register-loader.cjs');
const loaded = Promise.all([import('../src/services/api.ts'), import('@dawn/simulation')]);
function respond(t, payload, status = 200) {
  return t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}
async function fixture() {
  const [api, rules] = await loaded;
  const profile = rules.Progression.createProfile();
  return {
    api,
    rules,
    profile,
    session: { user: { username: 'SyntheticPilot', revision: 1 }, profile },
  };
}
describe('HTTP protocol boundary', { concurrency: false }, () => {
  test('explicit logged-out session is accepted; omitted user and profile reject', async (t) => {
    const { api } = await fixture();
    for (const payload of [{}, { user: {} }, { user: { username: 'SyntheticPilot' } }]) {
      const mock = respond(t, payload);
      await assert.rejects(api.request('me'), { name: 'ProtocolError' });
      mock.mock.restore();
    }
    respond(t, { user: null });
    assert.equal((await api.request('me')).user, null);
    assert.equal((await api.request('logout')).user, null);
    await assert.rejects(api.request('login', { username: 'SyntheticPilot', password: 'unused' }), {
      name: 'ProtocolError',
    });
  });
  test('damaged current profile is not normalized into a successful empty save', async (t) => {
    const { api, session } = await fixture();
    session.profile.coins = 'broken';
    respond(t, session);
    await assert.rejects(api.request('me'), { name: 'ProtocolError' });
  });
  test('authenticated response requires a valid revision and password rotates through a typed session', async (t) => {
    const { api, session } = await fixture();
    for (const revision of [undefined, -1, 1.2, '1']) {
      const mock = respond(t, { ...session, user: { ...session.user, revision } });
      await assert.rejects(api.request('me'), { name: 'ProtocolError' });
      mock.mock.restore();
    }
    const mock = respond(t, session);
    assert.deepEqual(
      await api.request('password', {
        currentPassword: 'synthetic-old',
        newPassword: 'synthetic-new',
      }),
      session,
    );
    assert.equal(mock.mock.calls[0].arguments[0], '/api/password');
  });
  test('active room recovery requires explicit null or a valid private token', async (t) => {
    const { api } = await fixture();
    for (const room of [undefined, {}, { code: 'ABCDEF' }, { code: 'BAD', token: 'seat-secret' }]) {
      const mock = respond(t, { room });
      await assert.rejects(api.getActiveRoom(), { name: 'ProtocolError' });
      mock.mock.restore();
    }
    const noRoom = respond(t, { room: null });
    assert.equal(await api.getActiveRoom(), null);
    noRoom.mock.restore();
    respond(t, { room: { code: 'ABCDEF', token: 'synthetic-seat-token' } });
    assert.deepEqual(await api.getActiveRoom(), { code: 'ABCDEF', token: 'synthetic-seat-token' });
  });
  test('valid current profile and typed battle history retain their values', async (t) => {
    const { api, rules, session } = await fixture();
    const game = new rules.Game(rules.campaign(0));
    session.profile.coins = 120;
    session.profile.records.history = [
      {
        round: 'round-a',
        at: '2026-09-10T00:00:00.000Z',
        character: 'Asuka',
        mission: 1,
        stage: 2,
        won: false,
        xp: 0,
        score: 5,
        time: 90,
        stats: game.players[0].stats,
      },
    ];
    respond(t, session);
    assert.deepEqual((await api.request('me')).profile, session.profile);
  });
  test('draw must contain a complete valid reward, not a fabricated success', async (t) => {
    const { api, session } = await fixture();
    const valid = {
      itemId: 'pulse-coil',
      rarity: 'standard',
      duplicate: false,
      coins: 0,
      pityTriggered: false,
    };
    for (const reward of [
      undefined,
      {},
      { ...valid, rarity: 'mystery' },
      { ...valid, itemId: 'missing-item' },
      { ...valid, duplicate: undefined },
      { ...valid, coins: '40' },
    ]) {
      const mock = respond(t, { ...session, reward });
      await assert.rejects(api.request('draw', {}), { name: 'ProtocolError' });
      mock.mock.restore();
    }
    const mock = respond(t, { ...session, reward: valid });
    assert.deepEqual((await api.request('draw')).reward, valid);
    assert.equal(mock.mock.calls[0].arguments[1].method, 'POST');
  });
  test('room rows reject missing or invalid fields instead of substituting 1-1', async (t) => {
    const { api } = await fixture();
    const valid = { code: 'ABCDEF', mission: 1, stage: 2, difficulty: 'normal', playersCount: 1 };
    for (const row of [
      { code: 'ABCDEF' },
      { ...valid, mission: '1' },
      { ...valid, difficulty: undefined },
      { ...valid, playersCount: 3 },
    ]) {
      const mock = respond(t, { rooms: [row] });
      await assert.rejects(api.listRooms(), { name: 'ProtocolError' });
      mock.mock.restore();
    }
    respond(t, { rooms: [valid] });
    assert.deepEqual(await api.listRooms(), [valid]);
  });
  test('empty successful room list is distinct from transport or server failure', async (t) => {
    const { api } = await fixture();
    const first = respond(t, { rooms: [] });
    assert.deepEqual(await api.listRooms(), []);
    first.mock.restore();
    const second = respond(t, { error: '服务器内部错误，请稍后重试' }, 500);
    await assert.rejects(api.listRooms(), /服务器内部错误/);
    second.mock.restore();
    t.mock.method(globalThis, 'fetch', async () => {
      throw new TypeError('network down');
    });
    await assert.rejects(api.listRooms(), /network down/);
  });
  test('non-JSON response is a protocol error, not a guest session', async (t) => {
    const { api } = await fixture();
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response('<html>bad gateway</html>', { status: 502 }),
    );
    await assert.rejects(api.request('me'), { name: 'ProtocolError' });
  });
});
