import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPasswordPwned, passwordPolicyIssue } from '@/lib/auth/hibp'

// SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix 5BAA6, suffix 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

afterEach(() => vi.unstubAllGlobals())

describe('isPasswordPwned', () => {
  it('returns true when the suffix appears with a positive count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\r\n${SUFFIX}:1387`,
    }))
    expect(await isPasswordPwned('password')).toBe(true)
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6')
  })

  it('returns false when the suffix is absent or zero-padded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\r\n${SUFFIX}:0`,
    }))
    expect(await isPasswordPwned('password')).toBe(false)
  })

  it('fails open on non-OK responses and on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }))
    expect(await isPasswordPwned('password')).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await isPasswordPwned('password')).toBe(false)
  })
})

// The only form: callers own their copy (next-intl in Settings,
// JOIN_ERROR_MESSAGES on /join), so this module returns a code, never a string.
describe('passwordPolicyIssue', () => {
  it('returns a code for short passwords and null for 8+', () => {
    expect(passwordPolicyIssue('court')).toBe('too_short')
    expect(passwordPolicyIssue('12345678')).toBeNull()
    expect(passwordPolicyIssue('longenough')).toBeNull()
  })
})
