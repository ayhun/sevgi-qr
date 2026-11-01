import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers, destinationOf, ownerOf } from '../api/src/core.js';

class Table {
  #items = new Map();
  key(p, r) { return `${p}|${r}`; }
  async getEntity(p, r) { const item = this.#items.get(this.key(p, r)); if (!item) throw Object.assign(new Error('missing'), { statusCode: 404 }); return { ...item }; }
  async createEntity(item) { const key = this.key(item.partitionKey, item.rowKey); if (this.#items.has(key)) throw Object.assign(new Error('exists'), { statusCode: 409 }); this.#items.set(key, { ...item, etag: '1' }); }
  async updateEntity(change, mode, options) {
    const key = this.key(change.partitionKey, change.rowKey), item = this.#items.get(key);
    if (!item) throw Object.assign(new Error('missing'), { statusCode: 404 });
    if (item.etag !== options.etag) throw Object.assign(new Error('conflict'), { statusCode: 412 });
    this.#items.set(key, { ...item, ...change, etag: String(Number(item.etag) + 1) });
  }
  async *listEntities({ queryOptions: { filter } }) {
    const partition = filter.match(/^PartitionKey eq '(.+)'$/)?.[1];
    for (const item of this.#items.values()) if (item.partitionKey === partition) yield { ...item };
  }
}
const identity = id => Buffer.from(JSON.stringify({ identityProvider: 'aad', userId: id, userRoles: ['authenticated'] })).toString('base64');
const request = (id, body) => ({ headers: new Headers({ 'x-ms-client-principal': identity(id), 'content-type': 'application/json' }), json: async () => body });
const unauthorized = () => ({ headers: new Headers(), json: async () => ({}) });

test('links belong to their Microsoft account; destination edits preserve the printed URL', async () => {
  const links = new Table(), scans = new Table();
  const handlers = createHandlers({ links, scans, random: () => 'a'.repeat(12), now: () => new Date('2026-11-01T12:00:00Z') });
  assert.equal((await handlers.create(unauthorized())).status, 401);
  const created = await handlers.create(request('alice', { title: 'Poster', destination: 'https://example.org/one' }));
  assert.equal(created.status, 201);
  const { id, shortUrl } = created.jsonBody.link;
  assert.match(shortUrl, /^\/r\/[a-f0-9]{16}\/[a-f0-9]{12}$/);
  assert.equal((await handlers.list(request('bob'))).jsonBody.links.length, 0);
  assert.equal((await handlers.update(request('bob', { destination: 'https://evil.example' }), id)).status, 404);
  const updated = await handlers.update(request('alice', { destination: 'https://example.org/two' }), id);
  assert.equal(updated.jsonBody.link.shortUrl, shortUrl);
  assert.equal(updated.jsonBody.link.destination, 'https://example.org/two');
  const [, , owner, slug] = shortUrl.split('/');
  const first = await handlers.redirect(owner, slug);
  assert.equal(first.status, 302); assert.equal(first.headers.Location, 'https://example.org/two');
  assert.equal((await handlers.stats(request('bob'), id)).status, 404);
  assert.deepEqual((await handlers.stats(request('alice'), id)).jsonBody.days, [{ date: '2026-11-01', scans: 1 }]);
  await handlers.update(request('alice', { active: false }), id);
  assert.equal((await handlers.redirect(owner, slug)).status, 410);
});
test('rejects unsafe destinations and malformed identity', async () => {
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.org', 'http://localhost', 'http://127.0.0.1']) assert.throws(() => destinationOf(url));
  const handlers = createHandlers({ links: new Table(), scans: new Table() });
  assert.equal((await handlers.list(unauthorized())).status, 401);
  assert.equal((await handlers.redirect('bad', 'bad')).status, 404);
  assert.equal(ownerOf('alice').length, 16);
});
