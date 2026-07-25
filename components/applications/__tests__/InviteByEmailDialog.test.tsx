import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...a),
}))

import { InviteByEmailDialog } from '../InviteByEmailDialog'

beforeEach(() => { send.mockReset() })

describe('InviteByEmailDialog', () => {
  it('sends pasted emails and shows the result summary', async () => {
    send.mockResolvedValue({ ok: true, sent: 2, skippedExchange: 1, skippedElsewhere: 0, invalid: 1 })
    renderWithIntl(<InviteByEmailDialog exchangeId="ex1" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@x.co\nb@x.co' } })
    fireEvent.click(screen.getByText('Envoyer les invitations'))
    await waitFor(() => expect(send).toHaveBeenCalledWith('ex1', 'a@x.co\nb@x.co'))
    await screen.findByText('2 envoyée·s · 1 déjà dans la liste · 1 invalide·s')
  })

  it('shows the not-open error', async () => {
    send.mockResolvedValue({ ok: false, notOpen: true })
    renderWithIntl(<InviteByEmailDialog exchangeId="ex1" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@x.co' } })
    fireEvent.click(screen.getByText('Envoyer les invitations'))
    await screen.findByText("Ouvrez d’abord les candidatures et fixez une date limite.")
  })
})
