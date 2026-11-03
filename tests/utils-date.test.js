import test from 'node:test';
import assert from 'node:assert/strict';
import { toISODate } from '../src/utils/date.js';

test('toISODate converts a GTFS date to ISO format', () => {
  assert.equal(toISODate('20261102'), '2026-11-02');
});

test('toISODate returns null for a missing date', () => {
  assert.equal(toISODate(''), null);
  assert.equal(toISODate(null), null);
  assert.equal(toISODate(undefined), null);
});
