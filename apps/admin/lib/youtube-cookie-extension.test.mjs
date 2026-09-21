import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../public/youtube-cookie-sync/background.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../public/youtube-cookie-sync/content.js', import.meta.url), 'utf8');

test('only an allowed top-level admin tab can read YouTube cookies from its own store', async () => {
  let handler;
  let calls = 0;
  const chrome = { runtime: { onMessage: { addListener(fn) { handler = fn; } } }, cookies: {
    async getAllCookieStores() { return [{ id: 'current', tabIds: [7] }]; },
    async getAll(query) {
      calls++;
      assert.deepEqual(JSON.parse(JSON.stringify(query)), { domain: 'youtube.com', storeId: 'current' });
      return [
        { domain: '.youtube.com', path: '/', name: 'SID', value: 'secret', secure: true, httpOnly: true },
        { domain: '.youtube.com.evil.test', name: 'bad', value: 'never-export' },
        { domain: '.youtube.com', name: 'partitioned', value: 'never-export', partitionKey: {} },
        { domain: '.youtube.com', name: 'expired', expirationDate: 1, value: 'never-export' },
      ];
    },
  } };
  vm.runInNewContext(background, { chrome, URL, Date, Set });
  const request = { type: 'read-youtube-cookies' };
  assert.equal(handler(request, { tab: { id: 7 }, frameId: 0, url: 'https://evil.test' }, () => assert.fail()), undefined);
  assert.equal(handler(request, { tab: { id: 7 }, frameId: 1, url: 'https://admin.johnnyallen.blog' }, () => assert.fail()), undefined);
  const result = await new Promise(resolve => handler(request, { tab: { id: 7 }, frameId: 0, url: 'https://admin.johnnyallen.blog/music/youtube' }, resolve));
  assert.equal(calls, 1);
  assert.equal(result.cookies, '# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsecret\n');
});

test('sync uses the authenticated same-origin proxy and never exposes cookie values to page messages', async () => {
  let listener;
  const messages = [];
  const location = { origin: 'https://admin.johnnyallen.blog' };
  const window = { addEventListener(_, fn) { listener = fn; }, postMessage(payload) { messages.push(payload); } };
  let requests = 0;
  vm.runInNewContext(content, {
    window, location, AbortSignal,
    chrome: { runtime: { async sendMessage() { return { cookies: 'sensitive-cookie' }; } } },
    async fetch(url, options) {
      requests++;
      assert.equal(url, '/api/backend/music/youtube-cookies');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(JSON.parse(options.body).cookies, 'sensitive-cookie');
      return { ok: true };
    },
  });
  await listener({ source: window, origin: 'https://evil.test', data: { source: 'johnny-music-admin', action: 'sync', id: 'bad' } });
  assert.equal(requests, 0);
  await listener({ source: window, origin: location.origin, data: { source: 'johnny-music-admin', action: 'sync', id: 'good' } });
  assert.equal(requests, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ source: 'johnny-cookie-extension', id: 'good', ok: true }]);
});
