import { describe, it, expect } from 'vitest'
import { isLocalSupabaseUrl } from '../lib/local-target.mjs'

describe('isLocalSupabaseUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://127.0.0.1:54321/',
    'https://localhost',
    'http://[::1]:54321',
  ])('accepts %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true)
  })

  it.each([
    'https://rgisrqlbcjdoetoybaqd.supabase.co',
    'https://loygdbjdyciipvdcpvmr.supabase.co',
    'https://127.0.0.1.evil.com',
    'https://localhost.attacker.net',
    'http://192.168.1.10:54321',
  ])('rejects %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })

  it.each([undefined, null, '', 'not a url', '127.0.0.1:54321'])('rejects %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false)
  })
})
