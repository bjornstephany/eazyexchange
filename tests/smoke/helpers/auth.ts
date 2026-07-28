import { expect, type Page } from '@playwright/test'
import { readManifest } from './manifest'

/**
 * Sign in through /login — the real authentication path, and the only one
 * available: the suite drives `next start`, where /dev's NODE_ENV guard 404s.
 *
 * `expect(page).toHaveURL` rather than `page.waitForURL`: the login page routes
 * with a client-side router.push, which waitForURL has been observed to hang
 * on in this app. toHaveURL polls page.url() instead.
 */
export async function signIn(page: Page, email: string, expected: RegExp): Promise<void> {
  const { password } = readManifest()
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page, `sign-in as ${email} did not land on ${expected}`).toHaveURL(expected, {
    timeout: 20_000,
  })
}
