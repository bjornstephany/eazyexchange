import { describe, it, expect, vi, beforeEach } from 'vitest'

const getProfile = vi.fn()
const cookieGet = vi.fn()
const headerGet = vi.fn()

vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => cookieGet(n) }),
  headers: async () => ({ get: (n: string) => headerGet(n) }),
}))

import { resolveLocale } from '@/lib/i18n/resolve'

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
