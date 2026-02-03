import { test, expect } from '@playwright/test';

test.describe('Timer (Таймер)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/timer');
    await page.waitForLoadState('networkidle');
  });

  test('should display timer page', async ({ page }) => {
    // Timer should show time display
    await expect(page.locator('text=/\\d{2}:\\d{2}/').first()).toBeVisible();
  });

  test('should have start button', async ({ page }) => {
    const startButton = page.locator('button:has-text("Старт"), button:has-text("Start")');
    const stopButton = page.locator('button:has-text("Стоп"), button:has-text("Stop")');

    // Either start or stop should be visible depending on timer state
    const hasControl = await startButton.count() > 0 || await stopButton.count() > 0;
    expect(hasControl).toBeTruthy();
  });

  test('should show subject selector', async ({ page }) => {
    const hasSelector = await page.locator('select, [role="combobox"], button:has-text("Избери")').count() > 0;
    expect(hasSelector).toBeTruthy();
  });

  test('should show pomodoro settings', async ({ page }) => {
    const hasPomodoro = await page.locator('text=/pomodoro|помодоро|фокус|пауза/i').count() > 0;
    expect(hasPomodoro).toBeTruthy();
  });

  test('should show session history', async ({ page }) => {
    const hasHistory = await page.locator('text=/история|сесии|днес/i').count() > 0;
    expect(hasHistory).toBeTruthy();
  });
});
