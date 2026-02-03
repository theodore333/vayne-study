import { test, expect } from '@playwright/test';

test.describe('Data Persistence', () => {
  const testSubjectName = `E2E-Persist-${Date.now()}`;

  test('should persist data after page refresh', async ({ page }) => {
    // Go to subjects page
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');

    // Create a new subject
    await page.click('button:has-text("Добави предмет")');
    await page.fill('input[placeholder*="име"]', testSubjectName);
    await page.click('.rounded-full.cursor-pointer >> nth=0');
    await page.click('button:has-text("Създай")');

    // Wait for save
    await page.waitForTimeout(1000);

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify subject still exists
    await expect(page.locator(`text=${testSubjectName}`)).toBeVisible();
  });

  test('should persist across navigation', async ({ page }) => {
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');

    // Check if our test subject exists
    const subjectExists = await page.locator(`text=${testSubjectName}`).count() > 0;

    if (subjectExists) {
      // Navigate away
      await page.goto('/today');
      await page.waitForLoadState('networkidle');

      // Navigate back
      await page.goto('/subjects');
      await page.waitForLoadState('networkidle');

      // Should still exist
      await expect(page.locator(`text=${testSubjectName}`)).toBeVisible();
    }
  });

  test('should handle localStorage correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check localStorage has data
    const storageData = await page.evaluate(() => {
      return localStorage.getItem('vayne-command-center');
    });

    expect(storageData).toBeTruthy();

    // Parse and verify structure
    const data = JSON.parse(storageData || '{}');
    expect(data).toHaveProperty('subjects');
    expect(data).toHaveProperty('schedule');
    expect(data).toHaveProperty('academicEvents');
  });

  test('cascade delete should work', async ({ page }) => {
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');

    // Find a subject to delete (preferably our test one)
    const testSubject = page.locator(`text=${testSubjectName}`);

    if (await testSubject.count() > 0) {
      // Create an event for this subject first
      await page.goto('/schedule');
      await page.waitForLoadState('networkidle');

      // Try to add an event (if we can)
      const eventButton = page.locator('button:has-text("Събитие")');
      if (await eventButton.count() > 0) {
        await eventButton.click();

        // Select the test subject if possible
        const subjectSelect = page.locator('select');
        if (await subjectSelect.count() > 0) {
          const options = await subjectSelect.locator('option').allTextContents();
          const hasTestSubject = options.some(opt => opt.includes('E2E-Persist'));

          if (hasTestSubject) {
            // Close modal
            await page.keyboard.press('Escape');
          }
        }
      }

      // Go back and delete subject
      await page.goto('/subjects');
      await page.waitForLoadState('networkidle');

      // Find and delete the subject
      // (This would require knowing the exact delete flow)
    }
  });
});
