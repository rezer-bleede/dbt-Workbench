import { test, expect } from '@playwright/test';

test.describe('File Editor Smoke Tests', () => {
  test('File Editor page loads and displays project files section', async ({ page }) => {
    await page.goto('/file-editor');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'File Editor' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Project Files' })).toBeVisible();
  });
});
