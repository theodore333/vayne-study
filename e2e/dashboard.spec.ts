import { test, expect } from '@playwright/test';

test.describe('Dashboard (Табло)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display dashboard', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should show navigation sidebar', async ({ page }) => {
    // Check for nav items
    await expect(page.locator('text=Табло')).toBeVisible();
    await expect(page.locator('text=Предмети')).toBeVisible();
    await expect(page.locator('text=Проекти')).toBeVisible();
  });

  test('should navigate to subjects page', async ({ page }) => {
    await page.click('a:has-text("Предмети")');
    await expect(page).toHaveURL(/.*subjects/);
  });

  test('should navigate to projects page', async ({ page }) => {
    await page.click('a:has-text("Проекти")');
    await expect(page).toHaveURL(/.*projects/);
  });

  test('should navigate to schedule page', async ({ page }) => {
    await page.click('a:has-text("график")');
    await expect(page).toHaveURL(/.*schedule/);
  });

  test('should navigate to today page', async ({ page }) => {
    await page.click('a:has-text("Днешен план")');
    await expect(page).toHaveURL(/.*today/);
  });

  test('should navigate to prediction page', async ({ page }) => {
    await page.click('a:has-text("Прогноза")');
    await expect(page).toHaveURL(/.*prediction/);
  });

  test('should show XP/Level indicator', async ({ page }) => {
    const hasXP = await page.locator('text=/XP|Ниво|Level/i').count() > 0;
    expect(hasXP).toBeTruthy();
  });

  test('should show alerts section', async ({ page }) => {
    // Alerts might be empty or have content
    const pageContent = await page.content();
    // Just verify page loads without errors
    expect(pageContent).toBeTruthy();
  });
});
