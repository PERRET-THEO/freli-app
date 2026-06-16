import { test, expect } from '@playwright/test'

test.describe('Freli public pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Freli/i }).first()).toBeVisible()
  })

  test('sign-in page loads', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible()
  })

  test('mobile navbar opens menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: /ouvrir le menu/i }).click()
    await expect(page.getByRole('link', { name: /Fonctionnalités/i })).toBeVisible()
  })
})
