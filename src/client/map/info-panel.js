import { escapeHTML, formatTime, nextStopIndex } from '../geometry.js';
import { otherRoutesAt, railBadge, transferBadge } from './badges.js';
import { railConnections } from './rail-connections.js';

const MAX_UPCOMING = 6;
const hhmm = seconds => formatTime(seconds).slice(0, 5);

export function createInfoPanel({ root, translate, onClose }) {
  const mobile = matchMedia('(max-width: 640px)');
  const badge = root.querySelector('#panel-badge');
  const title = root.querySelector('#panel-title');
  const body = root.querySelector('#panel-body');
  const close = root.querySelector('#panel-close');
  const last = { badge: null, title: null, body: null };

  close.addEventListener('click', onClose);

  function idleView({ visibleBuses, message }) {
    const text = message
      ? `<p class="panel-notice" data-testid="panel-notice">${escapeHTML(message)}</p>`
      : `<p class="panel-hint">${escapeHTML(translate('panel.hint'))}</p>`;
    return { title: translate('panel.inService', { buses: visibleBuses }), body: text };
  }

  function busView(trip, state) {
    const route = state.routes[trip.routeIndex];
    const { stopIndexes, times } = trip.pattern;
    const index = nextStopIndex(trip, state.time);
    const arrival = trip.startTime + times[index];
    const minutes = Math.ceil((arrival - state.time) / 60);
    const eta = minutes > 0 ? translate('sheet.inMinutes', { minutes }) : translate('sheet.arriving');

    const rest = stopIndexes.slice(index + 1);
    const shown = rest.slice(0, MAX_UPCOMING);
    const upcoming = shown.map((stopIndex, offset) => (
      `<li><span>${escapeHTML(state.stops[stopIndex].name)}</span>`
      + `<time>${hhmm(trip.startTime + times[index + 1 + offset])}</time></li>`
    )).join('');
    const more = rest.length - shown.length;

    return {
      route,
      closable: true,
      badge: route.short,
      title: translate('sheet.bus', { route: route.short }),
      body: `<div class="panel-direction">${escapeHTML(state.stops[stopIndexes[0]].name)} ▸ ${escapeHTML(trip.headsign)}</div>`
        + `<div class="sheet-stop">`
        + `<span class="sheet-dot"></span>`
        + `<div class="sheet-stop-text"><small>${escapeHTML(translate('popup.nextStop'))}</small>`
        + `<span class="panel-stop-name">${escapeHTML(state.stops[stopIndexes[index]].name)}</span></div>`
        + `<div class="sheet-time"><b>${hhmm(arrival)}</b><small>${escapeHTML(eta)}</small></div>`
        + `</div>`
        + (shown.length ? `<ol class="panel-stops">${upcoming}</ol>` : '')
        + (more > 0 ? `<p class="panel-more">${escapeHTML(translate('panel.moreStops', { count: more }))}</p>` : ''),
    };
  }

  function stopView(stopIndex, state) {
    const stop = state.stops[stopIndex];
    const routes = otherRoutesAt(stopIndex, state);
    const { fgc, renfe } = railConnections(stop.name);
    const badges = routes.map(transferBadge).join('')
      + (fgc ? railBadge('fgc', translate) : '')
      + (renfe ? railBadge('renfe', translate) : '');

    return {
      closable: true,
      title: stop.name,
      body: badges
        ? `<div class="panel-label">${escapeHTML(translate('popup.transfers'))}</div>`
          + `<div class="transfer-badges">${badges}</div>`
        : `<p class="panel-hint">${escapeHTML(translate('panel.noTransfers'))}</p>`,
    };
  }

  function apply(view) {
    if (view.route) {
      root.style.setProperty('--route-color', view.route.color);
      root.style.setProperty('--route-text', view.route.text);
    } else {
      root.style.removeProperty('--route-color');
      root.style.removeProperty('--route-text');
    }
    const badgeText = view.badge ?? '';
    if (last.badge !== badgeText) {
      last.badge = badgeText;
      badge.textContent = badgeText;
      badge.hidden = !badgeText;
    }
    if (last.title !== view.title) {
      last.title = view.title;
      title.textContent = view.title;
    }
    if (last.body !== view.body) {
      last.body = view.body;
      body.innerHTML = view.body;
    }
    close.hidden = !view.closable;
  }

  return {
    render({ selection, state, visibleBuses, message }) {
      const trip = selection?.trip;
      let view = null;
      if (trip && state.time >= trip.startTime && state.time <= trip.endTime) {
        view = busView(trip, state);
      } else if (!trip && selection?.stopIndex != null) {
        view = stopView(selection.stopIndex, state);
      }

      root.dataset.state = view ? 'active' : 'idle';
      if (view) apply(view);
      else if (!mobile.matches) apply(idleView({ visibleBuses, message }));
    },
  };
}
