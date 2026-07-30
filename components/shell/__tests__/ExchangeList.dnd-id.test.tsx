import { describe, it, expect, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({
  usePathname: () => '/students',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/actions/session', () => ({
  setActiveExchange: vi.fn().mockResolvedValue(undefined),
  setExchangeOrder: vi.fn().mockResolvedValue({ ok: true }),
}))

// Deliberately NOT mocking @dnd-kit — the sibling ExchangeList.test.tsx stubs
// both providers to make drag behaviour deterministic, and that stub is exactly
// what hid this bug: the real useUniqueId never ran there.
import { ExchangeList } from '@/components/shell/ExchangeList'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: true },
]

function gripDescribedBy() {
  return screen
    .getByRole('button', { name: 'Réordonner France–Canada 2026' })
    .getAttribute('aria-describedby')
}

// @dnd-kit/utilities' useUniqueId counts off a MODULE-GLOBAL `ids` object:
//
//   let ids = {}
//   const id = ids[prefix] == null ? 0 : ids[prefix] + 1
//
// On the server that module lives in the long-running Node process, so the
// counter climbs across REQUESTS — request 1 renders DndDescribedBy-0, request
// 2 renders -1. The client bundle is fresh on every page load and always
// renders -0, so every request after the server's first one hydrated with a
// mismatched aria-describedby ("A tree hydrated but some attributes … didn't
// match"). Passing DndContext an explicit `id` short-circuits the counter
// (`if (value) return value`) and makes the attribute deterministic.
//
// Two renders in one process is precisely the server's cross-request reuse.
describe('ExchangeList drag-handle description id', () => {
  it('is identical across renders, so SSR and hydration agree', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const first = gripDescribedBy()
    cleanup()

    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const second = gripDescribedBy()

    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })
})
