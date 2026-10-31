import { latitudeToY, longitudeToX, readableRouteColor } from './geometry.js';

export function prepareSchedule(schedule) {
  const stops = schedule.stops.map(([name, latitude, longitude]) => ({
    name,
    x: longitudeToX(longitude),
    y: latitudeToY(latitude),
  }));
  const routes = schedule.routes.map(([short, color, text]) => ({
    short,
    color,
    text,
    lineColor: readableRouteColor(color),
  }));
  const shapes = (schedule.shapes || []).map(coordinates => {
    const points = coordinates.map(([latitude, longitude]) => [
      longitudeToX(longitude),
      latitudeToY(latitude),
    ]);
    const cumulativeDistances = [0];
    for (let index = 1; index < points.length; index++) {
      cumulativeDistances.push(cumulativeDistances[index - 1] + Math.hypot(
        points[index][0] - points[index - 1][0],
        points[index][1] - points[index - 1][1],
      ));
    }
    return { points, cumulativeDistances };
  });
  const trips = schedule.trips.map((packedTrip, id) => {
    const [patternIndex, startTime, routeIndex, serviceIndex, headsignIndex] = packedTrip;
    const packedPattern = schedule.patterns?.[patternIndex] ?? schedule.pats[patternIndex];
    const [stopIndexes, times, shapeIndex, shapeIndexes] = packedPattern;
    const pattern = {
      stopIndexes,
      times,
      shapeIndex,
      shapeIndexes,
    };
    return {
      id,
      pattern,
      startTime,
      routeIndex,
      service: schedule.svc[serviceIndex],
      headsign: schedule.heads[headsignIndex],
      endTime: startTime + times.at(-1),
    };
  });

  return { schedule, stops, routes, shapes, trips };
}

export function servicesForDate(schedule, ymd, ignoreDateRange = false) {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const date = Number(ymd.slice(6));
  const weekday = new Date(year, month, date).getDay();
  const services = new Set();

  schedule.cal.forEach(([service, weekdays, start, end]) => {
    if (weekdays[weekday] === '1' && (ignoreDateRange || (start <= ymd && ymd <= end))) {
      services.add(service);
    }
  });
  if (!ignoreDateRange) {
    schedule.cd.forEach(([service, exceptionDate, exceptionType]) => {
      if (exceptionDate !== ymd) return;
      exceptionType === '1' ? services.add(service) : services.delete(service);
    });
  }
  return services;
}

function scheduleDateSpan(schedule) {
  if (!schedule.cal.length) return Infinity;
  const starts = schedule.cal.map(calendar => Number(calendar[2]));
  const ends = schedule.cal.map(calendar => Number(calendar[3]));
  return Math.max(...ends) - Math.min(...starts);
}

export function selectSchedule(schedules, ymd, mode, translate) {
  let schedule;
  let note = '';
  if (mode === 'auto') {
    const active = schedules
      .filter(item => servicesForDate(item, ymd).size)
      .sort((left, right) => scheduleDateSpan(left) - scheduleDateSpan(right));
    schedule = active[0] || schedules[0];
    if (!active.length) note = translate('status.outOfRangeAuto');
  } else {
    schedule = schedules.find(item => item.id === mode) || schedules[0];
  }

  let services = servicesForDate(schedule, ymd);
  if (!services.size) {
    services = servicesForDate(schedule, ymd, true);
    note = translate('status.outOfRangeSelected');
  }
  return { schedule, services, note };
}
