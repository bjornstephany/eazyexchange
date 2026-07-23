import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/invitations', () => ({ respondToInvitation: vi.fn(async () => ({ ok: true })) }))

import { InviteResponseForm } from '@/components/InviteResponseForm'
import { respondToInvitation } from '@/actions/invitations'
import { EXCHANGE_TERMS_RESPOND_PARENT } from '@/lib/exchange-terms'

describe('InviteResponseForm (parent-facing, French)', () => {
  beforeEach(() => { vi.clearAllMocks(); (respondToInvitation as any).mockResolvedValue({ ok: true }) })

  it('renders the parent-facing heading and confirm CTA', () => {
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa Martin" exchangeName="Espagne · Automne 2026" preselect={null} />)
    expect(screen.getByText(/est invité·e à l’échange/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nous confirmons/i })).toBeInTheDocument()
  })
  it('confirms Yes inline (no navigation) with the setup-link copy', async () => {
    const user = userEvent.setup()
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="X" preselect={null} />)
    await user.click(screen.getByRole('button', { name: /nous confirmons/i }))
    expect(respondToInvitation).toHaveBeenCalledWith('t', 'yes', '')
    expect(await screen.findByText(/recevra un lien pour créer son accès/i)).toBeInTheDocument()
  })
  it('renders the structured error message and does not confirm', async () => {
    ;(respondToInvitation as any).mockResolvedValue({ ok: false, error: 'expired', message: 'Cette invitation a expiré.' })
    const user = userEvent.setup()
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="X" preselect={null} />)
    await user.click(screen.getByRole('button', { name: /nous confirmons/i }))
    expect(await screen.findByText('Cette invitation a expiré.')).toBeInTheDocument()
    expect(screen.queryByText(/recevra un lien/i)).not.toBeInTheDocument()
  })
  it('shows a generic French message on an unexpected throw (never error.message)', async () => {
    ;(respondToInvitation as any).mockRejectedValue(new Error('opaque digest 123'))
    const user = userEvent.setup()
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="X" preselect={null} />)
    await user.click(screen.getByRole('button', { name: /nous confirmons/i }))
    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument()
    expect(screen.queryByText(/opaque digest/i)).not.toBeInTheDocument()
  })
  it('confirms a No inline', async () => {
    const user = userEvent.setup()
    renderWithIntl(<InviteResponseForm token="t" studentName="" exchangeName="X" preselect={null} />)
    await user.click(screen.getByRole('button', { name: /^non$/i }))
    expect(await screen.findByText(/nous souhaitons le meilleur à votre enfant/i)).toBeInTheDocument()
  })
  it('reveals a questions textarea and sends a Maybe with the note', async () => {
    const user = userEvent.setup()
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="X" preselect={null} />)
    await user.click(screen.getByRole('button', { name: /nous avons des questions/i }))
    await user.type(screen.getByPlaceholderText(/vos questions pour l’organisateur/i), 'Quelles sont les dates ?')
    await user.click(screen.getByRole('button', { name: /envoyer mes questions/i }))
    expect(respondToInvitation).toHaveBeenCalledWith('t', 'maybe', 'Quelles sont les dates ?')
    expect(await screen.findByText(/nous avons noté vos questions/i)).toBeInTheDocument()
  })
  it('preselect=maybe reveals the questions textarea immediately', () => {
    renderWithIntl(<InviteResponseForm token="t" studentName="Léa" exchangeName="X" preselect="maybe" />)
    expect(screen.getByPlaceholderText(/vos questions pour l’organisateur/i)).toBeInTheDocument()
  })
  it('shows the parent terms notice directly under the confirm button', () => {
    renderWithIntl(<InviteResponseForm token="t" studentName="" exchangeName="X" preselect={null} />)
    expect(screen.getByText(EXCHANGE_TERMS_RESPOND_PARENT)).toBeInTheDocument()
  })
})
