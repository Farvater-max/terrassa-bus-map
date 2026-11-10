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
  await mapPage.expectPanelTitle('Autobuses en servicio: 1');
  await expect(mapPage.notice).toBeHidden();

  // when
  await mapPage.languageCa.click();

  // then
  await mapPage.expectHeadingToBe('Autobusos de Terrassa segons l’horari');
  await mapPage.expectLanguagePressed('ca', true);
  await mapPage.expectPanelTitle('Autobusos en servei: 1');
});

test('bus panel shows the selected bus and closes with the close button', async ({ feedConfig, mapPage }) => {
  // given
  feedConfig
      .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
      .withRoutes(ROUTES.LINE_1)
      .withHeads(STOPS.PARC_CENTRAL)
      .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
      .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();
  await mapPage.expectPanelTitle(/Autobuses en servicio/);

  // when: в 10:05 автобус находится в этой точке (та же, что и в тесте остановки)
  await mapPage.clickMapCoordinate(2.021, 41.561);

  // then
  await mapPage.expectPanelTitle(`Línea ${ROUTES.LINE_1[0]}`);
  await mapPage.expectPanelContainsText(STOPS.PARC_CENTRAL.name);

  // when
  await mapPage.clickPanelClose();

  // then
  await mapPage.expectPanelTitle(/Autobuses en servicio/);
});

test('stop panel shows FGC transfers only when the selected stop has one', async ({ feedConfig, mapPage }) => {
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
  await mapPage.expectPanelTitle(STOPS.ESTACIO_RAMBLA.name);
  await mapPage.expectFgcTransferIconVisible();
  await mapPage.expectPanelContainsText('Correspondencias con:');

  // when
  await mapPage.clickMapCoordinate(STOPS.PARC_CENTRAL.lon, STOPS.PARC_CENTRAL.lat);

  // then
  await mapPage.expectPanelTitle(STOPS.PARC_CENTRAL.name);
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
  await mapPage.expectThemeToBe('dark');

  // when
  await mapPage.clickMapStyle();

  // then
  await mapPage.expectMapStyleAriaLabel('Cambiar a mapa oscuro');
  await mapPage.expectThemeToBe('light');

  // when
  await mapPage.clickMapStyle();

  // then
  await mapPage.expectThemeToBe('dark');
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

  // then
  await expect(mapPage.notice).toContainText('Ahora mismo no hay autobuses');
  await expect(mapPage.notice).toContainText('Próximo servicio: 10:00');

  // when
  await page.clock.setFixedTime(new Date('2026-11-09T12:00:00'));
  await page.reload();

  // then
  await expect(mapPage.notice).not.toContainText('Próximo servicio');

  // when
  await mapPage.languageCa.click();

  // then
  await expect(mapPage.notice).toContainText('Ara mateix no hi ha autobusos');
});

test('clicking a bus centers the map on it', async ({ feedConfig, mapPage }) => {
  feedConfig
      .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
      .withRoutes(ROUTES.LINE_1)
      .withHeads(STOPS.PARC_CENTRAL)
      .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
      .withTrips([0, 36_000, 0, 0, 0]);

  await mapPage.goto();
  await mapPage.clickMapCoordinate(2.021, 41.561);

  await mapPage.expectMapCenteredOnBus();
});
