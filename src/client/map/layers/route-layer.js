import { tripPath } from '../../geometry.js';
import { buildArrows, drawArrows } from '../arrows.js';

function strokePath(ctx, points, width, color, alpha = 1) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Слой выбранного маршрута: линия, стрелки направления, остановки с подписями. */
export function createRouteLayer() {
  let hits = [];
  // Кэш стрелок нужен только этому слою. Ключ — сам объект рейса:
  // при смене расписания рейсы пересоздаются, и кэш инвалидируется сам.
  let arrowCache = { trip: null, arrows: [] };

  function drawLine(ctx, frame, trip, route) {
    const { state, zoom, dark } = frame;
    const path = tripPath(trip, state.stops, state.shapes);
    if (!path.length) return;

    const lineWidth = Math.max(3, Math.min(8, (zoom - 10) * 1.1));
    const projected = path.map(point => frame.project(point.x, point.y));
    strokePath(ctx, projected, lineWidth + 3, dark ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.95)');
    strokePath(ctx, projected, lineWidth, route.lineColor, 0.95);

    if (arrowCache.trip !== trip) {
      arrowCache = { trip, arrows: buildArrows(path, trip) };
    }
    if (zoom >= 12.5) drawArrows(ctx, frame, arrowCache.arrows);
  }

  function drawStops(ctx, frame, trip, route) {
    const { state, zoom, dark } = frame;
    const radiusBase = zoom < 13 ? 3 : zoom < 15 ? 4.5 : 6;
    const { stopIndexes } = trip.pattern;
    const lastIndex = stopIndexes.length - 1;
    const labelRects = [];

    ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    stopIndexes.forEach((stopIndex, order) => {
      const stop = state.stops[stopIndex];
      const point = frame.project(stop.x, stop.y);
      if (!frame.isVisible(point, 12)) return;
      const { x, y } = point;
      hits.push({ x, y, selection: { trip: null, stopIndex } });

      const selected = state.selectedStop === stopIndex;
      const terminal = order === 0 || order === lastIndex;
      const radius = (selected ? 1.4 : terminal ? 1.25 : 1) * radiusBase;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = terminal ? '#fff' : route.color;
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = selected ? '#ffd166' : terminal ? route.color : '#fff';
      ctx.stroke();

      if (!(terminal || selected || zoom >= 14.5)) return;
      const rect = { x: x + 9, y: y - 8, w: ctx.measureText(stop.name).width, h: 16 };
      const overlaps = labelRects.some(other => (
        rect.x < other.x + other.w && rect.x + rect.w > other.x
        && rect.y < other.y + other.h && rect.y + rect.h > other.y
      ));
      if (overlaps && !selected && !terminal) return;
      labelRects.push(rect);

      ctx.lineWidth = 3;
      ctx.strokeStyle = dark ? 'rgba(20,24,26,.9)' : 'rgba(255,255,255,.95)';
      ctx.strokeText(stop.name, rect.x, y);
      ctx.fillStyle = dark ? '#f1f4f2' : '#222';
      ctx.fillText(stop.name, rect.x, y);
    });
    ctx.textBaseline = 'alphabetic';
  }

  return {
    hitRadius: { fine: 15, coarse: 24 },
    hits: () => hits,

    draw(ctx, frame) {
      hits = [];
      const trip = frame.state.selectedTrip;
      if (!trip || frame.state.hiddenRoutes.has(trip.routeIndex)) return;

      const route = frame.state.routes[trip.routeIndex];
      drawLine(ctx, frame, trip, route);
      drawStops(ctx, frame, trip, route);
    },
  };
}
