import { test, expect, type Page } from '@playwright/test'
import { allApplicationFields, type AppField } from '@/lib/application-form'
import { resetApplyFunnel } from './helpers/reset'
import { solidPng } from './helpers/png'
import { APPLY_SLUG, SEED_DOMAIN } from './helpers/manifest'

// The form renders every section on one page, each input carrying id={field.id}
// (components/ApplicationForm.tsx). Driving it from the schema keeps this spec
// short and means a new required field cannot silently go unexercised.
//
// Hidden-unless-relevant fields: `separation_housing_address` appears only for
// family_status separated/step_family, `gender_other` only for sex = other.
// Both radios are answered with their first option (married, male), so neither
// is on screen.
const CONDITIONAL = new Set(['separation_housing_address', 'gender_other'])

function valueFor(field: AppField, applicantEmail: string): string {
  if (field.id === 'email') return applicantEmail
  switch (field.type) {
    case 'date':
      return '2009-04-12'
    case 'email':
      return `smoke-parent@${SEED_DOMAIN}`
    case 'tel':
      return '+33612345678'
    case 'textarea':
      return 'Réponse de test automatisé.'
    default:
      return 'Test'
  }
}

async function fillApplication(page: Page, applicantEmail: string): Promise<void> {
  for (const field of allApplicationFields()) {
    if (CONDITIONAL.has(field.id)) continue
    // Required fields, plus the whole mother group: missingRequiredApplication
    // wants at least ONE parent group filled completely and no group partial,
    // so the father group is left entirely blank.
    if (!field.required && field.group !== 'mother') continue

    if (field.type === 'radio' || field.type === 'yesno') {
      // These inputs carry name={field.id} but no value attribute, so they are
      // selected by position: option 0 for radios, 'yes' for yes/no.
      await page.locator(`input[type="radio"][name="${field.id}"]`).first().check()
      continue
    }
    await page.locator(`#${field.id}`).fill(valueFor(field, applicantEmail))
  }
}

test('the anonymous funnel completes and the resume token reopens it', async ({ page }) => {
  await resetApplyFunnel()
  // Unique per run: one email = one application per exchange, and the funnel
  // rate-limits by recipient.
  const applicantEmail = `smoke-apply-${Date.now().toString(36)}@${SEED_DOMAIN}`

  // --- start --------------------------------------------------------------
  const landing = await page.goto(`/apply/${APPLY_SLUG}`)
  expect(landing?.status()).toBe(200)
  await page.locator('#first_name').fill('Smoke')
  await page.locator('#last_name').fill('Candidat')
  await page.locator('#email').fill(applicantEmail)
  await page.getByRole('button', { name: 'Commencer ma candidature' }).click()

  // lib/tokens.ts randomToken(): 24 random bytes as base64url, ~32 chars — NOT
  // a UUID. (The seed's fixtures use randomUUID, the funnel does not.)
  await expect(page).toHaveURL(/\/apply\/resume\/[A-Za-z0-9_-]{20,}$/, { timeout: 20_000 })
  const resumeUrl = page.url()

  // --- fill ---------------------------------------------------------------
  await page.setInputFiles('input[type="file"]', {
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: solidPng(),
  })
  // The upload is a server action behind client-side canvas compression; the
  // preview replacing the placeholder is what says it landed.
  await expect(page.getByRole('button', { name: 'Remplacer la photo' })).toBeVisible({
    timeout: 30_000,
  })

  await fillApplication(page, applicantEmail)

  // --- submit -------------------------------------------------------------
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click()
  await expect(page.getByText('Merci ! Ta candidature a été envoyée.')).toBeVisible({
    timeout: 30_000,
  })

  // --- the token reopens it -----------------------------------------------
  // Submitting clears the token from localStorage, so this is the emailed
  // link's path, not a cached one.
  await page.goto(resumeUrl)
  await expect(page.getByText('Ta candidature a déjà été envoyée.')).toBeVisible()
})
