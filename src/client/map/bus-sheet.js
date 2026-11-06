import { formatTime, nextStopIndex } from '../geometry.js';

export function createBusSheet({ root, translate, onClose }) {
  const field = selector => root.querySelector(selector);
  const fields = {
    badge: field('#sheet-badge'),
    title: field('#sheet-title'),
    direction: field('#sheet-direction'),
    stop: field('#sheet-stop'),
    arrival: field('#sheet-arrival'),
    eta: field('#sheet-eta'),
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let open = false;

  const setText = (element, value) => {
    if (element.textContent !== value) element.textContent = value;
  };

  field('#sheet-close').addEventListener('click', onClose);
  root.addEventListener('animationend', event => {
    if (event.animationName !== 'sheet-out') return;
    root.classList.remove('closing');
    root.hidden = true;
  });

  function show() {
    if (open) return;
    open = true;
    root.classList.remove('closing');
    root.hidden = false;
  }

  function hide() {
    if (!open) return;
    open = false;
    if (reduceMotion.matches || root.offsetParent === null) {
      root.hidden = true;
      return;
    }
    root.classList.add('closing');
  }

  function fill(trip, state) {
    const route = state.routes[trip.routeIndex];
    const { stopIndexes } = trip.pattern;
    const index = nextStopIndex(trip, state.time);
    const arrival = trip.startTime + trip.pattern.times[index];
    const minutes = Math.ceil((arrival - state.time) / 60);

    root.style.setProperty('--route-color', route.color);
    root.style.setProperty('--route-text', route.text);
    setText(fields.badge, route.short);
    setText(fields.title, translate('sheet.bus', { route: route.short }));
    setText(fields.direction, `${state.stops[stopIndexes[0]].name} ▸ ${trip.headsign}`);
    setText(fields.stop, state.stops[stopIndexes[index]].name);
    setText(fields.arrival, formatTime(arrival).slice(0, 5));
    setText(fields.eta, minutes > 0 ? translate('sheet.inMinutes', { minutes }) : translate('sheet.arriving'));
  }

  return {
    render(trip, state) {
      const visible = Boolean(trip) && state.time >= trip.startTime && state.time <= trip.endTime;
      if (!visible) {
        hide();
        return;
      }
      show();
      fill(trip, state);
    },
  };
}
