import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import fr from '@/messages/fr.json'

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

async function fillName() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
  return user
}

describe('NewExchangeModal', () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    replace.mockClear()
    createExchange.mockReset()
  })

  it('renders a single name field and no partner/year inputs', () => {
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} />)
    expect(screen.getByLabelText('Nom de l’échange')).toBeInTheDocument()
    expect(screen.queryByLabelText('Année')).toBeNull()
    expect(screen.queryByLabelText('Établissement partenaire')).toBeNull()
    expect(screen.getByRole('button', { name: 'Créer l’échange' })).toBeInTheDocument()
  })

  it('shows the trial notice for trial users', () => {
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} isTrial remaining={1} />)
    expect(screen.getByRole('note')).toHaveTextContent(/période d’essai/)
    expect(screen.getByRole('note')).toHaveTextContent(/un seul échange/)
  })

  it('shows a remaining-count notice for a paid finite plan', () => {
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} isTrial={false} remaining={2} />)
    expect(screen.getByRole('note')).toHaveTextContent(/2 échanges à créer/)
    expect(screen.getByRole('note')).toHaveTextContent(/consommera un/)
  })

  it('shows no notice for an unlimited (Scale) plan', () => {
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} isTrial={false} remaining={Infinity} />)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('shows an invalid-input error inline and keeps the dialog open with the submit button re-enabled', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    const onOpenChange = vi.fn()
    renderWithIntl(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillName()
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))

    expect(await screen.findByText(EXCHANGE_INVALID_MESSAGE)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Créer l’échange' })).not.toBeDisabled()
  })

  it('redirects to /billing when the plan cap is hit', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'limit', message: EXCHANGE_LIMIT_MESSAGE })
    const onOpenChange = vi.fn()
    renderWithIntl(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillName()
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/billing'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The redacted cap message must not linger on screen.
    expect(screen.queryByText(EXCHANGE_LIMIT_MESSAGE)).toBeNull()
  })

  it('shows a clean generic message when the action throws unexpectedly', async () => {
    createExchange.mockRejectedValueOnce(new Error('redacted in prod anyway'))
    const onOpenChange = vi.fn()
    renderWithIntl(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillName()
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))

    expect(await screen.findByText('Une erreur est survenue. Veuillez réessayer.')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('closes the dialog and navigates to the dashboard on successful submit', async () => {
    createExchange.mockResolvedValueOnce({ ok: true })
    const onOpenChange = vi.fn()
    renderWithIntl(<NewExchangeModal open onOpenChange={onOpenChange} />)

    const user = await fillName()
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('clears a stale error when the dialog is closed and reopened', async () => {
    createExchange.mockResolvedValueOnce({ ok: false, error: 'invalid', message: EXCHANGE_INVALID_MESSAGE })
    const onOpenChange = vi.fn()
    const { rerender } = renderWithIntl(
      <NewExchangeModal open onOpenChange={onOpenChange} />
    )

    const user = await fillName()
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))
    expect(await screen.findByText(EXCHANGE_INVALID_MESSAGE)).toBeInTheDocument()

    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <NewExchangeModal open={false} onOpenChange={onOpenChange} />
      </NextIntlClientProvider>
    )
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <NewExchangeModal open onOpenChange={onOpenChange} />
      </NextIntlClientProvider>
    )

    expect(screen.queryByText(EXCHANGE_INVALID_MESSAGE)).toBeNull()
  })

  it('hides the collaborator section for non-owners', () => {
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} isOwner={false} />)
    expect(screen.queryByText(/Inviter un collaborateur/)).toBeNull()
  })

  it('lets an owner add and dedupe collaborator chips and submits them', async () => {
    createExchange.mockResolvedValueOnce({ ok: true })
    renderWithIntl(<NewExchangeModal open onOpenChange={() => {}} isOwner />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: /Inviter un collaborateur/ }))
    const emailInput = screen.getByPlaceholderText('adresse@etablissement.fr')
    await user.type(emailInput, 'collega@x.fr{Enter}')
    await user.type(emailInput, 'collega@x.fr{Enter}') // duplicate → ignored
    expect(screen.getAllByText('collega@x.fr')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))
    const fd = createExchange.mock.calls[0][0] as FormData
    expect(fd.getAll('invite_email')).toEqual(['collega@x.fr'])
  })

  it('shows inviteErrors inline while still closing on ok', async () => {
    createExchange.mockResolvedValueOnce({ ok: true, inviteErrors: [{ email: 'bad', message: 'Adresse e-mail invalide.' }] })
    const onOpenChange = vi.fn()
    renderWithIntl(<NewExchangeModal open onOpenChange={onOpenChange} isOwner />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom de l’échange'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: 'Créer l’échange' }))
    expect(await screen.findByText(/bad/)).toBeInTheDocument()
    expect(await screen.findByText(/Adresse e-mail invalide\./)).toBeInTheDocument()
  })
})
