import { test, expect } from '@playwright/test'
import { resetSignupCruft } from './helpers/reset'
import { adminDb } from './helpers/db'
import { waitForMessage, confirmPathFrom } from './helpers/mailpit'
import { SEED_DOMAIN } from './helpers/manifest'
import { ALLOWLISTED_SIGNUP } from '../../scripts/seed-cast.mjs'

// Eazyexchange is not open to the public: signup_allowlist decides, at signup
// time, who may have an account at all. These two specs are the two sides of
// that gate.
//
// Every assertion is POSITIVE on purpose. A thrown Next page returns HTTP 200
// with an empty shell, so "did not land on /pending" would pass on a crash.

test('a stranger is waitlisted and no account is created', async ({ page }) => {
  await resetSignupCruft()
  // @seed.example.com so `pnpm dev --reseed` sweeps up anything left behind.
  const email = `smoke-signup-${Date.now().toString(36)}@${SEED_DOMAIN}`

  const res = await page.goto('/signup')
  expect(res?.status()).toBe(200)
  await page.locator('#fullName').fill('Smoke Inconnu')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill('smoke-password-2026')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText(/liste d’attente/i)).toBeVisible({ timeout: 20_000 })

  const db = adminDb()
  const { data: row } = await db
    .from('signup_waitlist').select('email, source').eq('email', email).maybeSingle()
  expect(row).toMatchObject({ email, source: 'password' })

  // THE property the whole design buys: no auth user, therefore no school and
  // no users row either.
  const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  expect(authList.users.some((u) => u.email === email)).toBe(false)

  const { data: profile } = await db
    .from('users').select('id').eq('email', email).maybeSingle()
  expect(profile).toBeNull()
})

// The cycle the owner runs by hand repeatedly — worth having a robot check it.
//
// Known limitation (see the spec): this reads the LOCAL template
// (supabase/templates/confirmation.html), a committed copy of production's. It
// proves the application's wiring; it does not prove production's template.
test('an allowlisted address signs up, confirms by mail and reaches onboarding', async ({ page }) => {
  await resetSignupCruft()

  const res = await page.goto('/signup')
  expect(res?.status()).toBe(200)
  await page.locator('#fullName').fill('Smoke Organisateur')
  await page.locator('#email').fill(ALLOWLISTED_SIGNUP)
  await page.locator('#password').fill('smoke-password-2026')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page.getByText('Vérifiez votre e-mail')).toBeVisible({ timeout: 20_000 })

  const mail = await waitForMessage(ALLOWLISTED_SIGNUP)
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
  // Allowlisted means set_initial_user_status() approves on insert, so there is
  // no /pending stop: the account goes straight to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 })
  await expect(page.getByText(/établissement/i).first()).toBeVisible()
})
