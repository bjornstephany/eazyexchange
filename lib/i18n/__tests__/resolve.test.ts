import { describe, it, expect, vi, beforeEach } from 'vitest'

const getProfile = vi.fn()
const cookieGet = vi.fn()
const headerGet = vi.fn()

vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => cookieGet(n) }),
  headers: async () => ({ get: (n: string) => headerGet(n) }),
}))

import { resolveLocale, resolveRequestLocale } from '@/lib/i18n/resolve'

describe('resolveLocale', () => {
  beforeEach(() => {
    getProfile.mockReset(); cookieGet.mockReset(); headerGet.mockReset()
    getProfile.mockResolvedValue(null); cookieGet.mockReturnValue(undefined); headerGet.mockReturnValue(null)
  })

  it('prefers the logged-in profile locale', async () => {
    getProfile.mockResolvedValue({ locale: 'de' })
    cookieGet.mockReturnValue({ value: 'fr' })
    expect(await resolveLocale()).toBe('de')
  })
  it('uses the NEXT_LOCALE cookie when anonymous', async () => {
    cookieGet.mockReturnValue({ value: 'es' })
    expect(await resolveLocale()).toBe('es')
  })
  it('negotiates Accept-Language when no cookie', async () => {
    headerGet.mockReturnValue('it-IT,it;q=0.9,en;q=0.8')
    expect(await resolveLocale()).toBe('it')
  })
  it('falls back to en', async () => {
    expect(await resolveLocale()).toBe('en')
  })
  it('ignores an unsupported profile locale and continues down the chain', async () => {
    getProfile.mockResolvedValue({ locale: 'pt' })
    cookieGet.mockReturnValue({ value: 'fr' })
    expect(await resolveLocale()).toBe('fr')
  })
})

// The same cookie → Accept-Language cascade as resolveLocale(), but read
// synchronously off a NextRequest instead of next/headers — used by
// provisionOrganizer's callers, which run before any profile row exists.
function fakeRequest({ cookie, acceptLanguage }: { cookie?: string; acceptLanguage?: string } = {}) {
  return {
    cookies: { get: () => (cookie === undefined ? undefined : { value: cookie }) },
    headers: { get: () => acceptLanguage ?? null },
  } as unknown as import('next/server').NextRequest
}

describe('resolveRequestLocale', () => {
  it('uses the NEXT_LOCALE cookie when present', () => {
    expect(resolveRequestLocale(fakeRequest({ cookie: 'es' }))).toBe('es')
  })
  it('ignores an unsupported cookie value and negotiates Accept-Language instead', () => {
    expect(resolveRequestLocale(fakeRequest({ cookie: 'pt', acceptLanguage: 'de-DE,de;q=0.9' }))).toBe('de')
  })
  it('negotiates Accept-Language when there is no cookie', () => {
    expect(resolveRequestLocale(fakeRequest({ acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8' }))).toBe('it')
  })
  it('falls back to en', () => {
    expect(resolveRequestLocale(fakeRequest())).toBe('en')
  })
})
