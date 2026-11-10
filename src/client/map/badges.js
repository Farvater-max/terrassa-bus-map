import { escapeHTML } from '../geometry.js';
import fgcIconUrl from '../../icons/fgc.png';
import renfeIconUrl from '../../icons/renfe.png';

const RAIL_BADGES = {
  fgc: { icon: fgcIconUrl, text: 'FGC', labelKey: 'popup.fgc' },
  renfe: { icon: renfeIconUrl, text: 'Renfe', labelKey: 'popup.renfe' },
};

export function railBadge(kind, translate) {
  const { icon, text, labelKey } = RAIL_BADGES[kind];
  const label = escapeHTML(translate(labelKey));
  return `<span class="${kind}-badge" role="img" aria-label="${label}" title="${label}">
            <img src="${icon}" alt="">
            <span>${text}</span>
          </span>`;
}

export function transferBadge(route) {
  return `<span class="transfer-badge" style="--route-color:${escapeHTML(route.color)};--route-text:${escapeHTML(route.text)}">${escapeHTML(route.short)}</span>`;
}

export function otherRoutesAt(stopIndex, state) {
  const routeIndexes = new Set(state.day
    .filter(trip => trip.pattern.stopIndexes.includes(stopIndex)
      && trip.routeIndex !== state.selectedTrip?.routeIndex)
    .map(trip => trip.routeIndex));

  return [...routeIndexes]
    .sort((left, right) => state.routes[left].short.localeCompare(state.routes[right].short, undefined, { numeric: true }))
    .map(routeIndex => state.routes[routeIndex]);
}
