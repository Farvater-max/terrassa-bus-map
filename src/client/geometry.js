export const longitudeToX = longitude => (longitude + 180) / 360;

export function latitudeToY(latitude) {
  const sine = Math.sin(latitude * Math.PI / 180);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}

export function pointToLongitudeLatitude(x, y) {
  return [x * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)))];
}

export function formatTime(seconds) {
  seconds = Math.floor(seconds) % 86400;
  return [seconds / 3600 | 0, seconds / 60 % 60 | 0, seconds % 60 | 0]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

export function readableRouteColor(color) {
  const value = Number.parseInt(color.slice(1), 16);
  const red = value >> 16;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  if (brightness >= 90) return color;

  return `#${[red, green, blue]
    .map(channel => Math.round(channel + (255 - channel) * 0.6).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function distanceAlongShape(shape, distance) {
  const { cumulativeDistances, points } = shape;
  let low = 0;
  let high = cumulativeDistances.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    cumulativeDistances[middle] <= distance ? low = middle : high = middle;
  }

  const startDistance = cumulativeDistances[low];
  const segmentDistance = cumulativeDistances[high] - startDistance || 1;
  const fraction = Math.min(1, Math.max(0, (distance - startDistance) / segmentDistance));
  const start = points[low];
  const end = points[high];
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
  ];
}

export function busPosition(trip, time, stops, shapes) {
  const pattern = trip.pattern;
  const { stopIndexes, times, shapeIndex, shapeIndexes } = pattern;
  const relativeTime = time - trip.startTime;
  if (relativeTime < 0 || relativeTime > times.at(-1)) return null;

  const shape = shapeIndex === null ? null : shapes[shapeIndex];
  for (let index = 0; index < stopIndexes.length - 1; index++) {
    if (relativeTime >= times[index + 1]) continue;
    const interval = times[index + 1] - times[index] || 1;
    const fraction = (relativeTime - times[index]) / interval;
    if (shape) {
      const start = shape.cumulativeDistances[shapeIndexes[index]];
      const end = shape.cumulativeDistances[shapeIndexes[index + 1]];
      return distanceAlongShape(shape, start + (end - start) * fraction);
    }

    const start = stops[stopIndexes[index]];
    const end = stops[stopIndexes[index + 1]];
    return [
      start.x + (end.x - start.x) * fraction,
      start.y + (end.y - start.y) * fraction,
    ];
  }

  const lastStop = stops[stopIndexes.at(-1)];
  return [lastStop.x, lastStop.y];
}

export function tripPath(trip, stops, shapes) {
  const { stopIndexes, shapeIndex, shapeIndexes } = trip.pattern;
  if (shapeIndex === null) return stopIndexes.map(index => stops[index]);

  return shapes[shapeIndex].points
    .slice(shapeIndexes[0], shapeIndexes.at(-1) + 1)
    .map(([x, y]) => ({ x, y }));
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
