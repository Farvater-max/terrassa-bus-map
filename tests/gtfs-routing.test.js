import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFeedGeometry } from '../src/gtfs/routing.js';
import { createOsmBusRouter } from '../src/gtfs/osmBusRouter.js';

const quietLog = { log() {}, warn() {} };
const makeFeed = (withShape = false) => ({
  id: 'main',
  stops: [['A', 41, 2], ['B', 41, 2.001]],
  pats: [[[0, 1], 0, withShape ? 0 : -1, withShape ? [0, 1] : []]],
  shapes: withShape ? [[[41, 2], [41, 2.001]]] : [],
});

test('routeFeedGeometry assigns a routed shape and stop anchors', () => {
  const feed = makeFeed();
  const report = routeFeedGeometry(feed, {
    router: { routeLeg: () => [[41, 2], [41, 2.0005], [41, 2.001]], stats: { nodes: 2 } },
    log: quietLog,
  });
  assert.equal(report.routed, 1);
  assert.equal(report.fallbackSequences, 0);
  assert.deepEqual(feed.pats[0][3], [0, 2]);
  assert.equal(feed.shapes[feed.pats[0][2]].length, 3);
});

test('routeFeedGeometry keeps the existing GTFS shape when routing fails', () => {
  const feed = makeFeed(true);
  const original = feed.shapes[0];
  const report = routeFeedGeometry(feed, { router: null, log: quietLog });
  assert.equal(feed.pats[0][2], 0);
  assert.equal(feed.shapes[0], original);
  assert.equal(report.fallbackFromGtfs, 1);
  assert.deepEqual(report.fallbackFromGtfsKeys, ['0,1']);
});

test('routeFeedGeometry retains route as stop path when no GTFS shape exists', () => {
  const feed = makeFeed();
  const report = routeFeedGeometry(feed, { router: null, log: quietLog });
  assert.equal(report.fallbackFromStops, 1);
  assert.deepEqual(feed.shapes[feed.pats[0][2]], [[41, 2], [41, 2.001]]);
  assert.deepEqual(feed.pats[0][3], [0, 1]);
});

test('one failed sequence falls back without discarding successfully routed sequences', () => {
  const feed = {
    id: 'main', stops: [['A', 41, 2], ['B', 41, 2.001], ['C', 41, 2.002]],
    pats: [
      [[0, 1], 0, -1, []],
      [[1, 2], 0, 0, [0, 1]],
    ],
    shapes: [[[41, 2.001], [41, 2.002]]],
  };
  const report = routeFeedGeometry(feed, {
    router: { routeLeg: (from, to) => {
      if (from[0] === 'B') throw new Error('unroutable segment');
      return [[41, 2], [41, 2.001]];
    } },
    log: quietLog,
  });
  assert.equal(report.routed, 1);
  assert.equal(report.fallbackSequences, 1);
  assert.equal(report.failed, 1);
  assert.deepEqual(feed.pats.map(pattern => pattern[2]), [1, 0]);
});

test('invalid existing GTFS shape falls back to stop coordinates', () => {
  const feed = makeFeed(true);
  feed.shapes[0] = [[40, 1], [40, 1.001]];
  const report = routeFeedGeometry(feed, { router: null, log: quietLog });
  assert.equal(report.fallbackFromGtfs, 0);
  assert.equal(report.fallbackFromStops, 1);
  assert.deepEqual(feed.shapes.at(-1), [[41, 2], [41, 2.001]]);
});

test('OSM bus access overrides access=no when psv=yes and respects one-way direction', () => {
  const data = { elements: [
    { type: 'node', id: 1, lat: 41, lon: 2 },
    { type: 'node', id: 2, lat: 41, lon: 2.001 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', access: 'no', psv: 'yes', oneway: 'yes' } },
  ] };
  const router = createOsmBusRouter(data);
  const stopA = ['A', 41, 2];
  const stopB = ['B', 41, 2.001];
  assert.ok(router.routeLeg(stopA, stopB).length >= 2);
  assert.throws(() => router.routeLeg(stopB, stopA), /No directed OSM bus route/);
});

test('OSM router rejects a road closed to buses', () => {
  const data = { elements: [
    { type: 'node', id: 1, lat: 41, lon: 2 },
    { type: 'node', id: 2, lat: 41, lon: 2.001 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', access: 'no' } },
  ] };
  assert.throws(() => createOsmBusRouter(data).routeLeg(['A', 41, 2], ['B', 41, 2.001]), /No bus-accessible OSM road/);
});

test('OSM data download errors are contextual and preserve their cause', async () => {
  const { fetchOsmRoadData } = await import('../src/gtfs/osmBusRouter.js');
  await assert.rejects(
    fetchOsmRoadData([{ stops: [['A', 41, 2]] }], {
      endpoint: 'https://overpass.example/api',
      fetchImpl: async () => { throw new Error('network offline'); },
    }),
    error => /Overpass request failed/.test(error.message) && error.cause.message === 'network offline',
  );
  await assert.rejects(
    fetchOsmRoadData([{ stops: [['A', 41, 2]] }], {
      endpoint: 'https://overpass.example/api',
      fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
    }),
    /Could not parse the OpenStreetMap road extract/,
  );
});
