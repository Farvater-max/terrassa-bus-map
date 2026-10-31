import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGtfs, GtfsSourceError } from '../src/gtfs/source.js';

test('fetchGtfs reports HTTP failures with status and source', async () => {
  await assert.rejects(
    fetchGtfs('https://example.test/feed.zip', {
      fetchImpl: async () => ({ ok: false, status: 503, headers: new Headers({ server: 'test' }) }),
    }),
    error => error instanceof GtfsSourceError && error.status === 503 && error.source.includes('example.test'),
  );
});

test('fetchGtfs wraps network errors', async () => {
  await assert.rejects(
    fetchGtfs('https://example.test/feed.zip', { fetchImpl: async () => { throw new Error('offline'); } }),
    error => error instanceof GtfsSourceError && /request failed/.test(error.message) && error.cause.message === 'offline',
  );
});

test('fetchGtfs rejects an empty response', async () => {
  await assert.rejects(
    fetchGtfs('https://example.test/feed.zip', {
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
    }),
    /empty file/,
  );
});

test('fetchGtfs wraps failures while reading the response body', async () => {
  await assert.rejects(
    fetchGtfs('https://example.test/feed.zip', {
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => { throw new Error('connection reset'); } }),
    }),
    error => error instanceof GtfsSourceError && /response body/.test(error.message)
      && error.cause.message === 'connection reset',
  );
});

test('fetchGtfs wraps local file read failures and accepts bytes', async () => {
  await assert.rejects(
    fetchGtfs('./missing.zip', { readFileImpl: async () => { throw new Error('not found'); } }),
    error => error instanceof GtfsSourceError && /Could not read GTFS file/.test(error.message),
  );
  const bytes = await fetchGtfs('./feed.zip', { readFileImpl: async () => Buffer.from([1, 2, 3]) });
  assert.deepEqual([...bytes], [1, 2, 3]);
});
