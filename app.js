import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import es from './src/i18n/es.json';
import ca from './src/i18n/ca.json';
import { createLocalization } from './src/client/localization.js';
import { loadFeeds } from './src/client/feeds.js';
import { createMapView } from './src/client/map-view.js';
import { prepareSchedule, selectSchedule } from './src/client/schedules.js';
import { formatTime } from './src/client/geometry.js';

const query = selector => document.querySelector(selector);
const localization = createLocalization({ es, ca });
const t = localization.translate;
localization.apply();

let feedData;
try {
  feedData = await loadFeeds({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    translate: t,
  });
} catch (error) {
  const notice = query('#notice');
  notice.textContent = t('status.loadError', { error: error.message });
  notice.hidden = false;
  throw error;
}

const hiddenRoutes = new Set();
let preparedSchedule = null;
let dayTrips = [];
let dayKey = '';
let selectedTrip = null;
let selectedStop = null;
let simulationTime = 0;
let needsRedraw = true;
let mapStyle = 'dark-gray';

const THEME_ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
};

function updateThemeButton() {
  const dark = mapStyle === 'dark-gray';
  const button = query('#theme');
  const label = t(dark ? 'control.switchToLight' : 'control.switchToDark');
  button.innerHTML = dark ? THEME_ICONS.sun : THEME_ICONS.moon; // показываем, на что переключимся
  button.setAttribute('aria-label', label);
  button.title = label;
}

const mapView = createMapView({
  canvas: query('#cv'),
  translate: t,
  apiKey: import.meta.env.VITE_ARCGIS_API_KEY ?? '',
  onMapChange: () => { needsRedraw = true; },
  onSelect: selection => {
    if (selection?.stopIndex == null) selectedTrip = selection?.trip || null;
    selectedStop = selection?.stopIndex ?? null;
    needsRedraw = true;
  },
});

function todayYmd() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
}

function currentSeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
}

function buildDay() {
  selectedTrip = null;
  selectedStop = null;
  dayKey = todayYmd();
  const selection = selectSchedule(feedData.schedules, dayKey, 'auto', t);

  if (preparedSchedule?.schedule !== selection.schedule) {
    preparedSchedule = prepareSchedule(selection.schedule);
  }
  dayTrips = preparedSchedule.trips.filter(trip => selection.services.has(trip.service));
  needsRedraw = true;
}

function nextDeparture() {
  let next = Infinity;
  for (const trip of dayTrips) {
    if (trip.startTime > simulationTime && trip.startTime < next) next = trip.startTime;
  }
  return Number.isFinite(next) ? next : null;
}

function renderNotice(visibleBuses) {
  const notice = query('#notice');
  let text = '';
  if (visibleBuses === 0) {
    if (!dayTrips.length) {
      text = t('notice.noService');
    } else {
      text = t('notice.noBuses');
      const next = nextDeparture();
      if (next !== null) text += t('notice.nextDeparture', { time: formatTime(next).slice(0, 5) });
    }
  }
  if (notice.textContent !== text) notice.textContent = text;
  notice.hidden = !text;
}

function renderFrame() {
  const { visibleBuses } = mapView.draw({
    day: dayTrips,
    hiddenRoutes,
    selectedStop,
    selectedTrip,
    selection: selectedStop !== null
      ? { stopIndex: selectedStop }
      : selectedTrip ? { trip: selectedTrip } : null,
    shapes: preparedSchedule.shapes,
    routes: preparedSchedule.routes,
    stops: preparedSchedule.stops,
    time: simulationTime,
  });
  renderNotice(visibleBuses);
}

function animationFrame() {
  if (todayYmd() !== dayKey) buildDay(); // наступила полночь
  simulationTime = currentSeconds();
  renderFrame();
  requestAnimationFrame(animationFrame);
}

function updateLanguage(nextLanguage) {
  localization.setLanguage(nextLanguage);
  updateThemeButton();
  mapView.setLanguage();
  buildDay();
}

query('#theme').addEventListener('click', () => {
  mapStyle = mapStyle === 'dark-gray' ? 'light-gray' : 'dark-gray';
  mapView.setStyle(mapStyle);
  updateThemeButton();
});
query('#language').addEventListener('click', event => {
  const button = event.target.closest('[data-lang]');
  if (button) updateLanguage(button.dataset.lang);
});
query('#zi').addEventListener('click', () => mapView.zoomBy(1));
query('#zo').addEventListener('click', () => mapView.zoomBy(-1));

buildDay();
updateThemeButton();
mapView.setStyle(mapStyle);
requestAnimationFrame(animationFrame);
