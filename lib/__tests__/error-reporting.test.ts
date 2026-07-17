import { describe, it, expect } from 'vitest'
import {
  normalizeMessage, redactEmails, truncate, errorFingerprint,
  MESSAGE_MAX, STACK_MAX,
} from '../error-reporting'

describe('normalizeMessage', () => {
  it('replaces UUIDs with a placeholder', () => {
    expect(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'))
      .toBe('Exchange <uuid> not found')
  })

  it('replaces long digit runs (4+) with a placeholder', () => {
    expect(normalizeMessage('row 123456 failed after 2026 ms')).toBe('row <n> failed after <n> ms')
  })

  it('keeps short numbers so HTTP 404 and HTTP 500 stay distinct bugs', () => {
    expect(normalizeMessage('Request failed with status 500'))
      .toBe('Request failed with status 500')
  })

  it('handles several ids in one message', () => {
    const a = normalizeMessage('link 0f8fad5b-d9cb-469f-a165-70867728950e to 7c9e6679-7425-40de-944b-e07fc1f90ae7')
    expect(a).toBe('link <uuid> to <uuid>')
  })
})

describe('errorFingerprint', () => {
  it('is stable across messages differing only by ids', () => {
    const a = errorFingerprint(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), '/exchanges/[id]')
    const b = errorFingerprint(normalizeMessage('Exchange 7c9e6679-7425-40de-944b-e07fc1f90ae7 not found'), '/exchanges/[id]')
    expect(a).toBe(b)
  })

  it('differs across routes for the same message', () => {
    expect(errorFingerprint('boom', '/exchanges/[id]'))
      .not.toBe(errorFingerprint('boom', '/billing'))
  })

  it('is a 64-char hex sha256', () => {
    expect(errorFingerprint('boom', '/')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('redactEmails', () => {
  it('redacts email-shaped strings', () => {
    expect(redactEmails('sending to parent.dupont@example.com failed'))
      .toBe('sending to <email> failed')
  })

  it('redacts several emails and leaves the rest intact', () => {
    expect(redactEmails('a@b.fr then c.d@e-f.co: timeout'))
      .toBe('<email> then <email>: timeout')
  })

  it('leaves plain text alone', () => {
    expect(redactEmails('constraint violation on submissions')).toBe('constraint violation on submissions')
  })
})

describe('truncate', () => {
  it('caps at the limit', () => {
    expect(truncate('a'.repeat(3000), MESSAGE_MAX)).toHaveLength(2000)
    expect(truncate('a'.repeat(9000), STACK_MAX)).toHaveLength(8000)
  })

  it('leaves short strings untouched', () => {
    expect(truncate('short', MESSAGE_MAX)).toBe('short')
  })
})
