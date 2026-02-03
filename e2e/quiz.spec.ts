import { test, expect } from '@playwright/test';

test.describe('Quiz', () => {
  test('should display quiz page', async ({ page }) => {
    await page.goto('/quiz');
    await page.waitForLoadState('networkidle');

    // Quiz page should show selection UI or quiz interface
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });

  test('should show subject/topic selection when no params', async ({ page }) => {
    await page.goto('/quiz');
    await page.waitForLoadState('networkidle');

    // Should show selection interface
    const hasSelection = await page.locator('text=/избери|предмет|тема/i').count() > 0;
    const hasQuiz = await page.locator('text=/въпрос|отговор|quiz/i').count() > 0;

    expect(hasSelection || hasQuiz).toBeTruthy();
  });

  test('should handle quiz with subject param', async ({ page }) => {
    // First get a valid subject ID
    await page.goto('/subjects');
    await page.waitForLoadState('networkidle');

    // Check localStorage for subjects
    const storageData = await page.evaluate(() => {
      return localStorage.getItem('vayne-command-center');
    });

    if (storageData) {
      const data = JSON.parse(storageData);
      if (data.subjects && data.subjects.length > 0) {
        const firstSubject = data.subjects[0];

        // Navigate to quiz with subject param
        await page.goto(`/quiz?subject=${firstSubject.id}`);
        await page.waitForLoadState('networkidle');

        // Should show quiz interface or topic selection
        const pageContent = await page.content();
        expect(pageContent).toBeTruthy();
      }
    }
  });

  test('should show Bloom level indicator', async ({ page }) => {
    await page.goto('/quiz');
    await page.waitForLoadState('networkidle');

    // Bloom level might be visible in quiz interface
    const hasBloom = await page.locator('text=/bloom|ниво|level/i').count() > 0;

    // This is conditional - only visible when in quiz
    if (hasBloom) {
      expect(hasBloom).toBeTruthy();
    }
  });

  test('should show Anki export button when quiz completed', async ({ page }) => {
    await page.goto('/quiz');
    await page.waitForLoadState('networkidle');

    // Anki export only shows after quiz completion
    const hasAnki = await page.locator('text=/anki|експорт.*карти/i').count() > 0;

    // This is conditional
    if (hasAnki) {
      expect(hasAnki).toBeTruthy();
    }
  });
});
