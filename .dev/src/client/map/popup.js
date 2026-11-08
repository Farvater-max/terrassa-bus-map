import { escapeHTML, formatTime, nextStopIndex } from '../geometry.js';
import { railConnections } from './rail-connections.js';

const RAIL_BADGES = {
  fgc: { icon: 'fgc', text: 'FGC', labelKey: 'popup.fgc' },
  renfe: { icon: 'renfe', text: 'Renfe', labelKey: 'popup.renfe' },
};

function railBadge(kind, translate) {
  const { icon, text, labelKey } = RAIL_BADGES[kind];
  const label = escapeHTML(translate(labelKey));
  return `<span class="${kind}-badge" role="img" aria-label="${label}" title="${label}">
            <img src="./src/icons/${icon}.png" alt="">
            <span>${text}</span>
          </span>`;
}

function transferBadge(route) {
  return `<span class="transfer-badge" style="--route-color:${escapeHTML(route.color)};--route-text:${escapeHTML(route.text)}">${escapeHTML(route.short)}</span>`;
}

function otherRoutesAt(stopIndex, state) {
  const routeIndexes = new Set(state.day
    .filter(trip => trip.pattern.stopIndexes.includes(stopIndex)
      && trip.routeIndex !== state.selectedTrip?.routeIndex)
    .map(trip => trip.routeIndex));

  return [...routeIndexes]
    .sort((left, right) => state.routes[left].short.localeCompare(state.routes[right].short, undefined, { numeric: true }))
    .map(routeIndex => state.routes[routeIndex]);
}

const describers = {
  bus({ trip }, { frame, buses, translate }) {
    const position = buses.positionOf(trip);
    if (!position) return null;

    const { state } = frame;
    const index = nextStopIndex(trip, state.time);
    const stopName = state.stops[trip.pattern.stopIndexes[index]].name;
    const html = `<b>${escapeHTML(state.routes[trip.routeIndex].short)}</b> → ${escapeHTML(trip.headsign)}<br>`
      + `${escapeHTML(translate('popup.nextStop'))}: ${escapeHTML(stopName)}<br>`
      + `${escapeHTML(translate('popup.scheduledAt'))}: ${formatTime(trip.startTime + trip.pattern.times[index])}`;
    return { ...position, html };
  },

  stop({ stopIndex }, { frame, translate }) {
    const { state } = frame;
    const stop = state.stops[stopIndex];
    const { x, y } = frame.project(stop.x, stop.y);
    const routes = otherRoutesAt(stopIndex, state);
    const { fgc, renfe } = railConnections(stop.name);

    let html = `<b>${escapeHTML(stop.name)}</b>`;
    if (routes.length > 0 || fgc || renfe) {
      const badges = routes.map(transferBadge).join('')
        + (fgc ? railBadge('fgc', translate) : '')
        + (renfe ? railBadge('renfe', translate) : '');
      html += `<br>${escapeHTML(translate('popup.transfers'))} <br><span class="transfer-badges">${badges}</span>`;
    }
    return { x, y, html };
  },
};

export function describePopup(selection, context) {
  const kind = selection.trip ? 'bus' : 'stop';
  return describers[kind](selection, context) ?? null;
}

export function createPopup({ element, translate }) {
  return {
    render(selection, frame, buses) {
      const description = selection && describePopup(selection, { frame, buses, translate });
      if (!description) {
        element.hidden = true;
        return;
      }
      element.hidden = false;
      element.innerHTML = description.html;
      element.style.left = `${description.x}px`;
      element.style.top = `${description.y}px`;
    },
  };
}
