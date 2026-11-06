import { expect, test } from '@playwright/test';

const feed = {
  id: 'main',
  label: 'Main schedule',
  stops: [
    ['Estació Rambla', 41.56, 2.02],
    ['Parc Central', 41.562, 2.022],
  ],
  routes: [['1', '#1769aa', '#ffffff']],
  svc: ['weekday'],
  heads: ['Parc Central'],
  pats: [[[0, 1], [0, 600], 0, [0, 1]]],
  shapes: [[[41.56, 2.02], [41.562, 2.022]]],
  trips: [[0, 36_000, 0, 0, 0]],
  cal: [['weekday', '1111111', '20260101', '20271231']],
  cd: [],
};

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

test.beforeEach(async ({ page }) => {
  await page.route('https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js', route => (
    route.fulfill({ contentType: 'application/javascript', body: mapLibreStub })
  ));
  await page.route('https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css', route => (
    route.fulfill({ contentType: 'text/css', body: '' })
  ));
  await page.route('https://supabase.test/rest/v1/feeds**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ data: feed, updated_at: '2026-11-02T12:00:00.000Z' }]),
  }));
});

test('loads mocked schedules and updates controls when language changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Autobuses de Terrassa según el horario');
  await expect(page.getByTestId('route-filters').getByText('1')).toBeVisible();
  await expect(page.getByTestId('service-status')).toContainText('viajes del día: 1');

  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveText('Reproducir');
  await expect(page.getByTestId('map-style')).toBeVisible();
  await expect(page.getByTestId('map-style')).toHaveAttribute('aria-label', 'Cambiar a mapa claro');
  await expect(page.getByTestId('language-select-es')).toBeVisible();
  await expect(page.getByTestId('language-select-es')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('language-select-ca')).toBeVisible();
  await expect(page.getByTestId('language-select-ca')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('language-select-ca')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('language-select-ca').click();

  await expect(page.locator('h1')).toHaveText('Autobusos de Terrassa segons l’horari');
  await expect(page.getByTestId('service-status')).toContainText('viatges del dia: 1');
  await expect(page.getByTestId('language-select-ca')).toHaveAttribute('aria-pressed', 'true');
});

test('stop popup shows FGC transfers only when the selected stop has one', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-toggle').click();
  await page.getByTestId('time-slider').evaluate(slider => {
    slider.value = '36300';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByTestId('service-status')).toContainText('Autobuses en servicio: 1');

  const clickMapCoordinate = async (longitude, latitude) => {
    const point = await page.evaluate(([lon, lat]) => window.__testMap.project([lon, lat]), [longitude, latitude]);
    await page.getByTestId('map-surface').click({ position: point });
  };

  await clickMapCoordinate(2.021, 41.561);
  await clickMapCoordinate(2.02, 41.56);
  const popup = page.getByTestId('map-popup');
  await expect(popup).toContainText('Estació Rambla');
  await expect(popup.getByRole('img', { name: 'Tren FGC' })).toBeVisible();
  await expect(popup).toContainText('Correspondencias con:');

  await clickMapCoordinate(2.022, 41.562);
  await expect(popup).toHaveText('Parc Central');
});
