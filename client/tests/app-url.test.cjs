const { test } = require('node:test');
const assert = require('node:assert/strict');
const loaded = import('../src/app-url.ts');

test('deployment paths retain API, asset, socket and query routes under each base', async () => {
  const { appUrl } = await loaded;
  for (const path of [
    '/api/me',
    '/api/eva/review?round=a%20b',
    '/ws',
    '/assets/pilot-rei.png',
    '/eva/battle-heal.svg',
    '/identity/dawn-wordmark.png',
  ]) {
    assert.equal(appUrl(path), path);
    assert.equal(appUrl(path, '/'), path);
    for (const base of ['/dawn/', '/dawn', 'dawn'])
      assert.equal(appUrl(path, base), '/dawn' + path);
  }
});

test('room invitations preserve deployment path and safely encode the room', async () => {
  const { roomShareUrl } = await loaded;
  assert.equal(
    roomShareUrl('ABC123', 'https://example.test', '/dawn/'),
    'https://example.test/dawn/?room=ABC123',
  );
  assert.equal(roomShareUrl('A B&x', 'https://example.test'), 'https://example.test/?room=A+B%26x');
});
