import { describe, it, expect } from 'vitest'
import { applicationState } from '@/lib/applications/state'

describe('applicationState', () => {
  it('is blank when nothing was ever created', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: null, applicationCount: 0 }))
      .toBe('blank')
  })

  it('is created once a deadline exists but nobody has applied', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: '2026-06-12', applicationCount: 0 }))
      .toBe('created')
  })

  // The legacy exchange: it opened applications long before templates existed,
  // and was later closed. A deadline on its own is enough — no backfill.
  it('is created for a legacy exchange whose applications are closed', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: '2026-06-12', applicationCount: 0 }))
      .toBe('created')
  })

  // application_open with no deadline is reachable in the legacy data too.
  it('is created when applications are open with no deadline', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: null, applicationCount: 0 }))
      .toBe('created')
  })

  it('is running as soon as one application exists', () => {
    expect(applicationState({ applicationOpen: true, applicationDeadline: '2026-06-12', applicationCount: 3 }))
      .toBe('running')
  })

  // THE DRIFT CASE. listApplications hides untouched drafts (status = draft with
  // no invited_at), so apps.length can be 0 while the unfiltered count is 3 —
  // the same count that locks the questionnaire. It must resolve to running, or
  // the page would offer « Ajouter » beside a locked questionnaire.
  it('is running on the unfiltered count alone, with no deadline and closed applications', () => {
    expect(applicationState({ applicationOpen: false, applicationDeadline: null, applicationCount: 3 }))
      .toBe('running')
  })
})
