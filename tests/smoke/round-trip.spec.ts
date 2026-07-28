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
    await expect(asStudent).toHaveURL(/\/my-forms$/, { timeout: 30_000 })
    await expect(asStudent.getByTestId('dossier-review').filter({ hasText: FORM })).toHaveCount(1)

    // --- the organizer reviews and approves ---------------------------------
    await signIn(asOrganizer, ORGANIZER_EMAIL, /\/dashboard$/)
    await asOrganizer.goto('/students')
    await asOrganizer.getByRole('searchbox').fill(student.name)
    await asOrganizer.locator('button').filter({ hasText: student.name }).first().click()

    await asOrganizer.getByRole('link', { name: new RegExp(FORM) }).first().click()
    await expect(asOrganizer).toHaveURL(/\/submissions\/[0-9a-f-]{36}$/)
    const reviewUrl = asOrganizer.url()

    await asOrganizer.getByTestId('approve-submission').click()
    // handleApprove awaits the server action and only THEN calls router.back(),
    // so leaving the submission page is the signal that the approval landed.
    // Reloading immediately would race the action and read the stale page —
    // which is a real failure mode: the page does not re-render on its own, so
    // the assertion below would then poll a permanently stale DOM.
    await expect(asOrganizer).not.toHaveURL(/\/submissions\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    // Reload the review page to see the settled state.
    await asOrganizer.goto(reviewUrl)
    // canReview is `status === 'submitted'`, so an approved form offers no button.
    await expect(asOrganizer.getByTestId('approve-submission')).toHaveCount(0)

    // --- both sides agree ---------------------------------------------------
    await asStudent.goto('/my-forms')
    await expect(asStudent.getByTestId('dossier-done').filter({ hasText: FORM })).toHaveCount(1)
    await expect(asStudent.getByTestId('dossier-review').filter({ hasText: FORM })).toHaveCount(0)
  } finally {
    await studentContext.close()
    await organizerContext.close()
  }
})
