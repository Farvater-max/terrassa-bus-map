import { expect } from '@playwright/test';

export class ScheduleMapPage {
  constructor(page) {
    this.page = page;
    this.heading = page.locator('h1');
    this.routeFilters = page.getByTestId('route-filters');
    this.serviceStatus = page.getByTestId('service-status');
    this.playToggle = page.getByTestId('play-toggle');
    this.mapStyle = page.getByTestId('map-style');
    this.timeSlider = page.getByTestId('time-slider');
    this.mapSurface = page.getByTestId('map-surface');
    this.mapPopup = page.getByTestId('map-popup');
    this.languageEs = page.getByTestId('language-select-es');
    this.languageCa = page.getByTestId('language-select-ca');
    this.zoomInButton = page.locator('#zi');
    this.zoomOutButton = page.locator('#zo');
  }

  async goto() {
    await this.page.goto('/');
  }

  async clickMapCoordinate(longitude, latitude) {
    const point = await this.page.evaluate(
      ([lon, lat]) => window.__testMap.project([lon, lat]),
      [longitude, latitude]
    );
    await this.mapSurface.click({ position: point });
  }

  async setTimeSliderValue(value) {
    await this.timeSlider.evaluate((slider, val) => {
      slider.value = val;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }

  async clickZoomIn() {
    await this.zoomInButton.click();
  }

  async clickZoomOut() {
    await this.zoomOutButton.click();
  }

  async clickMapStyle() {
    await this.mapStyle.click();
  }

  async expectHeadingToBe(text) {
    await expect(this.heading, `Expected main heading to be "${text}"`).toHaveText(text);
  }

  async expectRouteFilterVisible(routeNumber) {
    await expect(this.routeFilters.getByText(routeNumber), `Expected route filter for route "${routeNumber}" to be visible`).toBeVisible();
  }

  async expectServiceStatusContains(text) {
    await expect(this.serviceStatus, `Expected service status block to contain text "${text}"`).toContainText(text);
  }

  async expectPlayToggleText(text) {
    await expect(this.playToggle, `Expected play toggle button text to be "${text}"`).toHaveText(text);
  }

  async expectMapStyleVisible() {
    await expect(this.mapStyle, `Expected map style theme toggle button to be visible`).toBeVisible();
  }

  async expectMapStyleAriaLabel(label) {
    await expect(this.mapStyle, `Expected map style button to have aria-label "${label}"`).toHaveAttribute('aria-label', label);
  }

  async expectLanguagePressed(language, isPressed) {
    const locator = language === 'es' ? this.languageEs : this.languageCa;
    await expect(locator, `Expected language switch button "${language}" to have aria-pressed="${isPressed}"`).toHaveAttribute('aria-pressed', String(isPressed));
  }

  async expectPopupContainsText(text) {
    await expect(this.mapPopup, `Expected map popup to contain text "${text}"`
    ).toContainText(text);
  }

  async expectPopupText(text) {
    await expect(this.mapPopup, `Expected map popup text to be exactly "${text}"`).toHaveText(text);
  }

  async expectFgcTransferIconVisible() {
    await expect(this.mapPopup.getByRole('img', { name: 'Tren FGC' }), `Expected FGC transfer icon ("Tren FGC") to be visible inside the stop popup`).toBeVisible();
  }

  async expectMapZoomToBe(expectedZoom) {
    const currentZoom = await this.page.evaluate(() => window.__testMap.getZoom());
    expect(currentZoom, `Expected map zoom level to be ${expectedZoom}, but got ${currentZoom}`).toBe(expectedZoom);
  }
}
