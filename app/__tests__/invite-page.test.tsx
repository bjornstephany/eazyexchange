import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getInvitationMock = vi.fn()
vi.mock('@/actions/invitations', () => ({
  getInvitation: (...a: unknown[]) => getInvitationMock(...a),
  respondToInvitation: vi.fn(),
  resumeInviteSetup: vi.fn(),
}))

import InvitePage from '@/app/invite/[token]/page'

const BASE = {
  exchangeName: 'Espagne · Automne 2026', applicantName: 'Léa Martin',
  status: 'accepted', expired: false, setupComplete: null as boolean | null,
}

async function renderPage(r?: string) {
  render(await InvitePage({
    params: Promise.resolve({ token: 'tok-1' }),
    searchParams: Promise.resolve(r ? { r } : {}),
  }))
}

describe('InvitePage states (parent-facing)', () => {
  beforeEach(() => { getInvitationMock.mockReset() })

  it('shows the parent response form for an open invitation', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE })
    await renderPage()
    expect(screen.getByRole('button', { name: /nous confirmons/i })).toBeInTheDocument()
  })
  it('?r=maybe preselects the questions textarea on an open invitation', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE })
    await renderPage('maybe')
    expect(screen.getByPlaceholderText(/vos questions pour l’organisateur/i)).toBeInTheDocument()
  })
  it('shows the parent "already confirmed" card for an enrolled invite', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: true })
    await renderPage()
    expect(screen.getByText(/participation déjà confirmée/i)).toBeInTheDocument()
  })
  it('also shows "already confirmed" while stuck mid-enrollment (enrolling)', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolling', setupComplete: false })
    await renderPage()
    expect(screen.getByText(/participation déjà confirmée/i)).toBeInTheDocument()
  })
  it('an expired invite shows the expired dead-end', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'enrolled', setupComplete: false, expired: true })
    await renderPage()
    expect(screen.getByText(/cette invitation a expiré/i)).toBeInTheDocument()
  })
  it('declined invitations keep the already-answered dead-end', async () => {
    getInvitationMock.mockResolvedValue({ ...BASE, status: 'declined' })
    await renderPage()
    expect(screen.getByText(/a déjà reçu une réponse/i)).toBeInTheDocument()
  })
})
