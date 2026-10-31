import { createLocalization } from './src/client/localization.js';
import { loadFeeds } from './src/client/feeds.js';
import { createMapView } from './src/client/map-view.js';
import { prepareSchedule, selectSchedule } from './src/client/schedules.js';
import { escapeHTML } from './src/client/geometry.js';

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

const mapView = createMapView({
  canvas: query('#cv'),
  translate: t,
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

function renderFrame() {
  mapView.draw({
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
query('#style').addEventListener('change', event => mapView.setStyle(event.target.value));
query('#play').addEventListener('click', event => {
  playing = !playing;
  event.currentTarget.textContent = t(playing ? 'control.pause' : 'control.play');
});
query('#now').addEventListener('click', setCurrentTime);
query('#slider').addEventListener('input', event => {
  simulationTime = Number(event.target.value);
  needsRedraw = true;
});
query('#language').addEventListener('change', event => updateLanguage(event.target.value));
query('#zi').addEventListener('click', () => mapView.zoomBy(1));
query('#zo').addEventListener('click', () => mapView.zoomBy(-1));

setCurrentTime();
buildDay();
mapView.setStyle(query('#style').value);
requestAnimationFrame(animationFrame);
