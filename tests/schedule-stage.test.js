import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFeedGeometry } from '../src/gtfs/routing.js';
import { validatePreparedFeeds, validatePreparedStage } from '../src/gtfs/scheduleStage.js';

function preparedFixture() {
  const feed = {
    id: 'main', routes: [], stops: [['A', 41, 2], ['B', 41, 2.001]],
    pats: [[[0, 1], 0, -1, []]], shapes: [], trips: [], cal: [], cd: [],
  };
  const report = { id: feed.id, ...routeFeedGeometry(feed, { router: null, log: { log() {}, warn() {} } }) };
  return { feed, report };
}

test('prepared stage accepts complete fallback coverage and matching run id', () => {
  const { feed, report } = preparedFixture();
  const stage = {
    formatVersion: 1, runId: 'run-1', preparedAt: new Date().toISOString(),
    router: 'osm-bus-dijkstra', feeds: [feed], reports: [report],
  };
  assert.equal(validatePreparedStage(stage, 'run-1'), stage);
});

test('prepared stage rejects missing route geometry and mismatched run id', () => {
  const { feed, report } = preparedFixture();
  const stage = {
    formatVersion: 1, runId: 'run-1', preparedAt: new Date().toISOString(),
    router: 'osm-bus-dijkstra', feeds: [feed], reports: [report],
  };
  feed.shapes = [];
  assert.throws(() => validatePreparedFeeds([feed], [report]), /no route patterns or shapes/);
  feed.shapes = [[[41, 2], [41, 2.001]]];
  assert.throws(() => validatePreparedStage(stage, 'different-run'), /run id mismatch/);
});

test('prepared stage rejects incomplete route coverage reports', () => {
  const { feed, report } = preparedFixture();
  report.uniqueSequences = 2;
  assert.throws(() => validatePreparedFeeds([feed], [report]), /complete routed or fallback coverage/);
});

test('prepared stage rejects invalid stop indexes, route points, and fallback counters', () => {
  const { feed, report } = preparedFixture();
  feed.pats[0][3][1] = 100;
  assert.throws(() => validatePreparedFeeds([feed], [report]), /missing stop or shape point/);

  const fixture = preparedFixture();
  fixture.feed.shapes[0][0][0] = Number.NaN;
  assert.throws(() => validatePreparedFeeds([fixture.feed], [fixture.report]), /invalid route coordinates/);

  const anotherFixture = preparedFixture();
  anotherFixture.report.fallbackFromStops = -1;
  assert.throws(() => validatePreparedFeeds([anotherFixture.feed], [anotherFixture.report]), /complete routed or fallback coverage/);
});
