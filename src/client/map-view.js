import maplibregl from 'maplibre-gl';
import { LANDMARKS } from './landmarks.js';
import { basemapStyle } from './map/basemap.js';
import {
  DEFAULT_STYLE, MAP_BOUNDS, MAP_CENTER, MAP_START_ZOOM, MAX_ZOOM, MIN_ZOOM,
} from './map/config.js';
import { createFrame } from './map/frame.js';
import { pickSelection } from './map/hit-test.js';
import { loadLandmarkImages } from './map/images.js';
import { createBusesLayer } from './map/layers/buses-layer.js';
import { createLandmarksLayer } from './map/layers/landmarks-layer.js';
import { createRouteLayer } from './map/layers/route-layer.js';
import { busPosition, pointToLongitudeLatitude } from './geometry.js';

function syncCanvasSize(canvas, ctx) {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

export function createMapView({ canvas, onSelect, onMapChange, translate, apiKey = '' }) {
  const ctx = canvas.getContext('2d');
  const query = selector => document.querySelector(selector);
  const mobileQuery = matchMedia('(max-width: 640px)');
  let lastState = null;
  let style = DEFAULT_STYLE;
  let warningVisible = false;

  const landmarks = createLandmarksLayer(loadLandmarkImages(LANDMARKS, onMapChange));
  const route = createRouteLayer();
  const buses = createBusesLayer();
  const drawOrder = [landmarks, route, buses];
  const hitOrder = [buses, route];

  const map = new maplibregl.Map({
    container: 'map',
    style: basemapStyle(style, apiKey),
    center: MAP_CENTER,
    zoom: MAP_START_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: MAP_BOUNDS,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
  });
  map.touchZoomRotate.disableRotation();

  function showMapWarning() {
    warningVisible = true;
    const warning = query('#warn');
    warning.textContent = translate('map.loadError');
    warning.hidden = false;
  }

  function setStyle(nextStyle) {
    const changed = nextStyle !== style;
    style = nextStyle;
    warningVisible = false;
    query('#warn').hidden = true;
    query('#attr').textContent = translate('map.attribution');
    onMapChange();
    if (changed) map.setStyle(basemapStyle(style, apiKey));
  }

  function setLanguage() {
    query('#attr').textContent = translate('map.attribution');
    if (warningVisible) showMapWarning();
  }

  function draw(state) {
    lastState = state;
    syncCanvasSize(canvas, ctx);
    const frame = createFrame({ map, canvas, state, style });
    for (const layer of drawOrder) layer.draw(ctx, frame);
    return { visibleBuses: buses.visibleCount };
  }

  let scheduled = 0;
  const scheduleChange = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      onMapChange();
    });
  };

  function panelOffset() {
    if (!mobileQuery.matches) return [0, 0];
    return [0, -query('#panel').offsetHeight / 2];
  }

  function focusOnBus(trip) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!lastState) return;
      const position = busPosition(trip, lastState.time, lastState.stops, lastState.shapes);
      if (!position) return;
      map.easeTo({
        center: pointToLongitudeLatitude(position[0], position[1]),
        offset: panelOffset(),
        duration: 700,
      });
    }));
  }

  map.on('load', onMapChange);
  map.on('error', event => {
    if (event.error && !map.isStyleLoaded()) showMapWarning();
  });
  map.on('move', scheduleChange);
  map.on('resize', scheduleChange);
  map.on('click', ({ point }) => {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const selection = pickSelection(hitOrder, point, coarse);
    onSelect(selection);
    if (selection?.trip) focusOnBus(selection.trip);
  });

  return {
    map,
    draw,
    setStyle,
    setLanguage,
    zoomBy(amount) { map.zoomTo(map.getZoom() + amount, { duration: 180 }); },
  };
}
