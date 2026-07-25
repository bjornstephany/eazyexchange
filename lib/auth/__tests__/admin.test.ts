import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isPlatformAdmin } from '../admin'

const original = process.env.ADMIN_EMAILS
beforeEach(() => { process.env.ADMIN_EMAILS = 'Owner@Example.com, second@example.com' })
afterEach(() => { process.env.ADMIN_EMAILS = original })

describe('isPlatformAdmin', () => {
  it('matches case-insensitively', () => {
    expect(isPlatformAdmin('OWNER@example.com')).toBe(true)
  })
  it('matches a later entry in the list', () => {
    expect(isPlatformAdmin('second@example.com')).toBe(true)
  })
  it('rejects an unlisted address', () => {
    expect(isPlatformAdmin('someone@else.com')).toBe(false)
  })
  it('rejects null and empty', () => {
    expect(isPlatformAdmin(null)).toBe(false)
    expect(isPlatformAdmin('')).toBe(false)
  })
  it('denies everyone when the variable is unset', () => {
    delete process.env.ADMIN_EMAILS
    expect(isPlatformAdmin('owner@example.com')).toBe(false)
  })
})
