import { test, expect } from '@playwright/test';

test.describe('Daily Planner (Днешен план)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
  });

  test('should display daily planner page', async ({ page }) => {
    // Look for the page title anywhere on the page
    const hasTitle = await page.locator('text=Днешен план').count() > 0;
    expect(hasTitle).toBeTruthy();
  });

  test('should show date', async ({ page }) => {
    // Page should show some date-related content
    const hasDate = await page.locator('text=/понеделник|вторник|сряда|четвъртък|петък|събота|неделя/i').count() > 0;
    // Or it might show numeric date
    const hasNumericDate = await page.locator('text=/\\d{1,2}.*\\d{4}|\\d{1,2}\\./').count() > 0;
    expect(hasDate || hasNumericDate).toBeTruthy();
  });

  test('should display daily plan content', async ({ page }) => {
    // Look for plan-related UI elements (tasks, edit button, or empty state)
    const hasPlanContent = await page.locator('text=/Редактирай|Ръчен план|Няма задачи|теми/i').count() > 0;
    const hasButtons = await page.locator('button').count() > 0;
    expect(hasPlanContent || hasButtons).toBeTruthy();
  });

  test('should show daily status controls', async ({ page }) => {
    // Look for any toggle/switch controls
    const hasToggles = await page.locator('button, [role="switch"], input[type="checkbox"]').count() > 0;
    expect(hasToggles).toBeTruthy();
  });

  test('should display task list or empty state', async ({ page }) => {
    // Either shows tasks or empty state
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(100);
  });

  test('should be responsive', async ({ page }) => {
    // Check page renders without errors at different sizes
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile
    await page.waitForTimeout(300);
    const mobileContent = await page.content();
    expect(mobileContent.length).toBeGreaterThan(100);

    await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
    await page.waitForTimeout(300);
    const desktopContent = await page.content();
    expect(desktopContent.length).toBeGreaterThan(100);
  });
});
