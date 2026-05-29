import { test, expect } from '@playwright/test'

test.describe('SQL Workspace Smoke Tests', () => {
  test('opens /sql with collapsed sidebar by default', async ({ page }) => {
    await page.goto('/sql')
    await expect(page.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true')
  })

  test('loads DBeaver-style workbench chrome and supports tab interactions', async ({ page }) => {
    await page.goto('/sql')

    const actionBar = page.getByTestId('editor-action-bar')

    await expect(page.getByRole('toolbar', { name: /sql workbench controls/i })).toBeVisible()
    await expect(actionBar.getByRole('button', { name: /^Run$/ })).toBeVisible()
    await expect(actionBar.getByRole('button', { name: 'New SQL Tab' })).toBeVisible()

    await actionBar.getByRole('button', { name: 'New SQL Tab' }).click()
    await expect(page.locator('[role="tab"]').first()).toBeVisible()

    await page.getByRole('tab', { name: /Output/i }).click()
    await expect(page.getByText(/Execution output/i)).toBeVisible()
  })

  test('shows collapsible navigator on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto('/sql')

    await expect(page.getByRole('button', { name: /show navigator/i })).toBeVisible()
    await page.getByRole('button', { name: /show navigator/i }).click()
    await expect(page.getByRole('button', { name: /hide navigator/i })).toBeVisible()
    await expect(page.locator('.sqlwb-navigator h3').first()).toHaveText('Project Navigator')
  })

  test('supports native fullscreen toggle for SQL workbench', async ({ page }) => {
    await page.goto('/sql')

    const fullscreenButton = page.getByRole('button', { name: /enter full screen/i })

    await expect(fullscreenButton).toBeVisible()
    await fullscreenButton.click()

    await expect.poll(async () => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await expect(page.getByRole('button', { name: /exit full screen/i })).toBeVisible()

    await page.getByRole('button', { name: /exit full screen/i }).click()
    await expect.poll(async () => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
    await expect(page.getByRole('button', { name: /enter full screen/i })).toBeVisible()
  })
})
