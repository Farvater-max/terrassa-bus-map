import { test as base } from '@playwright/test';
import { ScheduleMapPage } from '../pages/ScheduleMapPage.js';
import { FeedConfigurator } from '../configurators/FeedConfigurator.js';

const mapLibreStub = `
  window.maplibregl = {
    Map: class {
      constructor(options) {
        this.container = document.getElementById(options.container);
        this.handlers = new Map();
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
    },
  };
`;

export const test = base.extend({
  feedConfig: async ({}, use) => {
    const configurator = new FeedConfigurator();
    await use(configurator);
  },

  mapPage: async ({ page, feedConfig }, use) => {
    await page.route('https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js', route => (
      route.fulfill({ contentType: 'application/javascript', body: mapLibreStub })
    ));
    await page.route('https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css', route => (
      route.fulfill({ contentType: 'text/css', body: '' })
    ));
    await page.route('https://supabase.test/rest/v1/feeds**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ data: feedConfig.build(), updated_at: '2026-11-02T12:00:00.000Z' }]),
    }));

    const mapPage = new ScheduleMapPage(page);
    await use(mapPage);
  },
});
