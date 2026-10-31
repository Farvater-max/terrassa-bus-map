import { busPosition, escapeHTML, formatTime, pointToLongitudeLatitude, tripPath } from './geometry.js';

function grayMapStyle(style) {
  const shade = style === 'dark-gray' ? 'Dark' : 'Light';
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${shade}_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Tiles © Esri',
      },
    },
    layers: [{ id: 'esri-gray-canvas', type: 'raster', source: 'esri' }],
  };
}

function drawBusMarker(context, x, y, route) {
  context.save();
  context.beginPath();
  context.roundRect(x - 13, y - 13, 26, 26, 8);
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
  context.fillText(route.short, x, y);
  context.restore();
}

export function createMapView({ canvas, onSelect, onMapChange, translate }) {
  const context = canvas.getContext('2d');
  let style = 'dark-gray';
  let busHits = [];
  let stopHits = [];
  let warningVisible = false;

  const map = new maplibregl.Map({
    container: 'map',
    style: grayMapStyle(style),
    center: [2.02, 41.56],
    zoom: 13.5,
    attributionControl: false,
  });

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
    if (changed) map.setStyle(grayMapStyle(style));
  }

  function setLanguage() {
    document.querySelector('#attr').textContent = translate('map.attribution');
    if (warningVisible) showMapWarning();
  }

  function drawBusRoutes(context, project, state) {
    stopHits = [];
    if (!state.selectedTrip || state.hiddenRoutes.has(state.selectedTrip.routeIndex)) return;

    const trip = state.selectedTrip;
    const route = state.routes[trip.routeIndex];
    const path = tripPath(trip, state.stops, state.shapes);
    if (path.length) {
      context.beginPath();
      context.lineWidth = 4;
      context.globalAlpha = 0.9;
      context.strokeStyle = route.lineColor;
      path.forEach((point, index) => {
        const projected = project(point.x, point.y);
        index ? context.lineTo(projected.x, projected.y) : context.moveTo(projected.x, projected.y);
      });
      context.stroke();
      context.globalAlpha = 1;
    }

    context.font = '11px system-ui,sans-serif';
    context.textAlign = 'left';
    trip.pattern.stopIndexes.forEach(stopIndex => {
      const stop = state.stops[stopIndex];
      const { x, y } = project(stop.x, stop.y);
      if (x < -12 || y < -12 || x > context.canvas.clientWidth + 12 || y > context.canvas.clientHeight + 12) return;
      stopHits.push({ x, y, stopIndex });
      context.beginPath();
      context.arc(x, y, state.selectedStop === stopIndex ? 7 : 5, 0, Math.PI * 2);
      context.fillStyle = route.color;
      context.fill();
      context.lineWidth = state.selectedStop === stopIndex ? 3 : 2;
      context.strokeStyle = state.selectedStop === stopIndex ? '#ffd166' : '#fff';
      context.stroke();
      if (state.zoom >= 14) {
        context.fillStyle = style === 'light-gray' ? '#222' : '#f1f4f2';
        context.fillText(stop.name, x + 8, y + 4);
      }
    });
  }

  function drawBuses(context, project, state) {
    busHits = [];
    let visibleBuses = 0;
    context.font = 'bold 11px system-ui,sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const trip of state.day) {
      if (state.selectedTrip && trip.id !== state.selectedTrip.id) continue;
      if (state.hiddenRoutes.has(trip.routeIndex) || state.time < trip.startTime || state.time > trip.endTime) continue;
      const position = busPosition(trip, state.time, state.stops, state.shapes);
      if (!position) continue;
      visibleBuses++;
      const { x, y } = project(position[0], position[1]);
      if (x < -20 || y < -20 || x > context.canvas.clientWidth + 20 || y > context.canvas.clientHeight + 20) continue;
      const route = state.routes[trip.routeIndex];
      busHits.push({ x, y, trip });
      drawBusMarker(context, x, y, route);
    }
    context.textBaseline = 'alphabetic';
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
      const normalizedStopName = stop.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();
      const hasFgcConnection = normalizedStopName.includes('estacio rambla')
        || normalizedStopName.includes('terrassa rambla');
      const fgcIcon = hasFgcConnection
        ? `<span class="fgc-badge" role="img" aria-label="${escapeHTML(translate('popup.fgc'))}" title="${escapeHTML(translate('popup.fgc'))}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-1l2 2v1h-2l-3-3h-2l-3 3H6v-1l2-2H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 3v6h10V6H7Zm1 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>
            <span>FGC</span>
          </span>`
        : '';
      const noRoutes = !otherRoutes.length && !fgcIcon;
      html = `<b>${escapeHTML(stop.name)}</b><br>${escapeHTML(translate('popup.transfers'))}: `
        + (noRoutes
          ? escapeHTML(translate('popup.noTransfers'))
          : `<span class="transfer-badges">${lineIcons}${fgcIcon}</span>`);
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

    context.lineJoin = 'round';
    context.lineCap = 'round';
    drawBusRoutes(context, project, { ...state, zoom: map.getZoom() });
    const visibleBuses = drawBuses(context, project, state);
    document.querySelector('#clock').textContent = formatTime(state.time);
    document.querySelector('#slider').value = state.time % 86400;
    document.querySelector('#info').textContent = translate('status.busCount', {
      buses: visibleBuses,
      trips: state.day.length,
    }) + state.note;
    drawPopup(project, state);
  }

  map.on('load', onMapChange);
  map.on('error', event => {
    if (event.error && !map.isStyleLoaded()) showMapWarning();
  });
  map.on('move', onMapChange);
  map.on('resize', onMapChange);
  map.on('click', event => {
    const { x, y } = event.point;
    let bus = null;
    let busDistance = 20;
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
    let stopDistance = 15;
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
