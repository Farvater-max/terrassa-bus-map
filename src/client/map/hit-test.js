export function pickNearest(hits, point, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const hit of hits) {
    const distance = Math.hypot(hit.x - point.x, hit.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hit;
    }
  }
  return best;
}

export function pickSelection(layers, point, coarse) {
  for (const layer of layers) {
    const radius = coarse ? layer.hitRadius.coarse : layer.hitRadius.fine;
    const hit = pickNearest(layer.hits(), point, radius);
    if (hit) return hit.selection;
  }
  return null;
}
