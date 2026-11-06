import { busPosition, isSameDirection } from '../../geometry.js';

function drawBusMarker(ctx, x, y, route, zoom) {
  const scale = zoom < 12.5 ? 0.7 : zoom < 14 ? 0.85 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.roundRect(-13, -13, 26, 26, 8);
  ctx.fillStyle = route.color;
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = 3;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#15191b';
  ctx.stroke();
  ctx.fillStyle = route.text;
  ctx.font = 'bold 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(route.short, 0, 0);
  ctx.restore();
}

/** Слой автобусов на линии. Хиты — маркеры автобусов. */
export function createBusesLayer() {
  let hits = [];
  let visibleCount = 0;

  return {
    hitRadius: { fine: 20, coarse: 32 },
    hits: () => hits,
    get visibleCount() { return visibleCount; },

    /** Экранная позиция автобуса (если он сейчас на экране) — нужна попапу. */
    positionOf(trip) {
      const hit = hits.find(item => item.selection.trip.id === trip.id);
      return hit ? { x: hit.x, y: hit.y } : null;
    },

    draw(ctx, frame) {
      const { state, zoom } = frame;
      hits = [];
      visibleCount = 0;

      for (const trip of state.day) {
        if (state.selectedTrip && !isSameDirection(trip, state.selectedTrip)) continue;
        if (state.hiddenRoutes.has(trip.routeIndex)) continue;
        // busPosition возвращает null вне интервала рейса, отдельная проверка времени не нужна
        const position = busPosition(trip, state.time, state.stops, state.shapes);
        if (!position) continue;
        visibleCount++;

        const point = frame.project(position[0], position[1]);
        if (!frame.isVisible(point, 20)) continue;

        drawBusMarker(ctx, point.x, point.y, state.routes[trip.routeIndex], zoom);
        hits.push({ ...point, selection: { trip, stopIndex: null } });
      }
    },
  };
}
