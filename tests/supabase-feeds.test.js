import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertFeeds } from '../src/storage/supabaseFeeds.js';

const feed = { id: 'main', label: 'Main', cal: [], routes: [], stops: [], pats: [], shapes: [], trips: [] };

test('upsertFeeds rejects missing configuration and empty batches', async () => {
  await assert.rejects(upsertFeeds([feed], { url: '', serviceKey: 'key' }), /SUPABASE_URL/);
  await assert.rejects(upsertFeeds([], { url: 'https://db.example', serviceKey: 'key' }), /no feeds/);
});

test('upsertFeeds reports transport and HTTP failures', async () => {
  await assert.rejects(
    upsertFeeds([feed], {
      url: 'https://db.example', serviceKey: 'key',
      fetchImpl: async () => { throw new Error('socket closed'); },
    }),
    error => /Could not reach Supabase/.test(error.message) && error.cause.message === 'socket closed',
  );
  await assert.rejects(
    upsertFeeds([feed], {
      url: 'https://db.example', serviceKey: 'key',
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'unavailable' }),
    }),
    /HTTP 503 unavailable/,
  );
});

test('upsertFeeds serializes the feed payload and accepts successful response', async () => {
  let request;
  await upsertFeeds([feed], {
    url: 'https://db.example/', serviceKey: 'secret', updatedAt: new Date('2026-01-01T00:00:00Z'),
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return { ok: true };
    },
  });
  assert.equal(request.url, 'https://db.example/rest/v1/feeds?on_conflict=id');
  assert.equal(request.options.method, 'POST');
  const [row] = JSON.parse(request.options.body);
  assert.equal(row.id, 'main');
  assert.equal(row.updated_at, '2026-01-01T00:00:00.000Z');
  assert.equal(row.content_hash.length, 64);
  assert.deepEqual(row.data, feed);
});
