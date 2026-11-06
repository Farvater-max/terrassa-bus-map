import { createLocalization } from './src/client/localization.js';
import { loadFeeds } from './src/client/feeds.js';
import { createMapView } from './src/client/map-view.js';
import { prepareSchedule, selectSchedule } from './src/client/schedules.js';
import { escapeHTML, formatTime } from './src/client/geometry.js';

const query = selector => document.querySelector(selector);
const localization = createLocalization(window.TRANSLATIONS);
const t = localization.translate;
localization.apply();

let feedData;
try {
  feedData = await loadFeeds({
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    translate: t,
  });
} catch (error) {
  query('#info').textContent = t('status.loadError', { error: error.message });
  throw error;
}

let preparedSchedule = null;
let dayTrips = [];
let hiddenRoutes = new Set();
let selectedTrip = null;
let selectedStop = null;
let note = '';
let simulationTime = 0;
let playing = true;
let speed = 1;
let lastFrameTime = performance.now();
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
  apiKey: window.ARCGIS_API_KEY,
  onMapChange: () => { needsRedraw = true; },
  onSelect: selection => {
    if (selection?.stopIndex == null) selectedTrip = selection?.trip || null;
    selectedStop = selection?.stopIndex ?? null;
    needsRedraw = true;
  },
});

function createScheduleOptions(selectedValue = query('#set').value) {
  const options = [`<option value="auto">${t('schedule.auto')}</option>`];
  for (const schedule of feedData.schedules) {
    const key = `schedule.${schedule.id}`;
    const label = t(key);
    const displayName = label === key ? schedule.label : label;
    options.push(`<option value="${escapeHTML(schedule.id)}">${escapeHTML(displayName)}</option>`);
  }
  query('#set').innerHTML = options.join('');
  query('#set').value = selectedValue;
}

function createRouteChips(routes) {
  const container = query('#chips');
  container.replaceChildren();
  const routeIndexes = routes.map((_, index) => index);
  routeIndexes.sort((left, right) => routes[left].short.localeCompare(
    routes[right].short,
    undefined,
    { numeric: true },
  ));

  for (const index of routeIndexes) {
    const route = routes[index];
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = route.short;
    chip.style.borderColor = route.lineColor;
    chip.style.background = route.color;
    chip.style.color = route.text;
    chip.addEventListener('click', () => {
      if (hiddenRoutes.has(index)) hiddenRoutes.delete(index);
      else hiddenRoutes.add(index);
      if (hiddenRoutes.has(index) && selectedTrip?.routeIndex === index) {
        selectedTrip = null;
        selectedStop = null;
      }
      chip.classList.toggle('off', hiddenRoutes.has(index));
      needsRedraw = true;
    });
    container.append(chip);
  }
}

function buildDay() {
  selectedTrip = null;
  selectedStop = null;
  const ymd = query('#date').value.replaceAll('-', '');
  const selection = selectSchedule(feedData.schedules, ymd, query('#set').value, t);

  if (preparedSchedule?.schedule !== selection.schedule) {
    preparedSchedule = prepareSchedule(selection.schedule);
    hiddenRoutes.clear();
    createRouteChips(preparedSchedule.routes);
  }

  dayTrips = preparedSchedule.trips.filter(trip => selection.services.has(trip.service));
  const scheduleKey = `schedule.${selection.schedule.id}`;
  const scheduleLabel = t(scheduleKey);
  const scheduleName = scheduleLabel === scheduleKey ? selection.schedule.label : scheduleLabel;
  const updatedAt = feedData.generatedAt
    ? new Intl.DateTimeFormat(localization.language).format(new Date(feedData.generatedAt))
    : '—';
  note = t('status.schedule', { schedule: scheduleName })
    + selection.note
    + t('status.updated', { date: updatedAt });
  needsRedraw = true;
}

function setCurrentTime() {
  const now = new Date();
  simulationTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  needsRedraw = true;
}

function renderHud(visibleBuses) {
  query('#clock').textContent = formatTime(simulationTime);
  query('#slider').value = simulationTime % 86400;
  query('#info').textContent = t('status.busCount', {
    buses: visibleBuses,
    trips: dayTrips.length,
  }) + note;
}

function renderFrame() {
  const { visibleBuses } = mapView.draw({
    day: dayTrips,
    hiddenRoutes,
    note,
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
  renderHud(visibleBuses);
}

function animationFrame(now) {
  const elapsed = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (playing) {
    simulationTime = (simulationTime + elapsed * speed) % 86400;
    needsRedraw = true;
  }
  if (needsRedraw) {
    needsRedraw = false;
    renderFrame();
  }
  requestAnimationFrame(animationFrame);
}

function updateLanguage(nextLanguage) {
  localization.setLanguage(nextLanguage);
  updateThemeButton();
  createScheduleOptions(query('#set').value);
  query('#play').textContent = t(playing ? 'control.pause' : 'control.play');
  mapView.setLanguage();
  buildDay();
}

const today = new Date();
query('#date').value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');

createScheduleOptions('auto');
query('#date').addEventListener('change', buildDay);
query('#set').addEventListener('change', buildDay);
query('#speed').addEventListener('change', event => { speed = Number(event.target.value); });
query('#theme').addEventListener('click', () => {
  mapStyle = mapStyle === 'dark-gray' ? 'light-gray' : 'dark-gray';
  mapView.setStyle(mapStyle);
  updateThemeButton();
});
query('#play').addEventListener('click', event => {
  playing = !playing;
  event.currentTarget.textContent = t(playing ? 'control.pause' : 'control.play');
});
query('#now').addEventListener('click', setCurrentTime);
query('#slider').addEventListener('input', event => {
  simulationTime = Number(event.target.value);
  needsRedraw = true;
});
query('#language').addEventListener('click', event => {
  const button = event.target.closest('[data-lang]');
  if (button) updateLanguage(button.dataset.lang);
});
query('#zi').addEventListener('click', () => mapView.zoomBy(1));
query('#zo').addEventListener('click', () => mapView.zoomBy(-1));

setCurrentTime();
buildDay();
updateThemeButton();
mapView.setStyle(mapStyle);
requestAnimationFrame(animationFrame);
