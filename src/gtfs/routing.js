function sameCoordinate(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

export function routeFeedGeometry(feed, {
  router,
  maxSequences = Infinity,
  log = console,
} = {}) {
  if (!router?.routeLeg) throw new Error('Build an OpenStreetMap bus router before routing GTFS feeds.');
  const sequences = new Map();
  for (const pattern of feed.pats) {
    const key = pattern[0].join(',');
    if (!sequences.has(key)) sequences.set(key, pattern[0]);
  }

  const uniqueSequences = [...sequences.entries()];
  const selectedSequences = uniqueSequences.slice(0, maxSequences);
  const shapeBySequence = new Map();
  const legCache = new Map();
  let routed = 0;
  let failed = 0;
  let routedLegs = 0;

  for (const [sequenceIndex, [key, sequence]] of selectedSequences.entries()) {
    try {
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

      if (coordinates.length < sequence.length || stopShapeIndexes.some(index => index >= coordinates.length)) {
        throw new Error('OSM router returned an incomplete path for the stop sequence.');
      }
      const shapeIndex = feed.shapes.length;
      feed.shapes.push(coordinates);
      shapeBySequence.set(key, { shapeIndex, stopShapeIndexes });
      routed++;
    } catch (error) {
      failed++;
      log.warn(`  OSM could not route ${feed.id} stop sequence ${sequenceIndex + 1}/${uniqueSequences.length}: ${error.message}`);
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
    skipped: uniqueSequences.length - selectedSequences.length,
    routedLegs,
    engine: 'osm-bus-dijkstra',
    graph: router.stats,
  };
  log.log(`  ${feed.id}: OSM bus routing completed for ${routed}/${selectedSequences.length} sequences (${routedLegs} unique legs; ${report.skipped} skipped).`);
  return report;
}
