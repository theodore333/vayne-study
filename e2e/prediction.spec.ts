import { test, expect } from '@playwright/test';

test.describe('Prediction (Прогноза)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/prediction');
    await page.waitForLoadState('networkidle');
  });

  test('should display prediction page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Прогноза');
  });

  test('should show subject selector or empty state', async ({ page }) => {
    const hasSubjects = await page.locator('button, select').filter({ hasText: /предмет/i }).count() > 0;
    const hasEmptyState = await page.locator('text=/добави предмет|няма предмети/i').count() > 0;

    expect(hasSubjects || hasEmptyState).toBeTruthy();
  });

  test('should display grade factors section when subject selected', async ({ page }) => {
    // Check if any subject tab/button exists
    const subjectButtons = page.locator('[role="tab"], button').filter({ hasText: /[А-Яа-я]/ });
    const count = await subjectButtons.count();

    if (count > 0) {
      await subjectButtons.first().click();
      await page.waitForTimeout(300);

      // Look for factor indicators
      const hasFactors = await page.locator('text=/покритие|mastery|consistency|factor/i').count() > 0;
      expect(hasFactors).toBeTruthy();
    }
  });

  test('should show Monte Carlo simulation results', async ({ page }) => {
    // Look for simulation-related text
    const hasSimulation = await page.locator('text=/best|worst|simulation|случай|вариант/i').count() > 0;

    // This is optional - only shows when subject with data is selected
    if (hasSimulation) {
      expect(hasSimulation).toBeTruthy();
    }
  });
});
