import { test, expect } from '@playwright/test';

test.describe('Dashboard Smoke Tests', () => {
  test('Dashboard page loads and displays key elements', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Project Overview')).toBeVisible();
    await expect(page.getByText('Total Models')).toBeVisible();
  });

  test('Dashboard shows system health status', async ({ page }) => {
    await page.goto('/');

    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
    await expect(page.getByText(/System:\s*(ok|error)/i)).toBeVisible();
  });
});
