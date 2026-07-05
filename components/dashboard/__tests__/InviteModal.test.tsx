import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }))
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))

import { InviteModal } from '@/components/dashboard/InviteModal'

function setup(onOpenChange = vi.fn()) {
  render(<InviteModal exchangeId="ex1" applySlug="france-canada" open onOpenChange={onOpenChange} />)
  return onOpenChange
}

beforeEach(() => {
  refresh.mockClear()
  setApplicationOpen.mockClear()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('InviteModal', () => {
  it('step 1 disables the open button until a deadline is chosen', () => {
    setup()
    const open = screen.getByRole('button', { name: 'Ouvrir les candidatures' })
    expect(open).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    expect(open).toBeEnabled()
  })

  it('opening applications calls setApplicationOpen and advances to the link step', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await waitFor(() =>
      expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-01')
    )
    expect(await screen.findByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
  })

  it('closing from step 1 closes immediately without warning or mutation', () => {
    const onOpenChange = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(setApplicationOpen).not.toHaveBeenCalled()
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
  })

  it('closing from the link step shows a warning, then closes on confirm', async () => {
    const onOpenChange = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.getByText(/Vous ne reverrez plus ce lien/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer quand même' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('cancelling the warning keeps the modal on the link step', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
  })
})
