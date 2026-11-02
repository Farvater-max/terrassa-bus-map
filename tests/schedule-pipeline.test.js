import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSchedules, persistSchedules } from '../src/gtfs/schedulePipeline.js';
import { routeFeedGeometry } from '../src/gtfs/routing.js';
import { validatePreparedFeeds, validatePreparedStage } from '../src/gtfs/scheduleStage.js';

const fixedNow = new Date('2026-10-31T12:00:00.000Z');
const quietLog = { log() {}, warn() {} };
const makeFeed = (id = 'main') => ({
  id, label: id, routes: [], stops: [['A', 41, 2], ['B', 41, 2.001]],
  pats: [[[0, 1], 0, -1, []]], shapes: [], trips: [], cal: [['service', '1111111', '20260101', '20261231']], cd: [],
});

function memoryFileDependencies() {
  const files = new Map();
  return {
    files,
    mkdir: async () => {},
    writeFile: async (path, content) => files.set(path, content),
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    rm: async path => files.delete(path),
    readFile: async path => files.get(path),
  };
}

test('main GTFS download failure removes stale stage and stops preparation', async () => {
  const fileDeps = memoryFileDependencies();
  fileDeps.files.set('stage.json', 'stale');
  await assert.rejects(prepareSchedules({
    options: { main: 'main.zip', noSummer: true }, runId: 'run-1', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async () => { throw new Error('HTTP 503'); },
      log: quietLog,
    },
  }), /main GTFS archive is unavailable/);
  assert.equal(fileDeps.files.has('stage.json'), false);
});

test('OSM graph failure with no source shapes aborts preparation without writing a stage', async () => {
  const fileDeps = memoryFileDependencies();
  await assert.rejects(prepareSchedules({
    options: { main: 'main.zip', summer: 'summer.zip' }, runId: 'run-2', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async source => {
        if (source === 'summer.zip') throw new Error('summer unavailable');
        return new Uint8Array([1]);
      },
      readShapes: () => [],
      transformGtfs: (_archive, id) => makeFeed(id),
      createOsmBusRouterForFeeds: async () => { throw new Error('Overpass unavailable'); },
      routeFeedGeometry,
      validatePreparedFeeds,
      now: () => fixedNow,
      log: quietLog,
    },
  }), /no OSM-routed sequences.*without source GTFS shapes/);
  assert.equal(fileDeps.files.has('stage.json'), false);
});

test('summer download failure does not prevent a successfully routed main feed from staging', async () => {
  const fileDeps = memoryFileDependencies();
  const stage = await prepareSchedules({
    options: { main: 'main.zip', summer: 'summer.zip' }, runId: 'run-2b', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async source => {
        if (source === 'summer.zip') throw new Error('summer unavailable');
        return new Uint8Array([1]);
      },
      readShapes: () => [],
      transformGtfs: (_archive, id) => makeFeed(id),
      createOsmBusRouterForFeeds: async () => ({ routeLeg: () => [[41, 2], [41, 2.001]], stats: {} }),
      routeFeedGeometry,
      validatePreparedFeeds,
      now: () => fixedNow,
      log: quietLog,
    },
  });
  assert.deepEqual(stage.feeds.map(feed => feed.id), ['main']);
  assert.equal(stage.reports[0].routed, 1);
  assert.ok(fileDeps.files.has('stage.json'));
  assert.equal(JSON.parse(fileDeps.files.get('stage.json')).runId, 'run-2b');
});

test('summer transform failure leaves summer out of the stage while preserving main', async () => {
  const fileDeps = memoryFileDependencies();
  const stage = await prepareSchedules({
    options: { main: 'main.zip', summer: 'summer.zip' }, runId: 'run-3', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async () => new Uint8Array([1]),
      readShapes: () => [],
      transformGtfs: (_archive, id) => {
        if (id === 'summer') throw new Error('invalid summer feed');
        return makeFeed(id);
      },
      createOsmBusRouterForFeeds: async () => ({ routeLeg: () => [[41, 2], [41, 2.001]], stats: {} }),
      routeFeedGeometry,
      validatePreparedFeeds,
      now: () => fixedNow,
      log: quietLog,
    },
  });
  assert.deepEqual(stage.feeds.map(feed => feed.id), ['main']);
});

test('expired main GTFS feed is rejected before OSM routing or stage creation', async () => {
  const fileDeps = memoryFileDependencies();
  await assert.rejects(prepareSchedules({
    options: { main: 'main.zip', noSummer: true }, runId: 'run-expired', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async () => new Uint8Array([1]),
      readShapes: () => [],
      transformGtfs: () => ({
        ...makeFeed(), cal: [['service', '1111111', '20250101', '20260511']],
      }),
      createOsmBusRouterForFeeds: async () => { throw new Error('must not be called'); },
      now: () => fixedNow,
      log: quietLog,
    },
  }), /main archive has expired.*ALLOW_EXPIRED_MAIN=true/);
  assert.equal(fileDeps.files.has('stage.json'), false);
});

test('explicit approval allows routing and staging the current expired main archive', async () => {
  const fileDeps = memoryFileDependencies();
  const stage = await prepareSchedules({
    options: { main: 'main.zip', noSummer: true, allowExpiredMain: true },
    runId: 'run-expired-approved', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async () => new Uint8Array([1]),
      readShapes: () => [],
      transformGtfs: () => ({ ...makeFeed(), cal: [['service', '1111111', '20250101', '20260511']] }),
      createOsmBusRouterForFeeds: async () => ({ routeLeg: () => [[41, 2], [41, 2.001]], stats: {} }),
      routeFeedGeometry,
      validatePreparedFeeds,
      now: () => fixedNow,
      log: quietLog,
    },
  });
  assert.equal(stage.feeds[0].cal[0][3], '20260511');
  assert.equal(stage.reports[0].routed, 1);
  assert.ok(fileDeps.files.has('stage.json'));
});

test('main GTFS feed without a calendar end date is rejected', async () => {
  const fileDeps = memoryFileDependencies();
  await assert.rejects(prepareSchedules({
    options: { main: 'main.zip', noSummer: true }, runId: 'run-unknown-validity', stagePath: 'stage.json',
    dependencies: {
      ...fileDeps,
      fetchGtfs: async () => new Uint8Array([1]),
      readShapes: () => [],
      transformGtfs: () => ({ ...makeFeed(), cal: [] }),
      createOsmBusRouterForFeeds: async () => { throw new Error('must not be called'); },
      now: () => fixedNow,
      log: quietLog,
    },
  }), /main archive has no calendar end date/);
  assert.equal(fileDeps.files.has('stage.json'), false);
});

test('persistSchedules validates stage before making a database request', async () => {
  let upsertCalled = false;
  const invalidStage = JSON.stringify({ formatVersion: 1, runId: 'other' });
  await assert.rejects(persistSchedules({
    stagePath: 'stage.json', runId: 'expected',
    dependencies: {
      readFile: async () => invalidStage,
      validatePreparedStage,
      upsertFeeds: async () => { upsertCalled = true; },
      log: quietLog,
    },
  }), /run id mismatch/);
  assert.equal(upsertCalled, false);
});
