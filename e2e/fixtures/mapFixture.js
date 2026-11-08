import { test as base } from '@playwright/test';
import { ScheduleMapPage } from '../pages/ScheduleMapPage.js';
import { FeedConfigurator } from '../configurators/FeedConfigurator.js';

export const test = base.extend({
  feedConfig: async ({}, use) => {
    await use(new FeedConfigurator());
  },

  mapPage: async ({ page, feedConfig }, use) => {
    await page.route('https://supabase.test/rest/v1/feeds**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ data: feedConfig.build(), updated_at: '2026-11-02T12:00:00.000Z' }]),
    }));
    await use(new ScheduleMapPage(page));
  },
});
