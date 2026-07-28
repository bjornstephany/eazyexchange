import { describe, it, expect, afterEach, vi } from 'vitest'
import { isDevQuickAccessEnabled } from '../local-only'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isDevQuickAccessEnabled', () => {
  it('is enabled in development against a local database', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(isDevQuickAccessEnabled()).toBe(true)
  })

  it('is disabled in production even against a local database', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('is disabled in development against a remote database', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://rgisrqlbcjdoetoybaqd.supabase.co')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('does not accept a hostname that merely contains a local one', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://127.0.0.1.evil.com')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })

  it('is disabled when the URL is missing or unparseable', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(isDevQuickAccessEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not a url')
    expect(isDevQuickAccessEnabled()).toBe(false)
  })
})
