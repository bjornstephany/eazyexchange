import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignupInput = { fullName: string; email: string; password: string }
type SignupResult =
  | { ok: true; state: 'confirm' | 'waitlisted' }
  | { ok: false; error: string; message?: string }

// The page itself no longer talks to Supabase — GoogleButton, rendered beneath
// the form, still constructs a browser client at render time.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))

const { requestOrganizerSignup, resendSignupEmail } = vi.hoisted(() => ({
  requestOrganizerSignup: vi.fn(
    async (_i: SignupInput) => ({ ok: true, state: 'confirm' }) as SignupResult,
  ),
  resendSignupEmail: vi.fn(async (_email: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(auth)/signup/actions', () => ({ requestOrganizerSignup, resendSignupEmail }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => {
  requestOrganizerSignup.mockClear()
  requestOrganizerSignup.mockResolvedValue({ ok: true, state: 'confirm' })
  resendSignupEmail.mockClear()
  window.history.replaceState({}, '', '/signup')
})

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  // Creating an account asks for the three things an account needs. The
  // establishment is not captured anywhere: the /onboarding step that collected
  // it was removed on 2026-08-13. Asserting absence is the point — re-adding a
  // field would otherwise slip through every other test in this file.
  it('asks for the full name, e-mail and password only', () => {
    render(<SignupPage />)
    expect(screen.getByLabelText(/nom complet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/votre établissement/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/votre rôle/i)).not.toBeInTheDocument()
  })

  // The account is never created in the browser any more: a client-side
  // allowlist check cannot prevent an account from existing.
  it('submits through the server action, not the browser Supabase client', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    expect(requestOrganizerSignup).toHaveBeenCalledTimes(1)
    expect(requestOrganizerSignup.mock.calls[0][0]).toEqual({
      fullName: 'Jane Doe', email: 'jane@example.com', password: 'supersecret',
    })
    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  it('shows the waitlist message when the address is not allowlisted', async () => {
    requestOrganizerSignup.mockResolvedValue({ ok: true, state: 'waitlisted' })
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    expect(await screen.findByText(/liste d’attente/i)).toBeInTheDocument()
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
    // No session exists on this path, so no sign-out affordance.
    expect(screen.queryByRole('button', { name: /se déconnecter/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/vérifiez votre e-mail/i)).not.toBeInTheDocument()
  })

  // How the Google path comes back: app/auth/callback/route.ts tears the orphan
  // auth row down and redirects to /signup?waitlisted=1.
  it('opens straight into the waitlist message with ?waitlisted=1', async () => {
    window.history.replaceState({}, '', '/signup?waitlisted=1')
    render(<SignupPage />)
    expect(await screen.findByText(/liste d’attente/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /créer mon compte/i })).not.toBeInTheDocument()
  })

  it('renders each refusal in French', async () => {
    const cases: Array<[string, RegExp]> = [
      ['invalid_email', /adresse e-mail valide/i],
      ['invalid_name', /tous les champs/i],
      ['rate_limited', /trop de tentatives/i],
    ]
    for (const [error, copy] of cases) {
      requestOrganizerSignup.mockResolvedValue({ ok: false, error })
      const user = userEvent.setup()
      const { unmount } = render(<SignupPage />)
      await submit(user)
      expect(await screen.findByText(copy)).toBeInTheDocument()
      unmount()
    }
  })

  it('surfaces the Supabase message on a signup failure', async () => {
    requestOrganizerSignup.mockResolvedValue({
      ok: false, error: 'signup_failed', message: 'User already registered',
    })
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    expect(await screen.findByText(/user already registered/i)).toBeInTheDocument()
  })

  // Confirmation is one click on the link in the email (handled by
  // app/auth/confirm/route.ts) — there is no code to type.
  it('tells the user to click the confirmation button in the email, with no code input', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    expect(await screen.findByText(/confirmer mon inscription/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/code de confirmation/i)).not.toBeInTheDocument()
  })

  // The resend is rate-limited client-side on top of Supabase's own limits.
  it('holds the resend behind a countdown', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)

    const resend = await screen.findByRole('button', { name: /renvoyer l’e-mail \(\d+s\)/i })
    expect(resend).toBeDisabled()
    await user.click(resend)
    expect(resendSignupEmail).not.toHaveBeenCalled()
  })

  it('« Recommencer » returns to the signup form', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await submit(user)
    await user.click(await screen.findByRole('button', { name: /recommencer/i }))
    expect(screen.getByRole('button', { name: /créer mon compte/i })).toBeInTheDocument()
  })
})
