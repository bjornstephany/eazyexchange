import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getInvitationMock = vi.fn()
vi.mock('@/actions/invitations', () => ({
  getInvitation: (...a: unknown[]) => getInvitationMock(...a),
  respondToInvitation: vi.fn(),
  resumeInviteSetup: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import InvitePage from '@/app/invite/[token]/page'

const BASE = {
  exchangeName: 'Espagne · Automne 2026', applicantName: 'Léa Martin',
  status: 'accepted', expired: false, setupComplete: null as boolean | null,
}

async function renderPage() {
  render(await InvitePage({ params: Promise.resolve({ token: 'tok-1' }) }))
}

describe('InvitePage states', () => {
  beforeEach(() => { getInvitationMock.mockReset() })

  it('shows the response form for an open invitation', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE })
    await renderPage()
    expect(screen.getByRole('button', { name: /je veux participer/i })).toBeInTheDocument()
  })
  it('offers to resume setup for an enrolled invite with incomplete setup', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: false })
    await renderPage()
    expect(screen.getByRole('button', { name: /reprendre la configuration/i })).toBeInTheDocument()
  })
  it('also offers resume while stuck mid-enrollment (enrolling)', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolling', setupComplete: false })
    await renderPage()
    expect(screen.getByRole('button', { name: /reprendre la configuration/i })).toBeInTheDocument()
  })
  it('links to /login once setup is complete', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: true })
    await renderPage()
    expect(screen.getByText(/ton compte est déjà actif/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute('href', '/login')
  })
  it('an expired enrolled invite keeps the dead-end (no resume)', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: false, expired: true })
    await renderPage()
    expect(screen.getByText(/cette invitation a expiré/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reprendre la configuration/i })).not.toBeInTheDocument()
  })
  it('declined invitations keep the already-answered dead-end', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'declined' })
    await renderPage()
    expect(screen.getByText(/a déjà reçu une réponse/i)).toBeInTheDocument()
  })
})
