import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every expected failure of changePassword must come back as a structured
// result: production replaces thrown Server Action messages with an opaque
// digest, so a throw here is a digest string in the user's face.
let scenario: {
  rate: 'allowed' | 'limited' | 'error'
  signInError: { message: string } | null
  pwned: boolean
  updateError: { message: string } | null
  updatedWith: string | null
}

vi.mock('@/lib/auth/require', () => ({
  requireUser: async () => ({ id: 'u1' }),
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: {
      id: 'u1', role: 'organizer', school_id: 's-1', full_name: 'Marie B.',
      email: 'a@b.com', org_role: 'owner', locale: 'fr',
      schools: { name: 'Lycée X', country: 'FR' },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      updateUser: async ({ password }: { password: string }) => {
        scenario.updatedWith = password
        return { error: scenario.updateError }
      },
    },
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async () => ({ error: scenario.signInError }),
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => scenario.rate,
  enforceRateLimitStrict: async () => {},
}))
vi.mock('@/lib/auth/hibp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/hibp')>('@/lib/auth/hibp')
  return { ...actual, isPasswordPwned: async () => scenario.pwned }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import { changePassword } from '@/actions/settings'

beforeEach(() => {
  scenario = {
    rate: 'allowed', signInError: null, pwned: false,
    updateError: null, updatedWith: null,
  }
})

describe('changePassword', () => {
  it('updates the password on the happy path', async () => {
    const res = await changePassword('oldpassword', 'newpassword')
    expect(res).toEqual({ ok: true })
    expect(scenario.updatedWith).toBe('newpassword')
  })

  it('reports a rate-limited caller and never touches the password', async () => {
    scenario.rate = 'limited'
    const res = await changePassword('oldpassword', 'newpassword')
    expect(res).toEqual({ ok: false, message: 'settings.errors.tooManyAttempts' })
    expect(scenario.updatedWith).toBeNull()
  })

  // Fails OPEN like enforceRateLimit: a DB blip must not lock someone out of
  // their own password change.
  it('allows the change when the rate-limit check itself errors', async () => {
    scenario.rate = 'error'
    const res = await changePassword('oldpassword', 'newpassword')
    expect(res).toEqual({ ok: true })
  })

  it('reports a too-short password before verifying the current one', async () => {
    const res = await changePassword('oldpassword', 'short')
    expect(res).toEqual({ ok: false, message: 'settings.errors.passwordTooShort' })
    expect(scenario.updatedWith).toBeNull()
  })

  it('reports a wrong current password', async () => {
    scenario.signInError = { message: 'Invalid login credentials' }
    const res = await changePassword('wrongpassword', 'newpassword')
    expect(res).toEqual({ ok: false, message: 'settings.errors.currentPasswordIncorrect' })
    expect(scenario.updatedWith).toBeNull()
  })

  it('reports a leaked password', async () => {
    scenario.pwned = true
    const res = await changePassword('oldpassword', 'newpassword')
    expect(res).toEqual({ ok: false, message: 'settings.errors.passwordLeaked' })
    expect(scenario.updatedWith).toBeNull()
  })

  it('reports a failed update', async () => {
    scenario.updateError = { message: 'boom' }
    const res = await changePassword('oldpassword', 'newpassword')
    expect(res).toEqual({ ok: false, message: 'settings.errors.passwordUpdateFailed' })
  })
})
