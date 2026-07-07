import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInWithOAuth = vi.fn(
  async (_opts: { provider: string; options: { redirectTo: string; queryParams?: Record<string, string> } }) => ({ error: null }),
)
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

import { GoogleButton } from '@/components/auth/GoogleButton'

beforeEach(() => { signInWithOAuth.mockClear() })

describe('GoogleButton', () => {
  it('starts Google OAuth with intent and next in redirectTo', async () => {
    render(<GoogleButton intent="organizer_signup" next="/dashboard" />)
    await userEvent.click(screen.getByRole('button'))
    const arg = signInWithOAuth.mock.calls[0][0]
    expect(arg.provider).toBe('google')
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback\?intent=organizer_signup&next=%2Fdashboard$/)
    expect(arg.options.queryParams).toEqual({ prompt: 'select_account' })
  })

  it('omits query params when neither intent nor next is given', async () => {
    render(<GoogleButton />)
    await userEvent.click(screen.getByRole('button'))
    const arg = signInWithOAuth.mock.calls[0][0]
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback$/)
  })
})
