import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyFailure, type ApplyFailureReason } from '@/lib/apply/result'

// Every reason the funnel can return. Kept explicit rather than derived from
// the type so that adding a code without adding copy fails here, in all five
// languages, instead of rendering the raw key to a parent.
const REASONS: ApplyFailureReason[] = [
  'not_found', 'expired', 'locked', 'closed', 'rate_limited',
  'too_long', 'bad_format', 'missing_fields', 'registered',
  'no_file', 'not_an_image', 'file_rejected', 'photo_disabled', 'failed',
]

const LOCALES = ['fr', 'en', 'es', 'it', 'de'] as const

function catalogue(locale: string): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  return JSON.parse(raw).apply.errors
}

describe('applyFailure', () => {
  it('omits `fields` entirely when there is nothing to flag', () => {
    expect(applyFailure('expired')).toEqual({ ok: false, reason: 'expired' })
    expect(applyFailure('too_long', [])).toEqual({ ok: false, reason: 'too_long' })
  })

  it('carries the flagged fields when there are some', () => {
    expect(applyFailure('bad_format', ['father_email']))
      .toEqual({ ok: false, reason: 'bad_format', fields: ['father_email'] })
  })
})

describe('apply.errors catalogue', () => {
  it.each(LOCALES)('%s has copy for every failure reason', locale => {
    const messages = catalogue(locale)
    for (const reason of REASONS) {
      expect(messages[reason], `${locale}.${reason}`).toBeTruthy()
    }
  })

  // downloadApplicationRecap reports this one too, through the same group.
  it.each(LOCALES)('%s covers the recap-only reason', locale => {
    expect(catalogue(locale).not_submitted).toBeTruthy()
  })

  it.each(LOCALES)('%s carries no leftover keys', locale => {
    const extra = Object.keys(catalogue(locale))
      .filter(k => !REASONS.includes(k as ApplyFailureReason) && k !== 'not_submitted')
    expect(extra).toEqual([])
  })

  // The funnel addresses the applicant informally and French copy uses the
  // typographic apostrophe throughout (see the reminder/email/landing guards).
  it('French copy uses ’ and never the straight quote', () => {
    for (const [key, value] of Object.entries(catalogue('fr'))) {
      expect(value, key).not.toMatch(/'/)
    }
  })
})
