import { test, expect } from '@playwright/test';

test.describe('Settings (Настройки)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
  });

  test('should display settings page', async ({ page }) => {
    const hasTitle = await page.locator('text=Настройки').count() > 0;
    expect(hasTitle).toBeTruthy();
  });

  test('should show API section', async ({ page }) => {
    const hasAPI = await page.locator('text=/API|Claude|Anthropic|Budget/i').count() > 0;
    expect(hasAPI).toBeTruthy();
  });

  test('should show FSRS settings', async ({ page }) => {
    const hasFSRS = await page.locator('text=FSRS').count() > 0;
    expect(hasFSRS).toBeTruthy();
  });

  test('should show vacation mode toggle', async ({ page }) => {
    const hasVacation = await page.locator('text=/Ваканц|Vacation|Почивка/i').count() > 0;
    expect(hasVacation).toBeTruthy();
  });

  test('should show data management options', async ({ page }) => {
    const hasDataOption = await page.locator('text=/Export|Експорт|Import|Данни|Data/i').count() > 0;
    expect(hasDataOption).toBeTruthy();
  });

  test('should have input controls', async ({ page }) => {
    // Settings page should have various inputs
    const hasInputs = await page.locator('input, select, [role="slider"]').count() > 0;
    expect(hasInputs).toBeTruthy();
  });

  test('should show toggles/switches', async ({ page }) => {
    const hasToggles = await page.locator('button, [role="switch"], input[type="checkbox"]').count() > 0;
    expect(hasToggles).toBeTruthy();
  });
});
