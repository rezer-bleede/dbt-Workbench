import { test, expect } from '@playwright/test';

test('Plugins page loads and shows adapters', async ({ page }) => {
    // Go to plugins page
    await page.goto('/plugins');

    // Check header
    await expect(page.getByRole('heading', { name: 'Installed Plugins' })).toBeVisible();

    // Check Adapter Suggestions section
    await expect(page.getByRole('heading', { name: 'dbt Adapters' })).toBeVisible();

    // Check table headers
    await expect(page.getByText('Type')).toBeVisible();
    await expect(page.getByText('Package')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();

    // Wait for loading to finish
    await expect(page.getByText('Loading plugins...')).not.toBeVisible();
});
