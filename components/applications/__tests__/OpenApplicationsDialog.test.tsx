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

const now = new Date()
const FIRST_OF_THIS_MONTH =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
// The DateField day-cell's accessible name is the full date, not a bare
// number — computed independently of lib/dates so this isn't circular.
const FIRST_OF_THIS_MONTH_NAME = new Intl.DateTimeFormat('fr', {
  day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${FIRST_OF_THIS_MONTH}T00:00:00`))
const DEADLINE_LABEL_EMPTY = 'Date limite des candidatures Choisir une date'
const DEADLINE_LABEL_CHOSEN = `Date limite des candidatures ${FIRST_OF_THIS_MONTH_NAME}`

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
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: FIRST_OF_THIS_MONTH_NAME }))
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, FIRST_OF_THIS_MONTH))
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(FIRST_OF_THIS_MONTH))
    // The trigger's accessible name now carries both the label and the picked
    // date — the regression the review flagged, since <Label htmlFor> alone
    // used to swallow the date from a screen reader.
    expect(screen.getByRole('button', { name: DEADLINE_LABEL_CHOSEN })).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copier' })).toBeEnabled())
    expect(screen.queryByText('Choisissez une date limite pour débloquer ces options.')).toBeNull()
  })

  it('sends pasted addresses once applications are open', async () => {
    send.mockResolvedValue({ ok: true, sent: 2, skippedExchange: 0, skippedElsewhere: 0, invalid: 0 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: FIRST_OF_THIS_MONTH_NAME }))
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

    fireEvent.click(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: FIRST_OF_THIS_MONTH_NAME }))
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
  })

  it('carries no copy-before-closing warning — the link lives on in the panel', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: FIRST_OF_THIS_MONTH_NAME }))
    await screen.findByRole('button', { name: 'Terminé' })
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
  })

  it('surfaces a retryable error when opening applications fails', async () => {
    setApplicationOpen.mockRejectedValueOnce(new Error('boom'))
    const { onOpened } = setup()
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: FIRST_OF_THIS_MONTH_NAME }))
    await screen.findByText("Impossible d’ouvrir les candidatures. Veuillez réessayer.")
    expect(onOpened).not.toHaveBeenCalled()
    // The optimistic value is rolled back, so the field shows its empty placeholder
    // again — re-picking the same date still fires a fresh onChange call.
    expect(screen.getByRole('button', { name: DEADLINE_LABEL_EMPTY })).toHaveTextContent('Choisir une date')
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })
})
