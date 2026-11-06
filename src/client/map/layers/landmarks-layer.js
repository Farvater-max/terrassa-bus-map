import { LANDMARKS } from '../../landmarks.js';

/** Слой достопримечательностей. Хитов не отдаёт (клики по ним не обрабатываются). */
export function createLandmarksLayer(images) {
  return {
    draw(ctx, frame) {
      const { zoom, style } = frame;
      if (zoom < 13) return;
      const baseSize = 36 + 22 * Math.min(1, Math.max(0, (zoom - 13) / 2));

      for (const landmark of LANDMARKS) {
        const image = images.get(landmark, style);
        if (!image) continue;
        const size = baseSize * (landmark.scale ?? 1);
        const point = frame.projectLonLat(landmark.lon, landmark.lat);
        if (!frame.isVisible(point, size)) continue;
        ctx.drawImage(image, point.x - size / 2, point.y - size * 0.86, size, size);
      }
    },
  };
}
