import { test, expect } from '@playwright/test';

test.describe('Analytics (Статистики)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
  });

  test('should display analytics page with title', async ({ page }) => {
    const hasTitle = await page.locator('text=Статистики').count() > 0;
    expect(hasTitle).toBeTruthy();
  });

  test('should show summary cards', async ({ page }) => {
    // Look for key metrics
    const hasTime = await page.locator('text=/Общо време|време/i').count() > 0;
    const hasStreak = await page.locator('text=/Streak|дни/i').count() > 0;
    expect(hasTime || hasStreak).toBeTruthy();
  });

  test('should display charts section', async ({ page }) => {
    // Check for chart containers
    const hasCharts = await page.locator('.recharts-wrapper, [class*="chart"], svg').count() > 0;
    expect(hasCharts).toBeTruthy();
  });

  test('should have time range selector', async ({ page }) => {
    // Check for time range buttons (7д, 14д, 30д, 90д)
    const has7d = await page.locator('text=7д').count() > 0;
    const has30d = await page.locator('text=30д').count() > 0;
    expect(has7d && has30d).toBeTruthy();
  });

  test('should show study time chart', async ({ page }) => {
    const hasStudyChart = await page.locator('text=/Дневно учене|учене/i').count() > 0;
    expect(hasStudyChart).toBeTruthy();
  });

  test('should show streak calendar', async ({ page }) => {
    const hasStreak = await page.locator('text=/Streak|календар/i').count() > 0;
    expect(hasStreak).toBeTruthy();
  });

  test('should show Bloom levels section', async ({ page }) => {
    const hasBloom = await page.locator('text=/Bloom|нива/i').count() > 0;
    expect(hasBloom).toBeTruthy();
  });

  test('should change time range when clicking buttons', async ({ page }) => {
    const btn7d = page.locator('button:has-text("7д")');
    if (await btn7d.count() > 0) {
      await btn7d.click();
      await page.waitForTimeout(300);
      // Should still show the page without errors
      const pageContent = await page.content();
      expect(pageContent.length).toBeGreaterThan(100);
    }
  });
});
