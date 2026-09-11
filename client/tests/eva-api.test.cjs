const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
require('./register-loader.cjs');
const loaded = Promise.all([import('../src/services/eva-api.ts'), import('@dawn/simulation')]);

function storage(t) {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  t.after(() =>
    previous
      ? Object.defineProperty(globalThis, 'sessionStorage', previous)
      : delete globalThis.sessionStorage,
  );
  return values;
}
const respond = (profile, username = 'Pilot-A', revision = 2) =>
  new Response(JSON.stringify({ user: { username, revision }, profile }), {
    headers: { 'Content-Type': 'application/json' },
  });

describe('EVA action and identity boundaries', { concurrency: false }, () => {
  test('a lost response keeps its exact operation ID and retry does not create a second transaction', async (t) => {
    const [api, { Eva }] = await loaded;
    storage(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (_url, request) => {
      calls.push(JSON.parse(request.body));
      if (calls.length === 1) throw new Error('response lost');
      return respond(Eva.createProfile());
    });
    await assert.rejects(api.mutateEva('Pilot-A', 1, 'draw'), /response lost/);
    const pending = api.pendingEva('Pilot-A');
    assert.equal(pending.action, 'draw');
    await assert.rejects(
      api.mutateEva('Pilot-A', 1, 'purchase', { offerId: 'offer.license.30d' }),
      /上次操作/,
    );
    assert.equal(calls.length, 1);
    await api.mutateEva('Pilot-A', 1, pending.action, pending.body, pending);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(api.pendingEva('Pilot-A'), null);
  });
  test('switching accounts preserves separate pending transactions and prevents cross-account replay', async (t) => {
    const [api] = await loaded;
    storage(t);
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline');
    });
    await assert.rejects(api.mutateEva('Pilot-A', 1, 'draw'), /offline/);
    await assert.rejects(api.mutateEva('Pilot-B', 1, 'draw'), /offline/);
    const a = api.pendingEva('Pilot-A'),
      b = api.pendingEva('Pilot-B');
    assert.notEqual(a.operationId, b.operationId);
    await assert.rejects(api.mutateEva('Pilot-B', 1, a.action, a.body, a), /不匹配/);
    assert.equal(api.pendingEva('Pilot-A').operationId, a.operationId);
    assert.equal(api.pendingEva('Pilot-B').operationId, b.operationId);
  });
  test('corrupt pending JSON fails closed without issuing a new mutation or deleting evidence', async (t) => {
    const [api] = await loaded;
    const values = storage(t);
    values.set('dawn.eva.pending.v3:Pilot-A', '{broken-json');
    const mock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('must not send');
    });
    const state = api.evaPendingState('Pilot-A');
    assert.match(state.error, /缓存损坏/);
    assert.equal(state.operation, null);
    await assert.rejects(api.mutateEva('Pilot-A', 1, 'draw'), /缓存损坏/);
    assert.equal(mock.mock.callCount(), 0);
    assert.equal(values.get('dawn.eva.pending.v3:Pilot-A'), '{broken-json');
  });
  test('malformed or cross-account successful response retains the original pending action', async (t) => {
    const [api, { Eva }] = await loaded;
    storage(t);
    const mock = t.mock.method(globalThis, 'fetch', async () =>
      respond(Eva.createProfile(), 'Pilot-B'),
    );
    await assert.rejects(api.mutateEva('Pilot-A', 1, 'draw'), /响应账号/);
    const pending = api.pendingEva('Pilot-A');
    assert.ok(pending);
    mock.mock.restore();
    t.mock.method(globalThis, 'fetch', async () => new Response('null'));
    await assert.rejects(
      api.mutateEva('Pilot-A', 1, pending.action, pending.body, pending),
      /响应无效/,
    );
    assert.equal(api.pendingEva('Pilot-A').operationId, pending.operationId);
  });
  test('definite rejection clears the rejected transaction and surfaces the server message', async (t) => {
    const [api] = await loaded;
    storage(t);
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response(JSON.stringify({ error: '作战经费不足' }), { status: 409 }),
    );
    await assert.rejects(
      api.mutateEva('Pilot-A', 1, 'repair', { machineId: 'machine.rebuild.eva02.base' }),
      /作战经费不足/,
    );
    assert.equal(api.pendingEva('Pilot-A'), null);
  });
  test('identity epoch, account, and monotonic revision all gate asynchronous responses', async () => {
    const [api, { Eva }] = await loaded;
    const request = { username: 'Pilot-A', revision: 2, epoch: 7 };
    const result = { user: { username: 'Pilot-A', revision: 3 }, profile: Eva.createProfile() };
    assert.equal(api.acceptsEvaResponse(request, request, result), true);
    assert.equal(api.acceptsEvaResponse({ ...request, epoch: 8 }, request, result), false);
    assert.equal(
      api.acceptsEvaResponse({ ...request, username: 'Pilot-B' }, request, result),
      false,
    );
    assert.equal(api.acceptsEvaResponse({ ...request, revision: 4 }, request, result), false);
    assert.equal(
      api.acceptsEvaResponse(request, request, {
        ...result,
        user: { username: 'Pilot-B', revision: 3 },
      }),
      false,
    );
  });
});
