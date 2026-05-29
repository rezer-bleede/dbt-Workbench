import { test, expect } from '@playwright/test';

test.describe('Lineage Smoke Tests', () => {
  test('Lineage page loads and displays graph container', async ({ page }) => {
    await page.goto('/lineage');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI Explain Lineage' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Grouping' })).toBeVisible();
  });

  test('Lineage graph container is visible', async ({ page }) => {
    await page.goto('/lineage');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByTestId('lineage-graph-container')).toBeVisible();
  });
});
