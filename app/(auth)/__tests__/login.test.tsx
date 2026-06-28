import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import LoginPage from '@/app/(auth)/login/page'

describe('LoginPage error banner', () => {
  it('surfaces a friendly message when signup provisioning failed', async () => {
    window.history.pushState({}, '', '/login?error=signup_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/couldn’t finish creating your account/i)).toBeInTheDocument()
  })

  it('surfaces the invite-invalid message', async () => {
    window.history.pushState({}, '', '/login?error=invite_invalid')
    render(<LoginPage />)
    expect(await screen.findByText(/invite link is invalid/i)).toBeInTheDocument()
  })
})
