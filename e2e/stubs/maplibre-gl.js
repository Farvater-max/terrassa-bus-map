class Map {
  constructor(options) {
    this.container = document.getElementById(options.container);
    this.handlers = new globalThis.Map();
    this.zoom = options.zoom;
    this.touchZoomRotate = { disableRotation() {} };
    window.__testMap = this;
    this.container.addEventListener('click', event => {
      const bounds = this.container.getBoundingClientRect();
      this.handlers.get('click')?.({
        point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      });
    });
  }
  on(event, callback) {
    this.handlers.set(event, callback);
    if (event === 'load') queueMicrotask(callback);
    return this;
  }
  project([longitude, latitude]) {
    return {
      x: this.container.clientWidth / 2 + (longitude - 2.02) * 40_000,
      y: this.container.clientHeight / 2 - (latitude - 41.56) * 40_000,
    };
  }
  getZoom() { return this.zoom; }
  isStyleLoaded() { return true; }
  setStyle() {}
  zoomTo(zoom) { this.zoom = zoom; this.handlers.get('move')?.(); }
}

export default { Map };
