import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

let mockPathname = '/students'
const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
const setActive = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/session', () => ({ setActiveExchange: (id: string) => setActive(id) }))

import { ExchangeList } from '@/components/shell/ExchangeList'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: true },
]

describe('ExchangeList', () => {
  beforeEach(() => {
    push.mockClear()
    setActive.mockClear()
    mockPathname = '/students'
  })

  it('lists every exchange with the group header and the add pill', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /France–Canada 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Espagne 2026/ })).toBeInTheDocument()
  })

  it('renders the Archivé pill for an archived row', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const row = screen.getByRole('button', { name: /Espagne 2026/ })
    expect(row).toHaveTextContent('Archivé')
  })

  it('clicking an inactive row switches and navigates to /dashboard', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('does not navigate when already on /dashboard', async () => {
    mockPathname = '/dashboard'
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    expect(push).not.toHaveBeenCalled()
  })

  it('clicking the active row is a no-op', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(setActive).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('the add pill calls onNewExchange', () => {
    const onNewExchange = vi.fn()
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={onNewExchange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }))
    expect(onNewExchange).toHaveBeenCalled()
  })

  it('shows the empty state with zero exchanges', () => {
    renderWithIntl(
      <ExchangeList exchanges={[]} activeId={null} collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Aucun échange')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('collapsed: dots only, names survive as accessible titles', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed onNewExchange={() => {}} />,
    )
    expect(screen.queryByText('Mes échanges')).toBeNull()
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
    expect(screen.getByRole('button', { name: 'France–Canada 2026' }))
      .toHaveAttribute('title', 'France–Canada 2026')
  })
})
