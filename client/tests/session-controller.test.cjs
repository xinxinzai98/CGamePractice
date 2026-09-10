const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./register-loader.cjs');
const modules = Promise.all([
  import('../src/services/session-controller.ts'),
  import('../src/services/save-task.ts'),
  import('../src/services/api.ts'),
]);
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
function session(name = 'PilotA', revision = 1, extra = {}) {
  return { user: { username: name, revision }, profile: { coins: revision * 10, ...extra } };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('an old me cannot overwrite a newly authenticated identity', async () => {
  const [{ SessionController }] = await modules;
  const old = deferred(),
    applied = [];
  const controller = new SessionController(
    async (action) => (action === 'me' ? old.promise : session('PilotB')),
    (value) => applied.push(value),
    storage(),
  );
  const read = controller.run('me');
  await tick();
  await controller.run('login', {});
  old.resolve({ user: null, profile: {} });
  await assert.rejects(read, { name: 'SupersededSessionError' });
  assert.deepEqual(
    applied.map((value) => value.user.username),
    ['PilotB'],
  );
});
test('server revision prevents a late read from undoing a successful save', async () => {
  const [{ SessionController }] = await modules;
  const old = deferred();
  let reads = 0;
  const controller = new SessionController(
    async (action) =>
      action === 'me' ? (++reads === 1 ? session() : old.promise) : session('PilotA', 3),
    () => {},
    storage(),
  );
  await controller.run('me');
  const read = controller.run('me');
  await tick();
  await controller.run('build', {});
  old.resolve(session('PilotA', 2));
  await read;
  assert.equal(controller.snapshot.user.revision, 3);
  assert.equal(controller.snapshot.profile.coins, 30);
});
test('setting mutations execute in invocation order and retain partial preference patches', async () => {
  const [{ SessionController }] = await modules;
  const first = deferred(),
    calls = [];
  const controller = new SessionController(
    async (action, body) => {
      if (action === 'me') return session();
      calls.push(body);
      return calls.length === 1 ? first.promise : session('PilotA', 3);
    },
    () => {},
    storage(),
  );
  await controller.run('me');
  const a = controller.run('appearance', { pilot: 'Rei' });
  const b = controller.run('appearance', { reducedMotion: true });
  await tick();
  assert.deepEqual(calls, [{ pilot: 'Rei' }]);
  first.resolve(session('PilotA', 2));
  await Promise.all([a, b]);
  assert.deepEqual(calls, [{ pilot: 'Rei' }, { reducedMotion: true }]);
});
test('me requested during login waits for the newly issued cookie', async () => {
  const [{ SessionController }] = await modules;
  const login = deferred(),
    calls = [];
  const controller = new SessionController(
    async (action) => {
      calls.push(action);
      return action === 'login' ? login.promise : session('PilotB', 2);
    },
    () => {},
    storage(),
  );
  const auth = controller.run('login', {}),
    me = controller.run('me');
  await tick();
  assert.deepEqual(calls, ['login']);
  login.resolve(session('PilotB'));
  await Promise.all([auth, me]);
  assert.deepEqual(calls, ['login', 'me']);
});
test('unknown draw outcome reuses its operation ID after page recreation, then clears it on success', async () => {
  const [{ SessionController }] = await modules;
  const saved = storage(),
    ids = [];
  const client = async (action, body) => {
    if (action === 'me') return session();
    ids.push(body.operationId);
    if (ids.length === 1) throw new TypeError('response lost after commit');
    return { ...session('PilotA', 2), reward: { itemId: 'pulse-coil' } };
  };
  const a = new SessionController(
    client,
    () => {},
    saved,
    () => {},
    () => 'stable-operation-1',
  );
  await a.run('me');
  await assert.rejects(a.run('draw', {}), /response lost/);
  assert.equal(a.pending().length, 1);
  const b = new SessionController(
    client,
    () => {},
    saved,
    () => {},
    () => 'new-operation-2',
  );
  await b.run('me');
  await b.run('draw', {});
  assert.deepEqual(ids, ['stable-operation-1', 'stable-operation-1']);
  assert.equal(b.pending().length, 0);
  await b.run('draw', {});
  assert.equal(ids[2], 'new-operation-2');
});
test('definitive rejected economics clear their IDs, server failures retain them, accounts remain separate', async () => {
  const [{ SessionController }, , { ApiError }] = await modules;
  let name = 'PilotA',
    code = 400;
  const controller = new SessionController(
    async (action) => {
      if (action === 'me' || action === 'login') return session(name);
      throw new ApiError('failed', code);
    },
    () => {},
    storage(),
  );
  await controller.run('me');
  await assert.rejects(controller.run('shop', { itemId: 'pulse-coil' }));
  assert.equal(controller.pending().length, 0);
  code = 500;
  await assert.rejects(controller.run('shop', { itemId: 'pulse-coil' }));
  assert.equal(controller.pending().length, 1);
  name = 'PilotB';
  await controller.run('login');
  assert.equal(controller.pending().length, 0);
  name = 'PilotA';
  await controller.run('login');
  assert.equal(controller.pending().length, 1);
});
test('queued old-account mutations are cancelled when changing identity', async () => {
  const [{ SessionController }] = await modules;
  const first = deferred(),
    calls = [];
  const controller = new SessionController(
    async (action) => {
      calls.push(action);
      if (action === 'appearance') return first.promise;
      return session(action === 'login' ? 'PilotB' : 'PilotA');
    },
    () => {},
    storage(),
  );
  await controller.run('me');
  const a = controller.run('appearance', { pilot: 'Rei' });
  const aCheck = assert.rejects(a, { name: 'SupersededSessionError' });
  await tick();
  const b = controller.run('build', {});
  const bCheck = assert.rejects(b, { name: 'SupersededSessionError' });
  const login = controller.run('login', {});
  first.resolve(session('PilotA', 2));
  await Promise.all([aCheck, bCheck, login]);
  assert.deepEqual(calls, ['me', 'appearance', 'login']);
  assert.equal(controller.snapshot.user.username, 'PilotB');
});
test('corrupted operation cache stays intact and blocks only economic writes, not login or browsing', async () => {
  const [{ SessionController }] = await modules;
  const saved = storage(),
    calls = [];
  saved.setItem('dawn.pending-operations:PilotA', '{damaged operation evidence');
  const controller = new SessionController(
    async (action) => {
      calls.push(action);
      return session();
    },
    () => {},
    saved,
  );
  await controller.run('me');
  assert.match(controller.pendingState().error, /原始记录仍保留/);
  await assert.rejects(controller.run('draw'), /交易缓存无法读取/);
  assert.deepEqual(calls, ['me']);
  await controller.run('appearance', { pilot: 'Rei' });
  await controller.run('login');
  assert.deepEqual(calls, ['me', 'appearance', 'login']);
  assert.equal(saved.getItem('dawn.pending-operations:PilotA'), '{damaged operation evidence');
});
test('training and reward sync report failure, serialize attempts, and mark saved only after success', async () => {
  const [, { SaveTask }] = await modules;
  const states = [],
    task = new SaveTask((status) => states.push(status)),
    first = deferred();
  const run = task.run(() => first.promise);
  assert.equal(task.status, 'pending');
  assert.equal(await task.run(() => assert.fail('parallel save')), false);
  first.reject(new Error('temporarily offline'));
  assert.equal(await run, false);
  assert.equal(task.status, 'failed');
  assert.equal(task.error, 'temporarily offline');
  assert.equal(await task.run(async () => {}), true);
  assert.equal(task.status, 'saved');
  assert.deepEqual(states, ['pending', 'failed', 'pending', 'saved']);
});
test('a completed old training session does not mark a reset session as saved', async () => {
  const [, { SaveTask }] = await modules;
  const task = new SaveTask(() => {}),
    old = deferred();
  const run = task.run(() => old.promise);
  task.reset();
  old.resolve();
  assert.equal(await run, false);
  assert.equal(task.status, 'idle');
});
