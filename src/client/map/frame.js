import { pointToLongitudeLatitude } from '../geometry.js';

export function createFrame({ map, canvas, state, style }) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  return {
    state,
    style,
    dark: style === 'dark-gray',
    zoom: map.getZoom(),
    width,
    height,

    project(x, y) {
      const point = map.project(pointToLongitudeLatitude(x, y));
      return { x: point.x, y: point.y };
    },

    projectLonLat(lon, lat) {
      const point = map.project([lon, lat]);
      return { x: point.x, y: point.y };
    },
    isVisible({ x, y }, margin = 0) {
      return x >= -margin && y >= -margin && x <= width + margin && y <= height + margin;
    },
  };
}
