import { openZip, tidy } from './csv.js';
import { snapStopsToShape } from './geometry.js';

function parseTime(value) {
  value = (value || '').trim();
  if (!value) return null;
  const parts = value.split(':');
  return +parts[0] * 3600 + +parts[1] * 60 + (parts[2] ? +parts[2] : 0);
}

function fillMissingTimes(values) {
  let i = 0;
  while (i < values.length) {
    if (values[i] !== null) { i++; continue; }
    let end = i;
    while (end < values.length && values[end] === null) end++;
    const low = i ? values[i - 1] : null;
    const high = end < values.length ? values[end] : null;
    for (let k = i; k < end; k++) {
      values[k] = low !== null && high !== null
        ? low + (high - low) * (k - i + 1) / (end - i + 1)
        : (low ?? high);
    }
    i = end;
  }
  return values;
}

export function transformGtfs(raw, id, label, geometry = []) {
  const read = openZip(raw);
  const stops = read('stops');
  const routes = read('routes');
  const trips = read('trips');
  const stopIndexes = new Map(stops.map((stop, i) => [stop.stop_id, i]));
  const routeIndexes = new Map(routes.map((route, i) => [route.route_id, i]));
  const stopTimesByTrip = new Map();
  for (const stopTime of read('stop_times')) {
    if (!stopTimesByTrip.has(stopTime.trip_id)) stopTimesByTrip.set(stopTime.trip_id, []);
    stopTimesByTrip.get(stopTime.trip_id).push(stopTime);
  }

  const patternIndexes = new Map();
  const patterns = [];
  const packedTrips = [];
  const services = [];
  const headsigns = [];
  const headsignIndexes = new Map();
  for (const trip of trips) {
    const rows = (stopTimesByTrip.get(trip.trip_id) || [])
      .sort((a, b) => +a.stop_sequence - +b.stop_sequence)
      .filter(row => stopIndexes.has(row.stop_id));
    if (rows.length < 2 || !routeIndexes.has(trip.route_id)) continue;
    const times = fillMissingTimes(rows.map(row => parseTime(row.arrival_time || row.departure_time)));
    if (times[0] === null) continue;
    const startTime = times[0];
    const sequence = rows.map(row => stopIndexes.get(row.stop_id));
    const relativeTimes = times.map(time => Math.round(time - startTime));
    const patternKey = `${sequence.join(',')}|${relativeTimes.join(',')}`;
    if (!patternIndexes.has(patternKey)) {
      patternIndexes.set(patternKey, patterns.length);
      patterns.push([sequence, relativeTimes]);
    }
    if (!services.includes(trip.service_id)) services.push(trip.service_id);
    const headsign = tidy(trip.trip_headsign || '');
    if (!headsignIndexes.has(headsign)) {
      headsignIndexes.set(headsign, headsigns.length);
      headsigns.push(headsign);
    }
    packedTrips.push([
      patternIndexes.get(patternKey),
      Math.round(startTime),
      routeIndexes.get(trip.route_id),
      services.indexOf(trip.service_id),
      headsignIndexes.get(headsign),
    ]);
  }

  const packedShapes = [];
  const shapeIndexes = new Map();
  const geometryBySequence = new Map();
  const findGeometry = sequence => {
    const key = sequence.join(',');
    if (!geometryBySequence.has(key)) {
      const coordinates = sequence.map(i => [+stops[i].stop_lat, +stops[i].stop_lon]);
      let best = null;
      geometry.forEach((shape, shapeIndex) => {
        const snapped = snapStopsToShape(coordinates, shape);
        if (snapped && (!best || snapped.cost < best.cost)) best = { shapeIndex, ...snapped };
      });
      if (best) {
        if (!shapeIndexes.has(best.shapeIndex)) {
          shapeIndexes.set(best.shapeIndex, packedShapes.length);
          packedShapes.push(geometry[best.shapeIndex]);
        }
        geometryBySequence.set(key, [shapeIndexes.get(best.shapeIndex), best.indexes]);
      } else geometryBySequence.set(key, null);
    }
    return geometryBySequence.get(key);
  };
  for (const pattern of patterns) pattern.push(...(findGeometry(pattern[0]) || [null, null]));
  console.log(`  ${id}: shapes matched for ${patterns.filter(pattern => pattern[2] !== null).length} of ${patterns.length} route patterns`);

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const calendar = read('calendar').map(row => [
    row.service_id,
    weekdays.map(day => row[day]).join(''),
    row.start_date,
    row.end_date,
  ]);
  const calendarDates = read('calendar_dates').map(row => [row.service_id, row.date, row.exception_type]);
  if (calendar.length) {
    const firstDate = calendar.map(row => row[2]).sort()[0];
    const lastDate = calendar.map(row => row[3]).sort().at(-1);
    const formatDate = date => `${date.slice(6)}.${date.slice(4, 6)}.${date.slice(0, 4)}`;
    label += ` (${formatDate(firstDate)}–${formatDate(lastDate)})`;
  }

  const round6 = value => Number((+value).toFixed(6));
  const round5 = value => Number(value.toFixed(5));
  return {
    id,
    label,
    stops: stops.map(stop => [tidy(stop.stop_name), round6(stop.stop_lat), round6(stop.stop_lon)]),
    routes: routes.map(route => [
      tidy(route.route_short_name || route.route_long_name || ''),
      `#${route.route_color || '1f6f4a'}`,
      `#${route.route_text_color || 'FFFFFF'}`,
    ]),
    svc: services,
    heads: headsigns,
    pats: patterns,
    shapes: packedShapes.map(shape => shape.map(([lat, lon]) => [round5(lat), round5(lon)])),
    trips: packedTrips,
    cal: calendar,
    cd: calendarDates,
  };
}
