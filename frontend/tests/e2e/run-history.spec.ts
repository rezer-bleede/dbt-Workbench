import { test, expect } from '@playwright/test';

test('Run History page should display the heading', async ({ page }) => {
  await page.goto('/run-history');
  await expect(page.getByRole('heading', { level: 1, name: 'Run History' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Command' })).toBeVisible();
});
