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
const setOrder = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/actions/session', () => ({
  setActiveExchange: (id: string) => setActive(id),
  setExchangeOrder: (ids: string[]) => setOrder(ids),
}))

// dnd-kit is browser physics — pointer capture, layout rects, autoscroll —
// none of which jsdom models, so a real keyboard/pointer drag here would be
// pure flake. Stub the two providers so the component renders its REAL markup
// (grips included) and capture onDragEnd to drive the drop path deterministically.
// The reorder math itself is pure and covered in lib/shell/__tests__/exchange-order.test.ts.
let dragEnd: ((event: unknown) => void) | undefined
let dragModifiers: unknown[] | undefined
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, modifiers }: {
    children: React.ReactNode
    onDragEnd: (e: unknown) => void
    modifiers?: unknown[]
  }) => {
    dragEnd = onDragEnd
    dragModifiers = modifiers
    return <>{children}</>
  },
  closestCenter: () => [],
  KeyboardSensor: function KeyboardSensor() {},
  PointerSensor: function PointerSensor() {},
  useSensor: () => undefined,
  useSensors: () => [],
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: 'vertical',
  sortableKeyboardCoordinates: () => undefined,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

import { ExchangeList } from '@/components/shell/ExchangeList'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: true },
]

// Row buttons are the only buttons whose text contains an exchange name; grips
// are icon-only and the add pill reads "+ Ajouter". getAllByRole returns
// document order, so this is the rendered order of the list.
function rowOrder() {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent ?? '')
    .filter((text) => text.includes('2026'))
}

describe('ExchangeList', () => {
  beforeEach(() => {
    push.mockClear()
    setActive.mockClear()
    setOrder.mockClear()
    dragEnd = undefined
    dragModifiers = undefined
    mockPathname = '/students'
  })

  // Without these a row drags downward without limit and upward past the
  // "Mes échanges" header. restrictToParentElement clamps travel to the rows'
  // own container, which is why it can handle non-uniform row heights (an
  // archived row carries an extra badge).
  it('bounds the drag to the vertical axis and to the rows container', async () => {
    const { restrictToParentElement, restrictToVerticalAxis } = await import('@dnd-kit/modifiers')
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(dragModifiers).toEqual([restrictToVerticalAxis, restrictToParentElement])
  })

  it('lists every exchange with the group header and the add pill', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^France–Canada 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Espagne 2026/ })).toBeInTheDocument()
  })

  it('renders the Archivé pill for an archived row', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const row = screen.getByRole('button', { name: /^Espagne 2026/ })
    expect(row).toHaveTextContent('Archivé')
  })

  it('clicking an inactive row switches and navigates to /dashboard', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('does not navigate when already on /dashboard', async () => {
    mockPathname = '/dashboard'
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    expect(push).not.toHaveBeenCalled()
  })

  it('clicking the active row is a no-op', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^France–Canada 2026/ }))
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

  it('expanded: every row carries a grip handle named for its exchange', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Réordonner France–Canada 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réordonner Espagne 2026' })).toBeInTheDocument()
  })

  it('collapsed: no grip handles — reordering is expanded-only', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed onNewExchange={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: /^Réordonner/ })).toBeNull()
  })

  it('dropping a row reorders the list and persists the complete id list', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(rowOrder()[0]).toContain('France–Canada 2026')

    dragEnd!({ active: { id: 'ex1' }, over: { id: 'ex2' } })

    await waitFor(() => expect(setOrder).toHaveBeenCalledWith(['ex2', 'ex1']))
    expect(rowOrder()[0]).toContain('Espagne 2026')
  })

  it('dropping a row on itself does not persist anything', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    dragEnd!({ active: { id: 'ex1' }, over: { id: 'ex1' } })
    expect(setOrder).not.toHaveBeenCalled()
  })

  it('a cancelled drag (no drop target) does not persist anything', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    dragEnd!({ active: { id: 'ex1' }, over: null })
    expect(setOrder).not.toHaveBeenCalled()
  })
})
