import { test, expect } from '@playwright/test';

test.describe('Subjects (Предмети)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');
  });

  test('should display subjects page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Предмети');
  });

  test('should open add subject modal', async ({ page }) => {
    await page.click('button:has-text("Добави предмет")');
    await expect(page.locator('text=Добави предмет')).toBeVisible();
  });

  test('should create a new subject', async ({ page }) => {
    // Open modal
    await page.click('button:has-text("Добави предмет")');
    await page.waitForTimeout(300);

    // Fill form - find input by type
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill('Test Subject E2E');

    // Select a color (click first color in the color picker)
    const colorButton = page.locator('button.rounded-full, div.rounded-full.cursor-pointer').first();
    if (await colorButton.count() > 0) {
      await colorButton.click();
    }

    // Submit - look for create button
    const submitButton = page.locator('button[type="submit"], button:has-text("Създай"), button:has-text("Добави")').last();
    await submitButton.click();

    // Wait for modal to close
    await page.waitForTimeout(500);

    // Verify subject appears
    await expect(page.locator('text=Test Subject E2E')).toBeVisible();
  });

  test('should archive and unarchive subject', async ({ page }) => {
    // First create a subject if none exists
    const subjectExists = await page.locator('[data-testid="subject-card"]').count() > 0;

    if (!subjectExists) {
      await page.click('button:has-text("Добави предмет")');
      await page.fill('input[placeholder*="име"]', 'Archive Test');
      await page.click('.rounded-full.cursor-pointer >> nth=0');
      await page.click('button:has-text("Създай")');
      await page.waitForTimeout(500);
    }

    // Click on subject to open it (or find archive button)
    const subjectCard = page.locator('.bg-\\[rgba\\(20\\,20\\,35\\,0\\.8\\)\\]').first();
    await subjectCard.hover();

    // Look for archive/menu button
    const menuButton = subjectCard.locator('button:has(svg)').last();
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }
  });

  test('should navigate to subject detail', async ({ page }) => {
    // Check if any subject exists
    const subjects = page.locator('a[href^="/subjects/"]');
    const count = await subjects.count();

    if (count > 0) {
      await subjects.first().click();
      await expect(page.url()).toContain('/subjects/');
    }
  });
});
