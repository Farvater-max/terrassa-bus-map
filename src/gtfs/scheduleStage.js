const STAGE_VERSION = 1;

function distanceMeters(from, to) {
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(to[0] - from[0]);
  const longitudeDelta = radians(to[1] - from[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from[0])) * Math.cos(radians(to[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(haversine));
}

export function validatePreparedFeeds(feeds, reports) {
  if (!Array.isArray(feeds) || !feeds.length) throw new Error('The prepared file contains no feeds.');
  if (!feeds.some(feed => feed.id === 'main')) throw new Error('The prepared file has no main schedule feed.');
  if (!Array.isArray(reports)) throw new Error('The prepared file has no routing reports.');
  if (reports.length !== feeds.length) throw new Error('The prepared file has a mismatched number of routing reports.');

  const feedIds = new Set();
  const reportIds = new Set();
  for (const report of reports) {
    if (!report.id || reportIds.has(report.id)) throw new Error('The prepared file has duplicate or missing routing report ids.');
    reportIds.add(report.id);
  }

  for (const feed of feeds) {
    if (!feed.id || feedIds.has(feed.id)) throw new Error(`Duplicate or missing feed id in prepared data: ${feed.id}.`);
    feedIds.add(feed.id);
    for (const key of ['routes', 'stops', 'pats', 'shapes', 'trips', 'cal', 'cd']) {
      if (!Array.isArray(feed[key])) throw new Error(`Feed ${feed.id} is missing its ${key} data.`);
    }
    if (!feed.pats.length || !feed.shapes.length) throw new Error(`Feed ${feed.id} has no route patterns or shapes.`);

    const report = reports.find(item => item.id === feed.id);
    const sequenceKeys = new Set(feed.pats.map(pattern => pattern?.[0]?.join(',')));
    const counters = ['routed', 'failed', 'fallbackSequences', 'fallbackFromGtfs', 'fallbackFromStops', 'skipped', 'uniqueSequences'];
    if (!report || !Array.isArray(report.fallbackFromGtfsKeys)
      || sequenceKeys.has(undefined)
      || counters.some(key => !Number.isInteger(report[key]) || report[key] < 0)
      || report.skipped !== 0 || !Number.isInteger(report.uniqueSequences)
      || report.uniqueSequences !== sequenceKeys.size
      || report.routed + report.fallbackSequences !== report.uniqueSequences
      || report.failed !== report.fallbackSequences
      || report.fallbackFromGtfs + report.fallbackFromStops !== report.fallbackSequences
      || report.fallbackFromGtfsKeys.length !== report.fallbackFromGtfs
      || new Set(report.fallbackFromGtfsKeys).size !== report.fallbackFromGtfsKeys.length
      || report.fallbackFromGtfsKeys.some(key => !sequenceKeys.has(key))) {
      throw new Error(`Feed ${feed.id} does not have complete routed or fallback coverage.`);
    }
    const originalShapeFallbacks = new Set(report.fallbackFromGtfsKeys);

    for (const [patternIndex, pattern] of feed.pats.entries()) {
      const [sequence, , shapeIndex, stopShapeIndexes] = pattern;
      if (!Array.isArray(sequence) || sequence.length < 2) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has an invalid stop sequence.`);
      }
      if (!Number.isInteger(shapeIndex) || !feed.shapes[shapeIndex]) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has no route shape.`);
      }
      const shape = feed.shapes[shapeIndex];
      if (!Array.isArray(shape) || shape.length < 2) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has an empty shape.`);
      }
      if (!Array.isArray(stopShapeIndexes) || stopShapeIndexes.length !== sequence.length) {
        throw new Error(`Feed ${feed.id} pattern ${patternIndex} has invalid stop-to-shape indexes.`);
      }

      for (const point of shape) {
        if (!Array.isArray(point) || point.length < 2
          || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || point[0] < -90 || point[0] > 90 || point[1] < -180 || point[1] > 180) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} contains invalid route coordinates.`);
        }
      }

      const isOriginalShapeFallback = originalShapeFallbacks.has(sequence.join(','));
      const maxAnchorDistanceMeters = isOriginalShapeFallback ? 60 : 2.5;
      let previousShapePointIndex = -1;
      for (let stopIndex = 0; stopIndex < sequence.length; stopIndex++) {
        const stop = feed.stops[sequence[stopIndex]];
        const shapePointIndex = stopShapeIndexes[stopIndex];
        if (!stop || !Number.isInteger(shapePointIndex) || !shape[shapePointIndex]
          || shapePointIndex < previousShapePointIndex) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} references a missing stop or shape point.`);
        }
        if (!Number.isFinite(stop[1]) || !Number.isFinite(stop[2])
          || stop[1] < -90 || stop[1] > 90 || stop[2] < -180 || stop[2] > 180) {
          throw new Error(`Feed ${feed.id} stop "${stop[0]}" has invalid coordinates.`);
        }
        previousShapePointIndex = shapePointIndex;
        const point = shape[shapePointIndex];
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || distanceMeters([stop[1], stop[2]], point) > maxAnchorDistanceMeters) {
          throw new Error(`Feed ${feed.id} pattern ${patternIndex} does not anchor stop "${stop[0]}" to its shape.`);
        }
      }

    }
  }
}

export function validatePreparedStage(stage, expectedRunId) {
  if (stage?.formatVersion !== STAGE_VERSION) throw new Error('Unsupported prepared schedules file version.');
  if (!stage.runId || stage.runId !== expectedRunId) {
    throw new Error(`Prepared schedules run id mismatch (expected ${expectedRunId}, found ${stage.runId || 'none'}).`);
  }
  if (!Number.isFinite(Date.parse(stage.preparedAt))) throw new Error('Prepared schedules file has no valid preparation time.');
  if (stage.router !== 'osm-bus-dijkstra') throw new Error('Prepared schedules file has an unknown route engine.');
  validatePreparedFeeds(stage.feeds, stage.reports);
  return stage;
}
