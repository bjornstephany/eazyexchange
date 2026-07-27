import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({ resendSignupEmail: vi.fn() }))

// Stand in for GoogleButton so the OAuth props it receives are observable —
// asserting the rendered button alone would not catch a dropped `intent`.
const googleProps: Array<{ intent?: string; next?: string; label?: string }> = []
vi.mock('@/components/auth/GoogleButton', () => ({
  GoogleButton: (props: { intent?: string; next?: string; label?: string }) => {
    googleProps.push(props)
    return <button type="button">{props.label}</button>
  },
}))

import SignupPage from '@/app/(auth)/signup/page'
import LoginPage from '@/app/(auth)/login/page'

beforeEach(() => { googleProps.length = 0 })

// Email/password is the primary path on both entry points; Google is the
// alternative below it. Asserting DOM *order*, not just presence, is the point —
// swapping the two blocks back would leave every by-name query passing.
function googleFollowsSubmit(submitName: RegExp) {
  const submit = screen.getByRole('button', { name: submitName })
  const google = screen.getByRole('button', { name: /^google$/i })
  return Boolean(submit.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('auth entry ordering', () => {
  it('puts the signup form before the Google button', () => {
    render(<SignupPage />)
    expect(googleFollowsSubmit(/créer mon compte/i)).toBe(true)
  })

  it('puts the login form before the Google button', () => {
    render(<LoginPage />)
    expect(googleFollowsSubmit(/se connecter/i)).toBe(true)
  })

  it('labels the Google button identically on both pages', () => {
    const { unmount } = render(<SignupPage />)
    expect(screen.getByText(/ou continuer avec/i)).toBeInTheDocument()
    const signupLabel = googleProps[0].label
    unmount()

    render(<LoginPage />)
    expect(screen.getByText(/ou continuer avec/i)).toBeInTheDocument()
    expect(googleProps[1].label).toBe(signupLabel)
  })

  // app/auth/callback/route.ts signs out and deletes the orphan auth row of a
  // Google user with neither an invited profile nor intent=organizer_signup.
  // Reordering the card must not drop that prop.
  it('keeps intent=organizer_signup and next=/onboarding on the signup Google button', () => {
    render(<SignupPage />)
    expect(googleProps[0]).toMatchObject({ intent: 'organizer_signup', next: '/onboarding' })
  })

  it('keeps the legal consent line at the foot of the signup card, below Google', () => {
    render(<SignupPage />)
    const google = screen.getByRole('button', { name: /^google$/i })
    const cgu = screen.getByRole('link', { name: /^CGU$/i })
    expect(Boolean(google.compareDocumentPosition(cgu) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })
})
