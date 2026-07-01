import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInWithOAuth = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}))

import { GoogleButton } from '@/components/auth/GoogleButton'

beforeEach(() => { signInWithOAuth.mockClear() })

describe('GoogleButton', () => {
  it('starts Google OAuth with intent and next in redirectTo', async () => {
    render(<GoogleButton intent="organizer_signup" next="/dashboard" />)
    await userEvent.click(screen.getByRole('button'))
    const arg = (signInWithOAuth.mock.calls[0] as any[])[0] as any
    expect(arg.provider).toBe('google')
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback\?intent=organizer_signup&next=%2Fdashboard$/)
  })

  it('omits query params when neither intent nor next is given', async () => {
    render(<GoogleButton />)
    await userEvent.click(screen.getByRole('button'))
    const arg = (signInWithOAuth.mock.calls[0] as any[])[0] as any
    expect(arg.options.redirectTo).toMatch(/\/auth\/callback$/)
  })
})
