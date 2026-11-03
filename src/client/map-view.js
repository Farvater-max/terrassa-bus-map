import { busPosition, escapeHTML, formatTime, pointToLongitudeLatitude, tripPath } from './geometry.js';

const ARCGIS_API_KEY = globalThis.ARCGIS_API_KEY ?? '';
const BASEMAP_LANGUAGE = 'es';

const MAX_ZOOM = 19;
const ARROW_BASE_ZOOM = MAX_ZOOM; // на этом зуме показаны все стрелки
const ARROW_BASE_PX = 80;         // расстояние между стрелками на экране на ARROW_BASE_ZOOM
const ARROW_TARGET_PX = 80;       // минимальное расстояние между стрелками на других зумах
const ARROW_MAX_COUNT = 20000;    // защита от слишком длинных путей

function vectorStyleUrl(style, apiKey) {
  const styleId = style === 'dark-gray' ? 'dark-gray' : 'light-gray';
  const params = new URLSearchParams({ token: apiKey });
  if (BASEMAP_LANGUAGE) params.set('language', BASEMAP_LANGUAGE);
  return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${styleId}?${params}`;
}

function rasterFallbackStyle(style) {
  const shade = style === 'dark-gray' ? 'Dark' : 'Light';
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${shade}_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: 'Tiles © Esri',
      },
    },
    layers: [{ id: 'esri-gray-canvas', type: 'raster', source: 'esri' }],
  };
}

function basemapStyle(style, apiKey) {
  return apiKey ? vectorStyleUrl(style, apiKey) : rasterFallbackStyle(style);
}

/* ---------- Вспомогательная отрисовка ---------- */

function strokePath(context, points, width, color, alpha = 1) {
  if (!points.length) return;
  context.beginPath();
  points.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
  context.lineWidth = width;
  context.strokeStyle = color;
  context.globalAlpha = alpha;
  context.stroke();
  context.globalAlpha = 1;
}

// Считаем позиции стрелок один раз на рейс, в исходных координатах маршрута.
// Шаг выбирается так, чтобы на ARROW_BASE_ZOOM между стрелками было ARROW_BASE_PX пикселей.
function buildArrows(path, project, zoom) {
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

function drawArrows(context, project, arrows, zoom) {
  if (!arrows.length) return;
  const width = context.canvas.clientWidth;
  const height = context.canvas.clientHeight;

  // f — на сколько «удвоений» шаг надо увеличить, чтобы стрелки не стояли слишком густо
  const f = Math.log2(ARROW_TARGET_PX / ARROW_BASE_PX) + ARROW_BASE_ZOOM - zoom;
  const n = Math.max(0, Math.ceil(f));

  for (const arrow of arrows) {
    let alpha;
    if (arrow.level >= n) alpha = 1;
    else if (arrow.level === n - 1) alpha = n - f; // плавно появляется/гаснет между уровнями
    else continue;
    if (alpha <= 0.02) continue;

    const { x, y } = project(arrow.x, arrow.y);
    if (x < -10 || y < -10 || x > width + 10 || y > height + 10) continue;

    const from = project(arrow.ax, arrow.ay);
    const to = project(arrow.bx, arrow.by);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalAlpha = alpha * 0.95;
    context.beginPath();
    context.moveTo(-3, -4);
    context.lineTo(3, 0);
    context.lineTo(-3, 4);
    context.lineWidth = 2;
    context.strokeStyle = '#fff';
    context.stroke();
    context.restore();
  }
  context.globalAlpha = 1;
}

function drawBusMarker(context, x, y, route, zoom) {
  const scale = zoom < 12.5 ? 0.7 : zoom < 14 ? 0.85 : 1;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  context.beginPath();
  context.roundRect(-13, -13, 26, 26, 8);
  context.fillStyle = route.color;
  context.shadowColor = 'rgba(0,0,0,.45)';
  context.shadowBlur = 3;
  context.fill();
  context.shadowBlur = 0;
  context.lineWidth = 2.5;
  context.strokeStyle = '#fff';
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = '#15191b';
  context.stroke();
  context.fillStyle = route.text;
  context.font = 'bold 10px system-ui,sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(route.short, 0, 0);
  context.restore();
}

/* ---------- Пересадки на FGC / Renfe (с кэшем) ---------- */

const FGC_STOP_NAMES = ['estacio rambla', 'vallparadis universitat', 'vallparadis-universitat', 'estacio nord', 'estacio nord-2'];
const RENFE_STOP_NAMES = ['estacio nord', 'estacio nord-2', 'estacio est'];
const connectionCache = new Map();

function railConnections(stopName) {
  let cached = connectionCache.get(stopName);
  if (cached) return cached;

  const normalized = stopName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

  cached = {
    fgc: FGC_STOP_NAMES.some(name => normalized.includes(name)),
    renfe: RENFE_STOP_NAMES.some(name => normalized.includes(name)),
  };
  connectionCache.set(stopName, cached);
  return cached;
}

/* ---------- Основной модуль ---------- */

export function createMapView({ canvas, onSelect, onMapChange, translate, apiKey = ARCGIS_API_KEY }) {
  const context = canvas.getContext('2d');
  let style = 'dark-gray';
  let busHits = [];
  let stopHits = [];
  let warningVisible = false;
  let arrowCache = { key: null, size: 0, arrows: [] };

  const isDark = () => style === 'dark-gray';

  const map = new maplibregl.Map({
    container: 'map',
    style: basemapStyle(style, apiKey),
    center: [2.02, 41.56],
    zoom: 13.5,
    minZoom: 11,
    maxZoom: MAX_ZOOM,
    maxBounds: [[1.8, 41.4], [2.25, 41.72]], // подправьте под границы вашего района
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
  });
  map.touchZoomRotate.disableRotation();

  function showMapWarning() {
    warningVisible = true;
    const warning = document.querySelector('#warn');
    warning.textContent = translate('map.loadError');
    warning.hidden = false;
  }

  function setStyle(nextStyle) {
    const changed = nextStyle !== style;
    style = nextStyle;
    warningVisible = false;
    document.querySelector('#warn').hidden = true;
    document.querySelector('#attr').textContent = translate('map.attribution');
    onMapChange();
    if (changed) map.setStyle(basemapStyle(style, apiKey));
  }

  function setLanguage() {
    document.querySelector('#attr').textContent = translate('map.attribution');
    if (warningVisible) showMapWarning();
  }

  function drawBusRoutes(context, project, state) {
    stopHits = [];
    if (!state.selectedTrip || state.hiddenRoutes.has(state.selectedTrip.routeIndex)) return;

    const dark = isDark();
    const trip = state.selectedTrip;
    const route = state.routes[trip.routeIndex];
    const path = tripPath(trip, state.stops, state.shapes);

    // Линия маршрута: обводка + цветная линия, толщина зависит от зума
    const lineWidth = Math.max(3, Math.min(8, (state.zoom - 10) * 1.1));
    if (path.length) {
      const projected = path.map(point => project(point.x, point.y));
      strokePath(context, projected, lineWidth + 3, dark ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.95)');
      strokePath(context, projected, lineWidth, route.lineColor, 0.95);

      // Стрелки считаем один раз на рейс и дальше только проецируем
      if (arrowCache.key !== trip.id || arrowCache.size !== path.length) {
        arrowCache = { key: trip.id, size: path.length, arrows: buildArrows(path, project, state.zoom) };
      }
      if (state.zoom >= 12.5) drawArrows(context, project, arrowCache.arrows, state.zoom);
    }

    // Остановки
    const radiusBase = state.zoom < 13 ? 3 : state.zoom < 15 ? 4.5 : 6;
    const labelRects = [];
    const lastIndex = trip.pattern.stopIndexes.length - 1;
    const width = context.canvas.clientWidth;
    const height = context.canvas.clientHeight;

    context.font = '11px system-ui,sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';

    trip.pattern.stopIndexes.forEach((stopIndex, order) => {
      const stop = state.stops[stopIndex];
      const { x, y } = project(stop.x, stop.y);
      if (x < -12 || y < -12 || x > width + 12 || y > height + 12) return;
      stopHits.push({ x, y, stopIndex });

      const selected = state.selectedStop === stopIndex;
      const terminal = order === 0 || order === lastIndex;
      const radius = (selected ? 1.4 : terminal ? 1.25 : 1) * radiusBase;

      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = terminal ? '#fff' : route.color;
      context.fill();
      context.lineWidth = selected ? 3 : 2;
      context.strokeStyle = selected ? '#ffd166' : terminal ? route.color : '#fff';
      context.stroke();

      // Подписи: конечные и выбранная всегда, остальные с зума 14.5 и без наложений
      if (!(terminal || selected || state.zoom >= 14.5)) return;
      const rect = { x: x + 9, y: y - 8, w: context.measureText(stop.name).width, h: 16 };
      const overlaps = labelRects.some(other => (
        rect.x < other.x + other.w && rect.x + rect.w > other.x
        && rect.y < other.y + other.h && rect.y + rect.h > other.y
      ));
      if (overlaps && !selected && !terminal) return;
      labelRects.push(rect);

      context.lineWidth = 3;
      context.strokeStyle = dark ? 'rgba(20,24,26,.9)' : 'rgba(255,255,255,.95)';
      context.strokeText(stop.name, rect.x, y);
      context.fillStyle = dark ? '#f1f4f2' : '#222';
      context.fillText(stop.name, rect.x, y);
    });
    context.textBaseline = 'alphabetic';
  }

  function drawBuses(context, project, state) {
    busHits = [];
    let visibleBuses = 0;
    const width = context.canvas.clientWidth;
    const height = context.canvas.clientHeight;

    for (const trip of state.day) {
      if (state.selectedTrip && trip.id !== state.selectedTrip.id) continue;
      if (state.hiddenRoutes.has(trip.routeIndex) || state.time < trip.startTime || state.time > trip.endTime) continue;
      const position = busPosition(trip, state.time, state.stops, state.shapes);
      if (!position) continue;
      visibleBuses++;

      const { x, y } = project(position[0], position[1]);
      if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;

      const route = state.routes[trip.routeIndex];
      busHits.push({ x, y, trip });
      drawBusMarker(context, x, y, route, state.zoom);
    }
    return visibleBuses;
  }

  function drawPopup(project, state) {
    const popup = document.querySelector('#pop');
    if (!state.selection) {
      popup.hidden = true;
      return;
    }

    let x;
    let y;
    let html;
    if (state.selection.trip) {
      const trip = state.selection.trip;
      const hit = busHits.find(item => item.trip.id === trip.id);
      if (hit) {
        x = hit.x;
        y = hit.y;
        const relativeTime = state.time - trip.startTime;
        let index = trip.pattern.times.findIndex(time => time > relativeTime);
        if (index < 0) index = trip.pattern.stopIndexes.length - 1;
        html = `<b>${escapeHTML(state.routes[trip.routeIndex].short)}</b> → ${escapeHTML(trip.headsign)}<br>`
          + `${escapeHTML(translate('popup.nextStop'))}: ${escapeHTML(state.stops[trip.pattern.stopIndexes[index]].name)}<br>`
          + `${escapeHTML(translate('popup.scheduledAt'))}: ${formatTime(trip.startTime + trip.pattern.times[index])}`;
      }
    } else {
      const stop = state.stops[state.selection.stopIndex];
      const otherRoutes = [...new Set(state.day
        .filter(trip => trip.pattern.stopIndexes.includes(state.selection.stopIndex)
          && trip.routeIndex !== state.selectedTrip?.routeIndex)
        .map(trip => trip.routeIndex))]
        .sort((left, right) => state.routes[left].short.localeCompare(state.routes[right].short, undefined, { numeric: true }))
        .map(routeIndex => state.routes[routeIndex]);
      ({ x, y } = project(stop.x, stop.y));

      const lineIcons = otherRoutes.map(route => (
        `<span class="transfer-badge" style="--route-color:${escapeHTML(route.color)};--route-text:${escapeHTML(route.text)}">${escapeHTML(route.short)}</span>`
      )).join('');

      const { fgc, renfe } = railConnections(stop.name);
      const fgcIcon = fgc
        ? `<span class="fgc-badge" role="img" aria-label="${escapeHTML(translate('popup.fgc'))}" title="${escapeHTML(translate('popup.fgc'))}">
            <img src="./src/icons/fgc.png" alt="">
            <span>FGC</span>
          </span>`
        : '';
      const renfeIcon = renfe
        ? `<span class="renfe-badge" role="img" aria-label="${escapeHTML(translate('popup.renfe'))}" title="${escapeHTML(translate('popup.renfe'))}">
            <img src="./src/icons/renfe.png" alt="">
            <span>Renfe</span>
          </span>`
        : '';

      html = `<b>${escapeHTML(stop.name)}</b>`;
      if (otherRoutes.length > 0 || fgc || renfe) {
        html += `<br>${escapeHTML(translate('popup.transfers'))} `
          + `<span class="transfer-badges">${lineIcons}${fgcIcon}${renfeIcon}</span>`;
      }
    }

    if (!html) {
      popup.hidden = true;
      return;
    }
    popup.hidden = false;
    popup.innerHTML = html;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
  }

  function draw(state) {
    if (!map) return;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    const project = (x, y) => {
      const point = map.project(pointToLongitudeLatitude(x, y));
      return { x: point.x, y: point.y };
    };

    const drawState = { ...state, zoom: map.getZoom() };
    context.lineJoin = 'round';
    context.lineCap = 'round';
    drawBusRoutes(context, project, drawState);
    const visibleBuses = drawBuses(context, project, drawState);
    document.querySelector('#clock').textContent = formatTime(state.time);
    document.querySelector('#slider').value = state.time % 86400;
    document.querySelector('#info').textContent = translate('status.busCount', {
      buses: visibleBuses,
      trips: state.day.length,
    }) + state.note;
    drawPopup(project, state);
  }

  /* ---------- События карты ---------- */

  // Объединяем частые события move/resize в один вызов на кадр
  let frame = 0;
  const scheduleChange = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onMapChange();
    });
  };

  map.on('load', onMapChange);
  map.on('error', event => {
    if (event.error && !map.isStyleLoaded()) showMapWarning();
  });
  map.on('move', scheduleChange);
  map.on('resize', scheduleChange);

  map.on('click', event => {
    const { x, y } = event.point;
    const coarse = matchMedia('(pointer: coarse)').matches; // тачскрин: нужен больший радиус нажатия

    let bus = null;
    let busDistance = coarse ? 32 : 20;
    busHits.forEach(hit => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance < busDistance) {
        busDistance = distance;
        bus = hit;
      }
    });
    if (bus) {
      onSelect({ trip: bus.trip, stopIndex: null });
      return;
    }

    let stop = null;
    let stopDistance = coarse ? 24 : 15;
    stopHits.forEach(hit => {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance < stopDistance) {
        stopDistance = distance;
        stop = hit;
      }
    });
    onSelect(stop ? { trip: null, stopIndex: stop.stopIndex } : null);
  });

  return {
    map,
    draw,
    setStyle,
    setLanguage,
    zoomBy(amount) { map.zoomTo(map.getZoom() + amount, { duration: 180 }); },
  };
}
