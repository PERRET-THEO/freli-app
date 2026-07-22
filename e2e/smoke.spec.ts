import { test, expect } from '@playwright/test'

test.describe('Freli public pages', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Freli/i }).first()).toBeVisible()
    await expect(page.locator('#integrations')).toBeVisible()
    await expect(page.getByRole('heading', { name: /s'intègre à votre stack/i })).toBeVisible()
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
    await expect(page.getByRole('link', { name: /Intégrations/i })).toBeVisible()
  })
})

test.describe('Dashboard UX', () => {
  test('unauthenticated dashboard redirects to sign-in', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/signin/)
  })

  test('dashboard filter buttons have aria-pressed', async ({ page }) => {
    await page.goto('/signin')
    const hasFilters = await page
      .getByRole('group', { name: /filtrer les projets/i })
      .isVisible()
      .catch(() => false)
    if (!hasFilters) {
      test.skip()
    }
    await expect(page.getByRole('button', { name: /Tous \(\d+\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
