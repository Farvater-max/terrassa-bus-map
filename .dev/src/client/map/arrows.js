import { MAX_ZOOM } from './config.js';

const ARROW_BASE_ZOOM = MAX_ZOOM;
const ARROW_BASE_PX = 130;
const ARROW_TARGET_PX = 130;
const ARROW_MAX_COUNT = 20000;

export function buildArrows(path, project, zoom) {
  if (path.length < 2) return [];

  let units = 0;
  let pixels = 0;
  let previous = project(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    const current = project(path[i].x, path[i].y);
    units += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    pixels += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  if (!units || !pixels) return [];

  const pixelsPerUnitAtZoom0 = (pixels / units) / 2 ** zoom;
  const step = ARROW_BASE_PX / (pixelsPerUnitAtZoom0 * 2 ** ARROW_BASE_ZOOM);

  const arrows = [];
  let travelled = 0;
  let k = 1;
  for (let i = 1; i < path.length && k < ARROW_MAX_COUNT; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    while (k * step <= travelled + length && k < ARROW_MAX_COUNT) {
      const t = (k * step - travelled) / length;
      arrows.push({
        level: Math.log2(k & -k), // сколько раз k делится на 2: чем больше, тем дольше стрелка остаётся при отдалении
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        ax: a.x, ay: a.y, bx: b.x, by: b.y, // сегмент, на котором стоит стрелка (для направления)
      });
      k++;
    }
    travelled += length;
  }
  return arrows;
}

export function drawArrows(ctx, frame, arrows) {
  if (!arrows.length) return;

  const f = Math.log2(ARROW_TARGET_PX / ARROW_BASE_PX) + ARROW_BASE_ZOOM - frame.zoom;
  const n = Math.max(0, Math.ceil(f));

  for (const arrow of arrows) {
    let alpha;
    if (arrow.level >= n) alpha = 1;
    else if (arrow.level === n - 1) alpha = n - f;
    else continue;
    if (alpha <= 0.02) continue;

    const point = frame.project(arrow.x, arrow.y);
    if (!frame.isVisible(point, 10)) continue;

    const from = frame.project(arrow.ax, arrow.ay);
    const to = frame.project(arrow.bx, arrow.by);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha * 0.95;
    ctx.beginPath();
    ctx.moveTo(-3, -4);
    ctx.lineTo(3, 0);
    ctx.lineTo(-3, 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
