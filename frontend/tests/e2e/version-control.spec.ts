import { test, expect } from '@playwright/test';

test.describe('Version Control Smoke Tests', () => {
  test('Version Control page loads and displays repo status', async ({ page }) => {
    await page.goto('/version-control');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Repository' })).toBeVisible();
  });

  test('Version Control shows repository information', async ({ page }) => {
    await page.goto('/version-control');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Remote URL')).toBeVisible();
  });
});
