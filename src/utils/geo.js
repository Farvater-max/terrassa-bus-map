const EARTH_RADIUS_METERS = 6_371_000;
const COORDINATE_TOLERANCE = 1e-7;

const radians = degrees => degrees * Math.PI / 180;

/**
 * Returns the great-circle distance between [latitude, longitude] points.
 */
export function distanceMeters(from, to) {
  const latitudeDelta = radians(to[0] - from[0]);
  const longitudeDelta = radians(to[1] - from[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from[0])) * Math.cos(radians(to[0]))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

/**
 * Compares [latitude, longitude] points within a small coordinate tolerance.
 */
export function sameCoordinate(a, b, tolerance = COORDINATE_TOLERANCE) {
  return Math.abs(a[0] - b[0]) < tolerance
    && Math.abs(a[1] - b[1]) < tolerance;
}
