import { describe, it, expect, beforeEach } from 'vitest'
import { LOCALE_COOKIE, readLocaleCookie, writeLocaleCookie } from '@/lib/i18n/cookie'

describe('locale cookie', () => {
  beforeEach(() => {
    // jsdom: clear cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      if (name) document.cookie = `${name}=; max-age=0; path=/`
    })
  })

  it('uses the shared NEXT_LOCALE name', () => {
    expect(LOCALE_COOKIE).toBe('NEXT_LOCALE')
  })
  it('round-trips a valid locale', () => {
    writeLocaleCookie('es')
    expect(document.cookie).toContain('NEXT_LOCALE=es')
    expect(readLocaleCookie()).toBe('es')
  })
  it('returns null when unset', () => {
    expect(readLocaleCookie()).toBeNull()
  })
  it('ignores an unsupported cookie value', () => {
    document.cookie = 'NEXT_LOCALE=pt; path=/'
    expect(readLocaleCookie()).toBeNull()
  })
})
