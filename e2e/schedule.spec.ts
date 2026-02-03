import { test, expect } from '@playwright/test';

test.describe('Schedule (Седмичен график)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/schedule');
    await page.waitForLoadState('networkidle');
  });

  test('should display schedule page with week grid', async ({ page }) => {
    // Check for schedule page content
    const hasTitle = await page.locator('text=Седмичен график').count() > 0;
    expect(hasTitle).toBeTruthy();

    // Check for day headers (short form)
    const hasDays = await page.locator('text=/Пон|Вт|Ср/').count() > 0;
    expect(hasDays).toBeTruthy();
  });

  test('should display academic events section', async ({ page }) => {
    const hasEvents = await page.locator('text=Предстоящи събития').count() > 0;
    expect(hasEvents).toBeTruthy();
  });

  test('should open add class modal', async ({ page }) => {
    const addButton = page.locator('button:has-text("Добави занятие")');
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(300);
      // Modal should open
      const modalVisible = await page.locator('[role="dialog"], .fixed').count() > 0;
      expect(modalVisible).toBeTruthy();
    }
  });

  test('should open add event modal', async ({ page }) => {
    const eventButton = page.locator('button:has-text("Събитие")');
    if (await eventButton.count() > 0) {
      await eventButton.click();
      await page.waitForTimeout(300);
      // Check for event modal content
      const hasEventModal = await page.locator('text=Добави събитие').count() > 0 ||
                           await page.locator('text=Тип събитие').count() > 0;
      expect(hasEventModal).toBeTruthy();
    }
  });

  test('should display event type options in modal', async ({ page }) => {
    const eventButton = page.locator('button:has-text("Събитие")');
    if (await eventButton.count() > 0) {
      await eventButton.click();
      await page.waitForTimeout(300);

      // Check for event types
      const hasColloquium = await page.locator('text=Колоквиум').count() > 0;
      expect(hasColloquium).toBeTruthy();
    }
  });

  test('should show legend with class types', async ({ page }) => {
    const hasLegend = await page.locator('text=Легенда').count() > 0;
    expect(hasLegend).toBeTruthy();
  });

  test('should highlight today in calendar', async ({ page }) => {
    const hasToday = await page.locator('text=ДНЕС').count() > 0;
    expect(hasToday).toBeTruthy();
  });
});
