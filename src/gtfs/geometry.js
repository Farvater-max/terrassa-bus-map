import { openZip } from './csv.js';

export function readShapes(raw) {
  const byId = new Map();
  for (const row of openZip(raw)('shapes')) {
    if (!byId.has(row.shape_id)) byId.set(row.shape_id, []);
    byId.get(row.shape_id).push([
      +row.shape_pt_sequence,
      +row.shape_pt_lat,
      +row.shape_pt_lon,
    ]);
  }
  return [...byId.values()].map(points => points
    .sort((a, b) => a[0] - b[0])
    .map(([, lat, lon]) => [lat, lon]));
}

export function snapStopsToShape(stopCoordinates, shape, tolerance = 0.0004) {
  const indexes = [];
  let start = 0;
  let cost = 0;
  for (const [lat, lon] of stopCoordinates) {
    let bestDistance = null;
    let bestIndex = start;
    for (let i = start; i < shape.length; i++) {
      const distance = Math.hypot(shape[i][0] - lat, (shape[i][1] - lon) * 0.75);
      if (bestDistance === null || distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestDistance === null || bestDistance > tolerance) return null;
    indexes.push(bestIndex);
    start = bestIndex;
    cost += bestDistance;
  }
  return { indexes, cost };
}
