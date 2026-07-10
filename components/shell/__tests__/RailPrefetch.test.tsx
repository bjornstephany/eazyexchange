import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))
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

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, archived: false }]

describe('rail prefetch', () => {
  it('every rail tab prefetches its full payload', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    for (const label of ['Aperçu', 'Échanges', 'Candid.', 'Formul.', 'Docs', 'Élèves']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-prefetch', 'true')
    }
  })
})
