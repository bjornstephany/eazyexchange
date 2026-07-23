import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({
  createExchange: vi.fn(),
  getExchangeProgressSummaries: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/components/shell/FeedbackModal', () => ({
  FeedbackModal: () => null,
}))
// Expose the prefetch prop as a DOM attribute so it can be asserted.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }: any) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false }]

describe('rail prefetch', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  })

  it('every rail tab prefetches its full payload', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    for (const label of ['Aperçu', 'Candidatures', 'Fichiers', 'Élèves']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-prefetch', 'true')
    }
  })
})
