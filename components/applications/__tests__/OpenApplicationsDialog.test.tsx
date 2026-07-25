import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({
  setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a),
}))
const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...a),
}))

import { OpenApplicationsDialog } from '@/components/applications/OpenApplicationsDialog'

function setup(onOpened = vi.fn(), onOpenChange = vi.fn()) {
  renderWithIntl(
    <OpenApplicationsDialog
      exchangeId="ex1"
      applySlug="france-canada"
      open
      onOpenChange={onOpenChange}
      onOpened={onOpened}
    />
  )
  return { onOpened, onOpenChange }
}

beforeEach(() => {
  setApplicationOpen.mockClear()
  send.mockReset()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('OpenApplicationsDialog', () => {
  it('locks both invite methods until a deadline is chosen', () => {
    setup()
    expect(screen.getByText('Choisissez une date limite pour débloquer ces options.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Envoyer les invitations' })).toBeDisabled()
  })

  it('choosing a deadline opens applications and unlocks both methods', async () => {
    const { onOpened } = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-01'))
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('2026-09-01'))
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copier' })).toBeEnabled())
    expect(screen.queryByText('Choisissez une date limite pour débloquer ces options.')).toBeNull()
  })

  it('never persists an empty deadline', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '' } })
    expect(setApplicationOpen).not.toHaveBeenCalled()
  })

  it('sends pasted addresses once applications are open', async () => {
    send.mockResolvedValue({ ok: true, sent: 2, skippedExchange: 0, skippedElsewhere: 0, invalid: 0 })
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalled())
    const box = screen.getByPlaceholderText(/marie@ecole\.fr/)
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.change(box, { target: { value: 'a@x.co\nb@x.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer les invitations' }))
    await waitFor(() => expect(send).toHaveBeenCalledWith('ex1', 'a@x.co\nb@x.co'))
    await screen.findByText('2 envoyée·s · 0 déjà dans la liste · 0 invalide·s')
  })

  it('shows Cancel before opening and Terminé after, and both close the dialog', async () => {
    const { onOpenChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('button', { name: 'Terminé' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
  })

  it('carries no copy-before-closing warning — the link lives on in the panel', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
  })

  it('surfaces a retryable error when opening applications fails', async () => {
    setApplicationOpen.mockRejectedValueOnce(new Error('boom'))
    const { onOpened } = setup()
    const field = screen.getByLabelText('Date limite des candidatures')
    fireEvent.change(field, { target: { value: '2026-09-01' } })
    await screen.findByText("Impossible d’ouvrir les candidatures. Veuillez réessayer.")
    expect(onOpened).not.toHaveBeenCalled()
    // The optimistic value is rolled back, so re-picking the same date still fires a change.
    expect(field).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })
})
