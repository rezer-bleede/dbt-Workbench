import { test, expect } from '@playwright/test';

test('Plugins page loads and shows adapters', async ({ page }) => {
  await page.goto('/plugins/installed');

  await expect(page.getByRole('heading', { name: 'dbt Adapters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Plugins' })).toBeVisible();

  const adapterTable = page.getByRole('table').first();
  await expect(adapterTable.getByRole('columnheader', { name: 'Type' })).toBeVisible();
  await expect(adapterTable.getByRole('columnheader', { name: 'Package' })).toBeVisible();
  await expect(adapterTable.getByRole('columnheader', { name: 'Status' })).toBeVisible();
});
