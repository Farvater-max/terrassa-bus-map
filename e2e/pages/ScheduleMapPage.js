import { expect } from '@playwright/test';

export class ScheduleMapPage {
  constructor(page) {
    this.page = page;
    this.heading = page.locator('h1');
    this.mapStyle = page.getByTestId('map-style');
    this.mapSurface = page.getByTestId('map-surface');
    this.panel = page.getByTestId('info-panel');
    this.panelTitle = page.locator('#panel-title');
    this.panelClose = page.locator('#panel-close');
    this.languageEs = page.getByTestId('language-select-es');
    this.languageCa = page.getByTestId('language-select-ca');
    this.zoomInButton = page.locator('#zi');
    this.zoomOutButton = page.locator('#zo');
  }

  // Сообщение «автобусов нет» теперь живёт в панели и есть в DOM, только когда автобусов нет
  get notice() { return this.page.getByTestId('panel-notice'); }

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

  async clickZoomIn() {
    await this.zoomInButton.click();
  }

  async clickZoomOut() {
    await this.zoomOutButton.click();
  }

  async clickMapStyle() {
    await this.mapStyle.click();
  }

  async clickPanelClose() {
    await this.panelClose.click();
  }

  async expectHeadingToBe(text) {
    await expect(this.heading, `Expected main heading to be "${text}"`).toHaveText(text);
  }

  async expectMapStyleVisible() {
    await expect(this.mapStyle, 'Expected map style theme toggle button to be visible').toBeVisible();
  }

  async expectMapStyleAriaLabel(label) {
    await expect(this.mapStyle, `Expected map style button to have aria-label "${label}"`).toHaveAttribute('aria-label', label);
  }

  async expectThemeToBe(theme) {
    await expect(this.page.locator('html'),`Expected interface theme to be "${theme}"`,).toHaveAttribute('data-theme', theme);
  }

  async expectLanguagePressed(language, isPressed) {
    const locator = language === 'es' ? this.languageEs : this.languageCa;
    await expect(locator, `Expected language switch button "${language}" to have aria-pressed="${isPressed}"`).toHaveAttribute('aria-pressed', String(isPressed));
  }

  async expectPanelTitle(text) {
    await expect(this.panelTitle, `Expected info panel title to match "${text}"`).toHaveText(text);
  }

  async expectPanelContainsText(text) {
    await expect(this.panel, `Expected info panel to contain "${text}"`).toContainText(text);
  }

  async expectPanelOpen() {
    await expect(this.panel, 'Expected info panel to be open').toHaveAttribute('data-state', 'active');
    await expect(this.panel, 'Expected info panel to be visible').toBeVisible();
  }

  async expectPanelClosed() {
    await expect(this.panel, 'Expected info panel to be closed').toHaveAttribute('data-state', 'idle');
    await expect(this.panel, 'Expected info panel to be hidden').toBeHidden();
  }

  async expectFgcTransferIconVisible() {
    await expect(
      this.panel.getByRole('img', { name: 'Tren FGC' }),
      'Expected FGC transfer icon ("Tren FGC") to be visible in the info panel',
    ).toBeVisible();
  }

  async expectMapZoomToBe(expectedZoom) {
    const currentZoom = await this.page.evaluate(() => window.__testMap.getZoom());
    expect(currentZoom, `Expected map zoom level to be ${expectedZoom}, but got ${currentZoom}`).toBe(expectedZoom);
  }

  async expectMapCenteredOnBus() {
    await expect.poll(() => this.page.evaluate(() => window.__testMap.lastEase?.center ?? null),'Expected the map to ease to the clicked bus').not.toBeNull();
  }
}
