import { test, expect, type Page } from '@playwright/test'
import { TEMPLATES } from '../../scripts/seed-cast.mjs'
import { signIn } from './helpers/auth'
import { resetSmokeStudent } from './helpers/reset'
import { account, ORGANIZER_EMAIL, SMOKE_STUDENT_A } from './helpers/manifest'

// « Demande d'absence » — the simplest fillable in the standard library: two
// blanks (one prefilled with the student's name), one radio, one signature.
// Read from the cast so the copy is never retyped.
const FORM = TEMPLATES.find((t) => t.key === 'absence')!.name

async function fillAbsenceForm(page: Page): Promise<void> {
  // Labels come from lib/forms/fillable/absence.ts — organizer-owned French
  // legal copy, rendered verbatim in every locale, so they are stable anchors.
  await page.getByLabel('Nom du parent / responsable légal').fill('Camille Parent')
  // `regime` radios have no value attribute; the label wraps the input.
  await page.getByLabel('demi-pensionnaire').check()
  await page.getByTestId('sig-name-sig_parent').fill('Camille Parent')
  await page.getByTestId('sig-approve-sig_parent').check()
}

test('a student submits a form and an organizer approves it', async ({ browser }) => {
  // smoke-01 is this spec's student; portals.spec.ts owns smoke-02.
  await resetSmokeStudent(SMOKE_STUDENT_A)
  const student = account(SMOKE_STUDENT_A)

  const studentContext = await browser.newContext()
  const organizerContext = await browser.newContext()
  const asStudent = await studentContext.newPage()
  const asOrganizer = await organizerContext.newPage()

  try {
    // --- the student fills, signs and sends ---------------------------------
    await signIn(asStudent, SMOKE_STUDENT_A, /\/my-forms$/)

    const card = asStudent.getByTestId('dossier-todo').filter({ hasText: FORM })
    await expect(card).toHaveCount(1)
    await card.getByRole('link').click()
    await expect(asStudent).toHaveURL(/\/my-forms\/[0-9a-f-]{36}$/)

    await fillAbsenceForm(asStudent)
    await asStudent.getByTestId('fillable-submit').click()

    // Submitting renders the signed PDF and uploads it before flipping the
    // status, so this is the slowest step in the suite.
    //
    // The outcome is asserted by re-reading the dossier, NOT by waiting for the
    // router.push('/my-forms') that FillableForm fires on success. That push is
    // a client-side RSC navigation and has been observed to stall here under
    // load while the submission itself landed perfectly well — waiting on it
    // tests Next's router, not this application. Polling the dossier still
    // fails loudly if the form never reaches « en relecture ».
    await expect(async () => {
      await asStudent.goto('/my-forms')
      await expect(asStudent.getByTestId('dossier-review').filter({ hasText: FORM })).toHaveCount(1)
    }).toPass({ timeout: 60_000 })

    // --- the organizer reviews and approves ---------------------------------
    await signIn(asOrganizer, ORGANIZER_EMAIL, /\/dashboard$/)
    await asOrganizer.goto('/students')
    await asOrganizer.getByRole('searchbox').fill(student.name)
    await asOrganizer.locator('button').filter({ hasText: student.name }).first().click()

    await asOrganizer.getByRole('link', { name: new RegExp(FORM) }).first().click()
    await expect(asOrganizer).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/)
    const reviewUrl = asOrganizer.url()

    await asOrganizer.getByTestId('approve-submission').click()
    // Same shape as the student's submit: assert the outcome by re-reading the
    // page, not by waiting on handleApprove's router.back(). Reloading once
    // without polling would race the server action — the page does not
    // re-render on its own, so a single stale read never recovers.
    // canReview is `status === 'submitted'`, so an approved form offers no button.
    await expect(async () => {
      await asOrganizer.goto(reviewUrl)
      await expect(asOrganizer.getByTestId('approve-submission')).toHaveCount(0)
    }).toPass({ timeout: 60_000 })

    // --- both sides agree ---------------------------------------------------
    await asStudent.goto('/my-forms')
    await expect(asStudent.getByTestId('dossier-done').filter({ hasText: FORM })).toHaveCount(1)
    await expect(asStudent.getByTestId('dossier-review').filter({ hasText: FORM })).toHaveCount(0)
  } finally {
    await studentContext.close()
    await organizerContext.close()
  }
})
