export class FeedConfigurator {
  constructor() {
    const randomId = Math.floor(Math.random() * 100000);
    this.data = {
      id: `schedule-${randomId}`,
      label: `Schedule ${randomId}`,
      stops: [],
      routes: [],
      svc: ['weekday'],
      heads: [],
      pats: [[[0, 1], [0, 600], 0, [0, 1]]],
      shapes: [],
      trips: [],
      cal: [['weekday', '1111111', '20260101', '20271231']],
      cd: [],
    };
  }

  withStops(...stops) {
    this.data.stops = stops.flat().map(stop =>
      Array.isArray(stop) ? stop : [stop.name, stop.lat, stop.lon]
    );
    return this;
  }

  withRoutes(...routes) {
    const flattened = routes.flat();
    this.data.routes = (flattened.length > 0 && typeof flattened[0] === 'string')
      ? [flattened]
      : flattened;
    return this;
  }

  withTrips(...trips) {
    const flattened = trips.flat();
    this.data.trips = Array.isArray(flattened[0]) ? flattened : [flattened];
    return this;
  }

  withHeads(...heads) {
    this.data.heads = heads.flat().map(head =>
      typeof head === 'string' ? head : head.name
    );
    return this;
  }

  withShapes(...shapes) {
    this.data.shapes = shapes.flat();
    return this;
  }

  withPats(...pats) {
    this.data.pats = pats.flat();
    return this;
  }

  build() {
    return this.data;
  }
}
