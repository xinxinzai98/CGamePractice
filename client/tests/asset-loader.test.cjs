const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./register-loader.cjs');
const modules = Promise.all([
  import('../src/game/asset-loader.ts'),
  import('../src/game/asset-manifest.ts'),
]);

test('first screen loads only its cover; battle art waits for explicit entry', async () => {
  const [{ AssetLoader }, { ASSET_PACKS }] = await modules;
  const requests = [];
  const loader = new AssetLoader(
    {
      load: async (assets, loaded) => {
        requests.push(assets.map((a) => a.key));
        assets.forEach((a) => loaded(a.key));
      },
    },
    () => {},
  );
  await loader.prepare('cover');
  assert.deepEqual(requests, [['cover-dawn']]);
  assert.equal(loader.isReady('cover'), true);
  assert.equal(loader.isReady('battle-new'), false);
  await loader.prepare('hangar');
  await loader.prepare('battle-new');
  assert.ok(requests[1].includes('pilot-asuka'));
  assert.equal(
    requests[1].some((key) => key.startsWith('enemy-')),
    false,
  );
  assert.equal(
    requests[2].some((key) => key.startsWith('combat-')),
    false,
    'reuse lobby card textures',
  );
  assert.equal(loader.isReady('battle-new'), true);
  assert.equal(
    ASSET_PACKS['battle-legacy'].some((a) => a.key.startsWith('Tank')),
    true,
  );
});

test('a required asset failure never reaches ready or 100%; retry loads only missing assets', async () => {
  const [{ AssetLoader }] = await modules;
  let fail = true;
  const requests = [],
    progress = [];
  const loader = new AssetLoader(
    {
      load: async (assets, loaded) => {
        requests.push(assets.map((a) => a.key));
        for (const asset of assets) {
          if (fail && asset.key === 'boss-core') continue;
          loaded(asset.key);
        }
        if (fail) throw new Error('fixture 404: boss-core');
      },
    },
    (value, pack) => progress.push([pack, value]),
  );
  await assert.rejects(loader.prepare('battle-new'), /boss-core/);
  assert.equal(loader.isReady('battle-new'), false);
  assert.ok(progress.every(([, value]) => value < 1));
  fail = false;
  await loader.prepare('battle-new');
  assert.deepEqual(requests[1], ['boss-core']);
  assert.equal(loader.isReady('battle-new'), true);
  assert.deepEqual(progress.at(-1), ['battle-new', 1]);
});

test('overlapping pack requests share work and serialize the Phaser loader', async () => {
  const [{ AssetLoader }] = await modules;
  const releases = [];
  const requests = [];
  const loader = new AssetLoader(
    {
      load: (assets, loaded) => {
        requests.push(assets.map((a) => a.key));
        return new Promise((resolve) =>
          releases.push(() => {
            assets.forEach((a) => loaded(a.key));
            resolve();
          }),
        );
      },
    },
    () => {},
  );
  const first = loader.prepare('hangar');
  assert.equal(loader.prepare('hangar'), first);
  const second = loader.prepare('battle-new');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  releases.shift()();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].includes('combat-asuka'), false);
  releases.shift()();
  await second;
});

test('destroy aborts active resource work and rejects queued or later work', async () => {
  const [{ AssetLoader }] = await modules;
  const loader = new AssetLoader(
    {
      load: (_assets, _loaded, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    },
    () => {},
  );
  const active = loader.prepare('cover');
  const queued = loader.prepare('hangar');
  await new Promise((resolve) => setImmediate(resolve));
  const activeRejected = assert.rejects(active, /取消/);
  const queuedRejected = assert.rejects(queued, /取消/);
  loader.destroy();
  await Promise.all([activeRejected, queuedRejected]);
  await assert.rejects(loader.prepare('battle-new'), /取消/);
});

test('build manifest includes all current UI images and every declared file exists', async () => {
  const [, { ASSET_FILES, ASSET_PACKS }] = await modules;
  for (const file of ASSET_FILES)
    assert.ok(fs.statSync(path.join(__dirname, '../../web/assets', file)).isFile(), file);
  for (const file of [
    'Hello.png',
    'mecha-asuka.png',
    'mecha-rei.png',
    'pilot-asuka.png',
    'pilot-rei.png',
    'skill-icons.png',
  ])
    assert.ok(ASSET_FILES.includes(file), file);
  assert.ok(ASSET_FILES.length < fs.readdirSync(path.join(__dirname, '../../web/assets')).length);
  const definitions = new Map();
  for (const asset of Object.values(ASSET_PACKS).flat()) {
    if (definitions.has(asset.key)) assert.deepEqual(definitions.get(asset.key), asset);
    definitions.set(asset.key, asset);
  }
});
