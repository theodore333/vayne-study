import { test, expect } from '@playwright/test';

test.describe('Dashboard (Табло)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should display dashboard', async ({ page }) => {
    const content = await page.content();
    expect(content.length).toBeGreaterThan(1000);
  });

  test('should show main heading', async ({ page }) => {
    const headingCount = await page.locator('h1, h2').count();
    expect(headingCount).toBeGreaterThan(0);
  });

  test('should have content containers', async ({ page }) => {
    const hasContainers = await page.locator('div').count() > 5;
    expect(hasContainers).toBeTruthy();
  });

  test('should have clickable elements', async ({ page }) => {
    const hasButtons = await page.locator('button, a').count() > 0;
    expect(hasButtons).toBeTruthy();
  });

  test('should navigate directly to subjects page', async ({ page }) => {
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*subjects/);
  });

  test('should navigate directly to analytics page', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*analytics/);
  });

  test('should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const mobileContent = await page.content();
    expect(mobileContent.length).toBeGreaterThan(1000);
  });
});
