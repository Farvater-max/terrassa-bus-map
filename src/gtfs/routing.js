function sameCoordinate(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

function distanceMeters(a, b) {
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(b[0] - a[0]);
  const longitudeDelta = radians(b[1] - a[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(haversine));
}

function validateRoutedShape(feed, sequence, coordinates, stopShapeIndexes) {
  if (coordinates.length < sequence.length || stopShapeIndexes.length !== sequence.length) {
    throw new Error('OSM router returned an incomplete path for the stop sequence.');
  }
  let previousIndex = -1;
  for (let index = 0; index < coordinates.length; index++) {
    const point = coordinates[index];
    if (!Array.isArray(point) || point.length < 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
      || point[0] < -90 || point[0] > 90 || point[1] < -180 || point[1] > 180) {
      throw new Error('OSM router returned invalid route coordinates.');
    }
  }
  for (let index = 0; index < sequence.length; index++) {
    const pointIndex = stopShapeIndexes[index];
    if (!Number.isInteger(pointIndex) || !coordinates[pointIndex] || pointIndex < previousIndex) {
      throw new Error('OSM router returned invalid stop-to-shape indexes.');
    }
    previousIndex = pointIndex;
    const stop = feed.stops[sequence[index]];
    if (distanceMeters([Number(stop[1]), Number(stop[2])], coordinates[pointIndex]) > 2.5) {
      throw new Error(`OSM router did not anchor stop "${stop[0]}" to the route.`);
    }
  }
}

function validExistingShape(feed, sequence, patterns) {
  for (const pattern of patterns) {
    const shapeIndex = pattern[2];
    const shape = Number.isInteger(shapeIndex) ? feed.shapes[shapeIndex] : null;
    const indexes = pattern[3];
    if (!Array.isArray(shape) || shape.length < 2
      || !Array.isArray(indexes) || indexes.length !== sequence.length) continue;
    if (!shape.every(point => Array.isArray(point) && point.length >= 2
      && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -90 && point[0] <= 90 && point[1] >= -180 && point[1] <= 180)) continue;
    let previousIndex = -1;
    const valid = indexes.every((index, stopIndex) => {
      if (!Number.isInteger(index) || index < previousIndex || !Array.isArray(shape[index])
        || !Number.isFinite(shape[index][0]) || !Number.isFinite(shape[index][1])
        || shape[index][0] < -90 || shape[index][0] > 90
        || shape[index][1] < -180 || shape[index][1] > 180) return false;
      const stop = feed.stops[sequence[stopIndex]];
      if (!stop || !Number.isFinite(Number(stop[1])) || !Number.isFinite(Number(stop[2]))) return false;
      if (distanceMeters([Number(stop[1]), Number(stop[2])], shape[index]) > 60) return false;
      previousIndex = index;
      return true;
    });
    if (valid) {
      return { shapeIndex, stopShapeIndexes: indexes };
    }
  }
  return null;
}

function makeStopSequenceShape(feed, sequence) {
  const coordinates = sequence.map(stopIndex => {
    const stop = feed.stops[stopIndex];
    return [Number(stop[1]), Number(stop[2])];
  });
  const shapeIndex = feed.shapes.push(coordinates) - 1;
  return { shapeIndex, stopShapeIndexes: coordinates.map((_, index) => index) };
}

export function routeFeedGeometry(feed, {
  router,
  maxSequences = Infinity,
  log = console,
} = {}) {
  const sequences = new Map();
  const patternsBySequence = new Map();
  for (const pattern of feed.pats) {
    const key = pattern[0].join(',');
    if (!sequences.has(key)) sequences.set(key, pattern[0]);
    if (!patternsBySequence.has(key)) patternsBySequence.set(key, []);
    patternsBySequence.get(key).push(pattern);
  }

  const uniqueSequences = [...sequences.entries()];
  const selectedSequences = uniqueSequences.slice(0, maxSequences);
  const shapeBySequence = new Map();
  const legCache = new Map();
  let routed = 0;
  let failed = 0;
  let routedLegs = 0;
  let fallbackFromGtfs = 0;
  let fallbackFromStops = 0;
  const fallbackFromGtfsKeys = [];

  for (const [sequenceIndex, [key, sequence]] of selectedSequences.entries()) {
    try {
      if (!router?.routeLeg) throw new Error('OSM router is unavailable.');
      const coordinates = [];
      const stopShapeIndexes = [0];
      for (let index = 1; index < sequence.length; index++) {
        const fromIndex = sequence[index - 1];
        const toIndex = sequence[index];
        const legKey = `${fromIndex}>${toIndex}`;
        let legCoordinates = legCache.get(legKey);
        if (!legCoordinates) {
          legCoordinates = router.routeLeg(feed.stops[fromIndex], feed.stops[toIndex]);
          legCache.set(legKey, legCoordinates);
          routedLegs++;
        }
        const start = coordinates.at(-1);
        const skipFirst = start && sameCoordinate(start, legCoordinates[0]);
        coordinates.push(...legCoordinates.slice(skipFirst ? 1 : 0));
        stopShapeIndexes.push(coordinates.length - 1);
      }

      validateRoutedShape(feed, sequence, coordinates, stopShapeIndexes);
      const shapeIndex = feed.shapes.length;
      feed.shapes.push(coordinates);
      shapeBySequence.set(key, { shapeIndex, stopShapeIndexes });
      routed++;
    } catch (error) {
      failed++;
      const existingShape = validExistingShape(feed, sequence, patternsBySequence.get(key));
      if (existingShape) {
        shapeBySequence.set(key, existingShape);
        fallbackFromGtfs++;
        fallbackFromGtfsKeys.push(key);
        log.warn(`  OSM could not route ${feed.id} stop sequence ${sequenceIndex + 1}/${uniqueSequences.length}; keeping its GTFS shape: ${error.message}`);
      } else {
        shapeBySequence.set(key, makeStopSequenceShape(feed, sequence));
        fallbackFromStops++;
        log.warn(`  OSM could not route ${feed.id} stop sequence ${sequenceIndex + 1}/${uniqueSequences.length}; keeping its stop path: ${error.message}`);
      }
    }
  }

  for (const pattern of feed.pats) {
    const routedShape = shapeBySequence.get(pattern[0].join(','));
    if (!routedShape) continue;
    pattern[2] = routedShape.shapeIndex;
    pattern[3] = routedShape.stopShapeIndexes;
  }

  const report = {
    patterns: feed.pats.length,
    uniqueSequences: uniqueSequences.length,
    routed,
    failed,
    fallbackSequences: fallbackFromGtfs + fallbackFromStops,
    fallbackFromGtfs,
    fallbackFromStops,
    fallbackFromGtfsKeys,
    skipped: uniqueSequences.length - selectedSequences.length,
    routedLegs,
    engine: 'osm-bus-dijkstra',
    graph: router?.stats || null,
  };
  log.log(`  ${feed.id}: OSM routed ${routed}/${selectedSequences.length} sequences; preserved ${report.fallbackSequences} fallback routes (${routedLegs} unique legs; ${report.skipped} skipped).`);
  return report;
}
