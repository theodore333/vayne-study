import { test, expect } from '@playwright/test';

test.describe('Projects (Проекти)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
  });

  test('should display projects page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Проекти');
  });

  test('should have add project button', async ({ page }) => {
    await expect(page.locator('button:has-text("Нов проект")')).toBeVisible();
  });

  test('should open add project modal', async ({ page }) => {
    await page.click('button:has-text("Нов проект")');
    await expect(page.locator('text=Създай проект')).toBeVisible();
  });

  test('should show project type options', async ({ page }) => {
    await page.click('button:has-text("Нов проект")');

    // Check for type dropdown/options
    await expect(page.locator('text=Курс')).toBeVisible();
  });

  test('should show project category options', async ({ page }) => {
    await page.click('button:has-text("Нов проект")');

    await expect(page.locator('text=Мета-учене')).toBeVisible();
  });

  test('should show priority options', async ({ page }) => {
    await page.click('button:has-text("Нов проект")');

    await expect(page.locator('text=Висок')).toBeVisible();
    await expect(page.locator('text=Среден')).toBeVisible();
    await expect(page.locator('text=Нисък')).toBeVisible();
  });

  test('should create a new project', async ({ page }) => {
    await page.click('button:has-text("Нов проект")');

    // Fill project name
    await page.fill('input[placeholder*="Име"]', 'E2E Test Project');

    // Submit
    await page.click('button:has-text("Създай")');

    // Wait for modal to close and project to appear
    await page.waitForTimeout(500);
    await expect(page.locator('text=E2E Test Project')).toBeVisible();
  });

  test('should show filter tabs', async ({ page }) => {
    await expect(page.locator('text=Активни')).toBeVisible();
    await expect(page.locator('text=Завършени')).toBeVisible();
    await expect(page.locator('text=Всички')).toBeVisible();
  });
});
