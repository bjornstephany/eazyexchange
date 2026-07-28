import { test, expect, type Page } from '@playwright/test'
import { TEMPLATES } from '../../scripts/seed-cast.mjs'
import { signIn } from './helpers/auth'
import { resetSmokeStudent } from './helpers/reset'
import { ORGANIZER_EMAIL, SMOKE_STUDENT_B, humanStudentCount } from './helpers/manifest'

// 1939 unit tests pass while every page returns a 500: the suite mocks
// Supabase, so a server component that throws on real data is invisible to it.
// This spec is the answer to that — it renders both portals signed-in against
// the real seeded database.

// A thrown server component does NOT show up as a non-200 status here: both
// route groups ship an error.tsx (app/(organizer)/error.tsx,
// app/(student)/error.tsx) which React renders in place, with a 200 and
// translated copy. So the boundary is detected by its testid — proven
// necessary: a deliberate throw in /dashboard left this suite green until this
// assertion existed, because the response was 200 and the copy French.
//
// The text regex stays as a second net for the case where the boundary itself
// fails and Next falls back to its own page.
const ERROR_BOUNDARY = /Application error|Internal Server Error/
const errorBoundary = (page: Page) => page.getByTestId('error-state')

test.describe('portals', () => {
  test('the organizer dashboard renders the seeded world', async ({ page }) => {
    await signIn(page, ORGANIZER_EMAIL, /\/dashboard$/)

    await expect(page.getByTestId('overview')).toBeVisible()
    // One row per enrolled student, plus the applicants still in the funnel —
    // so the seeded student count is a floor, not an equality.
    const rows = page.getByTestId('lifecycle-row')
    expect(await rows.count()).toBeGreaterThanOrEqual(humanStudentCount())
    await expect(errorBoundary(page)).toHaveCount(0)
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
      // The load-bearing assertion, and it has to be a POSITIVE one. A thrown
      // server component here does not produce a 5xx and does not render
      // error.tsx server-side: Next returns 200 with the layout shell and no
      // page content at all. Absence-of-error therefore proves nothing —
      // verified by deliberately throwing in /dashboard, which left every
      // absence-based assertion green. Every healthy organizer page renders
      // exactly one <h1>; a broken one renders none.
      await expect(page.locator('h1'), `${path} rendered no content`).toHaveCount(1)
      await expect(errorBoundary(page), `${path} rendered the error boundary`).toHaveCount(0)
      await expect(page.locator('body'), `${path} rendered an error page`).not.toContainText(
        ERROR_BOUNDARY,
      )
    }
  })

  test('the student checklist renders every assigned form', async ({ page }) => {
    // smoke-02 is this spec's student; round-trip.spec.ts owns smoke-01.
    await resetSmokeStudent(SMOKE_STUDENT_B)
    await signIn(page, SMOKE_STUDENT_B, /\/my-forms$/)

    await expect(errorBoundary(page)).toHaveCount(0)
    await expect(page.getByTestId('dossier')).toBeVisible()
    // Shape `untouched`: nothing started, so every template is still to do.
    await expect(page.getByTestId('dossier-todo')).toHaveCount(TEMPLATES.length)
    await expect(page.getByTestId('dossier-done')).toHaveCount(0)
  })
})
