import { test, expect } from '@playwright/test'
import { TEMPLATES } from '../../scripts/seed-cast.mjs'
import { signIn } from './helpers/auth'
import { resetSmokeStudent } from './helpers/reset'
import { ORGANIZER_EMAIL, SMOKE_STUDENT_B, humanStudentCount } from './helpers/manifest'

// 1939 unit tests pass while every page returns a 500: the suite mocks
// Supabase, so a server component that throws on real data is invisible to it.
// This spec is the answer to that — it renders both portals signed-in against
// the real seeded database.

// Next's client error boundary; a server-side throw shows up in the status code.
const ERROR_BOUNDARY = /Application error|Internal Server Error/

test.describe('portals', () => {
  test('the organizer dashboard renders the seeded world', async ({ page }) => {
    await signIn(page, ORGANIZER_EMAIL, /\/dashboard$/)

    await expect(page.getByTestId('overview')).toBeVisible()
    // One row per enrolled student, plus the applicants still in the funnel —
    // so the seeded student count is a floor, not an equality.
    const rows = page.getByTestId('lifecycle-row')
    expect(await rows.count()).toBeGreaterThanOrEqual(humanStudentCount())
    // toContainText, not toHaveText: toHaveText with a RegExp matches the FULL
    // string, so a negated toHaveText passes trivially and asserts nothing.
    await expect(page.locator('body')).not.toContainText(ERROR_BOUNDARY)
  })

  test('every organizer page renders without an error boundary', async ({ page }) => {
    await signIn(page, ORGANIZER_EMAIL, /\/dashboard$/)

    for (const path of [
      '/dashboard',
      '/applications',
      '/students',
      '/forms',
      '/communication',
      '/settings',
    ]) {
      const res = await page.goto(path)
      expect(res?.status(), `${path} responded ${res?.status()}`).toBe(200)
      await expect(page.locator('body'), `${path} rendered an error boundary`).not.toContainText(
        ERROR_BOUNDARY,
      )
    }
  })

  test('the student checklist renders every assigned form', async ({ page }) => {
    // smoke-02 is this spec's student; round-trip.spec.ts owns smoke-01.
    await resetSmokeStudent(SMOKE_STUDENT_B)
    await signIn(page, SMOKE_STUDENT_B, /\/my-forms$/)

    await expect(page.getByTestId('dossier')).toBeVisible()
    // Shape `untouched`: nothing started, so every template is still to do.
    await expect(page.getByTestId('dossier-todo')).toHaveCount(TEMPLATES.length)
    await expect(page.getByTestId('dossier-done')).toHaveCount(0)
  })
})
