import { test } from './fixtures/mapFixture.js';
import { STOPS } from './constants/stops.js';
import { ROUTES } from './constants/routes.js';
import { expect } from '@playwright/test';

test('loads mocked schedules and updates controls when language changes', async ({ feedConfig, mapPage }) => {
  // given
  feedConfig
      .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
      .withRoutes(ROUTES.LINE_1)
      .withHeads(STOPS.PARC_CENTRAL)
      .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
      .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();

  // then
  await mapPage.expectHeadingToBe('Autobuses de Terrassa según el horario');
  await mapPage.expectMapStyleVisible();
  await mapPage.expectMapStyleAriaLabel('Cambiar a mapa claro');
  await mapPage.expectLanguagePressed('es', true);
  await mapPage.expectLanguagePressed('ca', false);
  await expect(mapPage.notice).toBeHidden();

  // when
  await mapPage.languageCa.click();

  // then
  await mapPage.expectHeadingToBe('Autobusos de Terrassa segons l’horari');
  await mapPage.expectLanguagePressed('ca', true);
});

test('stop popup shows FGC transfers only when the selected stop has one', async ({ feedConfig, mapPage }) => {
  // given
  feedConfig
      .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
      .withRoutes(ROUTES.LINE_1)
      .withHeads(STOPS.PARC_CENTRAL)
      .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
      .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();
  // when
  await mapPage.clickMapCoordinate(2.021, 41.561);
  await mapPage.clickMapCoordinate(STOPS.ESTACIO_RAMBLA.lon, STOPS.ESTACIO_RAMBLA.lat);

  // then
  await mapPage.expectPopupContainsText(STOPS.ESTACIO_RAMBLA.name);
  await mapPage.expectFgcTransferIconVisible();
  await mapPage.expectPopupContainsText('Correspondencias con:');

  // when
  await mapPage.clickMapCoordinate(STOPS.PARC_CENTRAL.lon, STOPS.PARC_CENTRAL.lat);

  // then
  await mapPage.expectPopupText(STOPS.PARC_CENTRAL.name);
});

test('toggles map style / theme when theme button is clicked', async ({ feedConfig, mapPage }) => {
  // given
  feedConfig
    .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
    .withRoutes(ROUTES.LINE_1)
    .withHeads(STOPS.PARC_CENTRAL)
    .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();

  // then
  await mapPage.expectMapStyleVisible();
  await mapPage.expectMapStyleAriaLabel('Cambiar a mapa claro');

  // when
  await mapPage.clickMapStyle();

  // then
  await mapPage.expectMapStyleAriaLabel('Cambiar a mapa oscuro');
});

test('zooms in and out using map control buttons', async ({ feedConfig, mapPage }) => {
  // given
  const startZoom = 14;
  feedConfig
    .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
    .withRoutes(ROUTES.LINE_1)
    .withHeads(STOPS.PARC_CENTRAL)
    .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();

  // when
  await mapPage.clickZoomIn();

  // then
  await mapPage.expectMapZoomToBe(startZoom + 0.5);

  // when
  await mapPage.clickZoomOut();

  // then
  await mapPage.expectMapZoomToBe(startZoom - 0.5);
});

test('shows a notice when no buses are running and the next departure', async ({ page, feedConfig, mapPage }) => {
  feedConfig
      .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
      .withRoutes(ROUTES.LINE_1)
      .withHeads(STOPS.PARC_CENTRAL)
      .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
      .withTrips([0, 36_000, 0, 0, 0]);

  await page.clock.setFixedTime(new Date('2026-11-09T09:00:00'));
  await mapPage.goto();

  await expect(mapPage.notice).toContainText('Ahora mismo no hay autobuses');
  await expect(mapPage.notice).toContainText('Próximo servicio: 10:00');

  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00'));
  await page.reload();
  await expect(mapPage.notice).not.toContainText('Próximo servicio');

  await mapPage.languageCa.click();
  await expect(mapPage.notice).toContainText('Ara mateix no hi ha autobusos');
});
