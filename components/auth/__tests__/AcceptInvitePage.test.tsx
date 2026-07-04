import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/actions/student-context', () => ({
  getStudentContext: vi.fn(async () => ({ fullName: '', firstName: '', initials: '', exchangeLabel: 'Espagne · Automne 2026' })),
}))

import AcceptInvitePage from '@/app/(auth)/accept-invite/page'

describe('AcceptInvitePage (French)', () => {
  it('renders the tutoiement heading and CTA', async () => {
    render(<AcceptInvitePage />)
    expect(screen.getByText(/configure ton compte/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /parti/i })).toBeInTheDocument()
  })
  it('shows the exchange pill once getStudentContext resolves', async () => {
    render(<AcceptInvitePage />)
    expect(await screen.findByText(/Espagne · Automne 2026/)).toBeInTheDocument()
  })
})
