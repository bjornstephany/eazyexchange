import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
const refresh = vi.fn()
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace }),
}))

const createExchange = vi.fn()
vi.mock('@/actions/exchanges', () => ({ createExchange: (...args: unknown[]) => createExchange(...args) }))

import { NewExchangeModal } from '@/components/shell/NewExchangeModal'
import { EXCHANGE_LIMIT_MESSAGE, EXCHANGE_INVALID_MESSAGE } from '@/lib/billing/exchange-limit'

async function fillRequiredFields() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Nom de l'échange"), 'France–Canada 2026')
  await user.clear(screen.getByLabelText('Année'))
  await user.type(screen.getByLabelText('Année'), '2026')
  await user.type(screen.getByLabelText('Établissement partenaire'), 'Lycée Victor Hugo')
  return user
}

describe('NewExchangeModal', () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    replace.mockClear()
    createExchange.mockReset()
  })

  it('renders the French form', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} />)
    expect(screen.getByText('Nouvel échange')).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'échange")).toBeInTheDocument()
    expect(screen.getByLabelText('Année')).toBeInTheDocument()
    expect(screen.getByLabelText('Établissement partenaire')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).toBeNull()
    expect(screen.getByRole('button', { name: "Créer l'échange" })).toBeInTheDocument()
  })

  it('shows the trial notice for trial users', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} isTrial remaining={1} />)
    expect(screen.getByRole('note')).toHaveTextContent(/période d’essai/)
    expect(screen.getByRole('note')).toHaveTextContent(/un seul échange/)
  })

  it('shows a remaining-count notice for a paid finite plan', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} isTrial={false} remaining={2} />)
    expect(screen.getByRole('note')).toHaveTextContent(/2 échanges à créer/)
    expect(screen.getByRole('note')).toHaveTextContent(/consommera un/)
  })

  it('shows no notice for an unlimited (Scale) plan', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} isTrial={false} remaining={Infinity} />)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('shows an invalid-input error inline and keeps the dialog open with the submit button re-enabled', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    expect(await screen.findByText(EXCHANGE_INVALID_MESSAGE)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: "Créer l'échange" })).not.toBeDisabled()
  })

  it('redirects to /billing when the plan cap is hit', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE })
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/billing'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The redacted cap message must not linger on screen.
    expect(screen.queryByText(EXCHANGE_LIMIT_MESSAGE)).toBeNull()
  })

  it('shows a clean generic message when the action throws unexpectedly', async () => {
    createExchange.mockRejectedValueOnce(new Error('redacted in prod anyway'))
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('closes the dialog and navigates to the dashboard on successful submit', async () => {
    createExchange.mockResolvedValueOnce({ ok: true })
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('clears a stale error when the dialog is closed and reopened', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <NewExchangeModal open onOpenChange={onOpenChange} />
    )

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))
    expect(await screen.findByText(EXCHANGE_INVALID_MESSAGE)).toBeInTheDocument()

    rerender(<NewExchangeModal open={false} onOpenChange={onOpenChange} />)
    rerender(<NewExchangeModal open onOpenChange={onOpenChange} />)

    expect(screen.queryByText(EXCHANGE_INVALID_MESSAGE)).toBeNull()
  })
})
