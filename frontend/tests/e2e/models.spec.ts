import { test, expect } from '@playwright/test';

test.describe('Models Smoke Tests', () => {
  test('Models page loads and displays models list', async ({ page }) => {
    await page.goto('/models');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByPlaceholder('Search models')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  });

  test('Models list contains at least one model', async ({ page }) => {
    await page.goto('/models');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(8);
  });
});
