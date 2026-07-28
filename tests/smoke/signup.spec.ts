import { test, expect } from '@playwright/test'
import { resetSignupCruft } from './helpers/reset'
import { waitForMessage, confirmPathFrom } from './helpers/mailpit'
import { SEED_DOMAIN } from './helpers/manifest'

// A self-registered organizer creates a blank school, so
// set_initial_user_status() leaves them `pending` and middleware.ts sends every
// gated route to /pending. Asserting /pending tests the approval gate working
// rather than pretending it is not there.
//
// Known limitation (see the spec): this reads the LOCAL template
// (supabase/templates/confirmation.html), a committed copy of production's. It
// proves the application's wiring; it does not prove production's template.
test('a new organizer signs up, confirms by mail and lands on /pending', async ({ page }) => {
  await resetSignupCruft()
  // Cannot use a reserved account — this spec creates one. @seed.example.com so
  // `pnpm dev --reseed` sweeps up anything this run leaves behind.
  const email = `smoke-signup-${Date.now().toString(36)}@${SEED_DOMAIN}`

  const res = await page.goto('/signup')
  expect(res?.status()).toBe(200)
  await page.locator('#fullName').fill('Smoke Organisateur')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('smoke-password-2026')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText('Vérifiez votre e-mail')).toBeVisible({ timeout: 20_000 })

  const mail = await waitForMessage(email)
  const confirmPath = confirmPathFrom(mail.html)
  // The shape assertion is the load-bearing one: a template that reverts to
  // {{ .ConfirmationURL }} bypasses app/auth/confirm/route.ts entirely.
  expect(confirmPath).toContain('token_hash=')
  expect(confirmPath).toContain('type=signup')

  // {{ .SiteURL }} is pinned to :3000 in supabase/config.toml while this suite
  // serves on the worktree's port, so the link is re-issued against the server
  // under test. Everything that matters — the route, the token, the OTP
  // verification, the provisioning — is the real thing.
  await page.goto(confirmPath)
  await expect(page).toHaveURL(/\/pending$/, { timeout: 20_000 })
})
