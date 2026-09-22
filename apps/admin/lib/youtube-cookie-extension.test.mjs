import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const background = await readFile(new URL('../public/youtube-cookie-sync/background.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../public/youtube-cookie-sync/content.js', import.meta.url), 'utf8');
const origin = 'https://admin.johnnyallen.blog';
const popup = { url: 'chrome-extension://test/popup.html' };
const admin = { tab: { id: 8 }, frameId: 0, url: origin + '/music/youtube' };
function setup(cookies = [{ domain: '.youtube.com', path: '/', name: 'VISITOR', value: 'secret', secure: true, httpOnly: true }]) {
  let handler;
  const session = {};
  const tabs = [];
  const reads = [];
  const chrome = {
    runtime: { getURL: path => 'chrome-extension://test/' + path, onMessage: { addListener(fn) { handler = fn; } } },
    cookies: {
      async getAllCookieStores() { return [{ id: 'current', tabIds: [7, 8] }, { id: 'other', tabIds: [9] }]; },
      async getAll(query) { reads.push(query); return cookies; },
    },
    tabs: {
      async query(query) { return query.active ? [{ id: 7, url: 'https://www.youtube.com/watch?v=test', windowId: 1, incognito: false }] : [{ id: 8, incognito: false }]; },
      async update(id, properties) { tabs.push({ id, ...properties }); },
      async create(properties) { tabs.push(properties); },
    },
    storage: { session: {
      async set(value) { Object.assign(session, value); },
      async get(key) { return { [key]: session[key] }; },
      async remove(key) { delete session[key]; },
    } },
  };
  vm.runInNewContext(background, { chrome, URL, Date, Set, crypto: { randomUUID } });
  return { handler, session, tabs, reads, send: (message, sender = popup) => new Promise(resolve => handler(message, sender, resolve)) };
}

test('manual export reads the YouTube tab store without checking admin login or guessing YouTube login', async () => {
  const env = setup();
  const result = await env.send({ type: 'export-youtube-cookies' });
  assert.equal(result.cookies, '# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tVISITOR\tsecret\n');
  assert.deepEqual(JSON.parse(JSON.stringify(env.reads)), [{ domain: 'youtube.com', storeId: 'current' }]);
  assert.equal(env.tabs.length, 0);
  assert.deepEqual(env.session, {});
});

test('handoff opens the selected admin and survives login until input is acknowledged', async () => {
  const env = setup();
  await env.send({ type: 'capture-to-admin', origin });
  assert.equal(env.tabs[0].url, origin + '/music/youtube?cookieImport=1');
  assert.ok(!env.tabs[0].url.includes('secret'));
  const pending = await env.send({ type: 'pending-youtube-cookies' }, admin);
  assert.ok(pending.cookies.includes('secret'));
  assert.ok(env.session['pending-youtube-cookies']);
  await env.send({ type: 'ack-youtube-cookies', id: pending.id }, admin);
  assert.deepEqual(env.session, {});
});

test('handoff rejects other origins, iframe callers, other cookie stores, and expired captures', async () => {
  const env = setup();
  assert.equal(env.handler({ type: 'pending-youtube-cookies' }, { ...admin, url: 'https://evil.test' }, () => assert.fail()), undefined);
  assert.equal(env.handler({ type: 'pending-youtube-cookies' }, { ...admin, frameId: 1 }, () => assert.fail()), undefined);
  assert.match((await env.send({ type: 'capture-to-admin', origin: 'https://evil.test' })).error, /不支持/);
  await env.send({ type: 'capture-to-admin', origin });
  assert.match((await env.send({ type: 'pending-youtube-cookies' }, { ...admin, tab: { id: 9 } })).error, /同一浏览器/);
  env.session['pending-youtube-cookies'].expiresAt = 0;
  assert.match((await env.send({ type: 'pending-youtube-cookies' }, admin)).error, /过期/);
  assert.deepEqual(env.session, {});
});

test('empty export describes permission troubleshooting rather than falsely claiming logout', async () => {
  const result = await setup([]).send({ type: 'export-youtube-cookies' });
  assert.match(result.error, /这不代表你未登录/);
});

test('auto-paste updates the visible textarea without leaking cookies in window messages or submitting them', async () => {
  let listener;
  const messages = [], runtimeRequests = [], events = [];
  class TextArea {
    set value(value) { this.text = value; }
    get value() { return this.text; }
    dispatchEvent(event) { events.push(event.type); }
  }
  const input = new TextArea();
  const location = { origin };
  const window = { addEventListener(_, fn) { listener = fn; }, postMessage(payload) { messages.push(payload); } };
  vm.runInNewContext(content, { window, location, HTMLTextAreaElement: TextArea, Event,
    document: { getElementById: () => input },
    chrome: { runtime: { async sendMessage(message) {
      runtimeRequests.push(message.type);
      return message.type === 'pending-youtube-cookies' ? { cookies: 'sensitive-cookie', id: 'capture' } : { ok: true };
    } } },
    fetch() { assert.fail('Pasting must not submit cookies or require admin login'); },
  });
  await listener({ source: window, origin: 'https://evil.test', data: { source: 'johnny-music-admin', action: 'paste', id: 'bad' } });
  assert.equal(runtimeRequests.length, 0);
  await listener({ source: window, origin, data: { source: 'johnny-music-admin', action: 'paste', id: 'good' } });
  assert.equal(input.value, 'sensitive-cookie');
  assert.deepEqual(events, ['input', 'change']);
  assert.deepEqual(runtimeRequests, ['pending-youtube-cookies', 'ack-youtube-cookies']);
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ source: 'johnny-cookie-extension', id: 'good', ok: true }]);
});
