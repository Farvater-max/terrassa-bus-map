import { test } from './fixtures/mapFixture.js';
import { STOPS } from './constants/stops.js';
import { ROUTES } from './constants/routes.js';
import { expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

function configureFeed(feedConfig) {
  feedConfig
    .withStops(STOPS.ESTACIO_RAMBLA, STOPS.PARC_CENTRAL)
    .withRoutes(ROUTES.LINE_1)
    .withHeads(STOPS.PARC_CENTRAL)
    .withShapes([[[STOPS.ESTACIO_RAMBLA.lat, STOPS.ESTACIO_RAMBLA.lon], [STOPS.PARC_CENTRAL.lat, STOPS.PARC_CENTRAL.lon]]])
    .withTrips([0, 36_000, 0, 0, 0]);
}

test('panel is a hidden bottom sheet until something is selected', async ({ feedConfig, mapPage }) => {
  configureFeed(feedConfig);
  await mapPage.goto();

  await mapPage.expectPanelClosed();
  await expect(mapPage.notice).toBeHidden();
});

test('tapping a bus opens the sheet and the close button hides it', async ({ feedConfig, mapPage }) => {
  configureFeed(feedConfig);
  await mapPage.goto();

  await mapPage.clickMapCoordinate(2.021, 41.561);

  await mapPage.expectPanelOpen();
  await mapPage.expectPanelTitle(`Línea ${ROUTES.LINE_1[0]}`);
  await mapPage.expectPanelContainsText(STOPS.PARC_CENTRAL.name);

  await mapPage.clickPanelClose();
  await mapPage.expectPanelClosed();
});

test('tapping an empty spot on the map closes the sheet', async ({ feedConfig, mapPage }) => {
  configureFeed(feedConfig);
  await mapPage.goto();

  await mapPage.clickMapCoordinate(2.021, 41.561);
  await mapPage.expectPanelOpen();

  await mapPage.clickMapCoordinate(2.02, 41.565); // свободное место, выше шторки
  await mapPage.expectPanelClosed();
});

test('tapping a stop shows its transfers in the sheet', async ({ feedConfig, mapPage }) => {
  configureFeed(feedConfig);
  await mapPage.goto();

  await mapPage.clickMapCoordinate(2.021, 41.561);
  await mapPage.clickMapCoordinate(STOPS.ESTACIO_RAMBLA.lon, STOPS.ESTACIO_RAMBLA.lat);

  await mapPage.expectPanelOpen();
  await mapPage.expectPanelTitle(STOPS.ESTACIO_RAMBLA.name);
  await mapPage.expectFgcTransferIconVisible();
});
