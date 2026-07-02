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

const LIMIT_ERROR = "Vous avez atteint la limite d'échanges de votre offre. Abonnez-vous pour en ajouter."

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
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName={false} />)
    expect(screen.getByText('Nouvel échange')).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'échange")).toBeInTheDocument()
    expect(screen.getByLabelText('Année')).toBeInTheDocument()
    expect(screen.getByLabelText('Établissement partenaire')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).toBeNull()
    expect(screen.getByRole('button', { name: "Créer l'échange" })).toBeInTheDocument()
  })

  it('shows the school-name field when needed', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName />)
    expect(screen.getByLabelText('Votre établissement')).toBeInTheDocument()
  })

  it('shows the French error and keeps the dialog open with the submit button re-enabled on failed submit', async () => {
    createExchange.mockRejectedValueOnce(new Error(LIMIT_ERROR))
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    expect(await screen.findByText(LIMIT_ERROR)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: "Créer l'échange" })).not.toBeDisabled()
  })

  it('shows the upgrade CTA link when the limit error is hit', async () => {
    createExchange.mockRejectedValueOnce(new Error(LIMIT_ERROR))
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    const cta = await screen.findByRole('link', { name: /Voir les offres/ })
    expect(cta).toHaveAttribute('href', '/billing')
  })

  it('does not show the upgrade CTA link for other errors', async () => {
    createExchange.mockRejectedValueOnce(new Error('Autre erreur'))
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    expect(await screen.findByText('Autre erreur')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Voir les offres/ })).toBeNull()
  })

  it('closes the dialog and navigates to the dashboard on successful submit', async () => {
    createExchange.mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()
    render(<NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />)

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(refresh).toHaveBeenCalled()
  })

  it('clears a stale error when the dialog is closed and reopened', async () => {
    createExchange.mockRejectedValueOnce(new Error(LIMIT_ERROR))
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />
    )

    const user = await fillRequiredFields()
    await user.click(screen.getByRole('button', { name: "Créer l'échange" }))
    expect(await screen.findByText(LIMIT_ERROR)).toBeInTheDocument()

    rerender(<NewExchangeModal open={false} onOpenChange={onOpenChange} needsSchoolName={false} />)
    rerender(<NewExchangeModal open onOpenChange={onOpenChange} needsSchoolName={false} />)

    expect(screen.queryByText(LIMIT_ERROR)).toBeNull()
  })
})
