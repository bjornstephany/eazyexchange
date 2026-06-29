import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear() })

describe('SignupPage', () => {
  it('submits signUp with name + school in metadata and shows the check-email state', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)

    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/school name/i), 'Lincoln High')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/password/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.password).toBe('supersecret')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe', school_name: 'Lincoln High' })

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/full name/i), 'Jane')
    await user.type(screen.getByLabelText(/school name/i), 'Lincoln')
    // 'a@b' passes the browser's native type=email check (no TLD required) but
    // fails our stricter isValidEmail, so our JS validation is what runs here.
    await user.type(screen.getByLabelText(/email/i), 'a@b')
    await user.type(screen.getByLabelText(/password/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
  })
})
