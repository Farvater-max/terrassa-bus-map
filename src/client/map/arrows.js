const ARROW_TARGET_PX = 130;
const MIN_LEG_PX = 60;
const FADE_PX = 20;
const MAX_DEPTH = 5;

function legStartIndexes(trip, pathLength) {
  const { stopIndexes, shapeIndex, shapeIndexes } = trip.pattern;
  const indexes = shapeIndex === null
    ? stopIndexes.map((_, order) => order)
    : shapeIndexes.map(index => index - shapeIndexes[0]);
  return indexes.map(index => Math.min(index, pathLength - 1));
}

function cumulativeLengths(path) {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  return cumulative;
}

function pointAt(path, cumulative, target, low, high) {
  let lo = low + 1;
  let hi = high;
  while (lo < hi) {
    const middle = (lo + hi) >> 1;
    cumulative[middle] >= target ? hi = middle : lo = middle + 1;
  }
  const a = path[lo - 1];
  const b = path[lo];
  const t = (target - cumulative[lo - 1]) / (cumulative[lo] - cumulative[lo - 1]);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    ax: a.x, ay: a.y, bx: b.x, by: b.y,
  };
}

export function buildArrows(path, trip) {
  if (path.length < 2) return [];

  const cumulative = cumulativeLengths(path);
  const starts = legStartIndexes(trip, path.length);
  const arrows = [];

  for (let leg = 0; leg < starts.length - 1; leg++) {
    const from = starts[leg];
    const to = starts[leg + 1];
    const legLength = cumulative[to] - cumulative[from];
    if (!(legLength > 0)) continue;

    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const parts = 2 ** depth;
      for (let j = 1; j < parts; j += 2) {
        const target = cumulative[from] + legLength * (j / parts);
        arrows.push({ depth, legLength, ...pointAt(path, cumulative, target, from, to) });
      }
    }
  }
  return arrows;
}

const clamp01 = value => Math.min(1, Math.max(0, value));

export function drawArrows(ctx, frame, arrows) {
  if (!arrows.length) return;

  for (const arrow of arrows) {
    const point = frame.project(arrow.x, arrow.y);
    if (!frame.isVisible(point, 10)) continue;

    const from = frame.project(arrow.ax, arrow.ay);
    const to = frame.project(arrow.bx, arrow.by);
    const segmentPixels = Math.hypot(to.x - from.x, to.y - from.y);
    const segmentUnits = Math.hypot(arrow.bx - arrow.ax, arrow.by - arrow.ay);
    if (!segmentPixels || !segmentUnits) continue;

    const legPixels = arrow.legLength * (segmentPixels / segmentUnits);
    const alpha = arrow.depth === 1
      ? clamp01((legPixels - MIN_LEG_PX) / FADE_PX)
      : clamp01(Math.log2(legPixels / ARROW_TARGET_PX) - arrow.depth + 1);
    if (alpha <= 0.02) continue;

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
