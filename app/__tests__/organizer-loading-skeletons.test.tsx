import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import DashboardLoading from '@/app/(organizer)/dashboard/loading'
import ApplicationsLoading from '@/app/(organizer)/applications/loading'
import FormsLoading from '@/app/(organizer)/forms/loading'
import StudentsLoading from '@/app/(organizer)/students/loading'
import { LoadingState } from '@/components/LoadingState'

// /documents is now a bare redirect() to /forms (Fichiers tab merge) — it has
// no loading.tsx of its own, so it's not part of this list-route matrix.
const skeletons = [
  ['dashboard', DashboardLoading],
  ['applications', ApplicationsLoading],
  ['forms', FormsLoading],
  ['students', StudentsLoading],
] as const

describe('rail tab skeletons', () => {
  it.each(skeletons)('%s renders an accessible shimmer, not the splash', (_name, Loading) => {
    const { container, unmount } = renderWithIntl(<Loading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Chargement')
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeNull()
    unmount()
  })
})

// The deep-route loading.tsx files (exchanges/[id], forms/[templateId]) are
// one-line re-wraps of <LoadingState/>, now an async Server Component. Rendering
// its resolved output proves those routes keep the branded splash without
// unit-rendering an async component tree by hand.
describe('deep-route loading keeps the splash', () => {
  it('LoadingState renders the branded splash used by deep routes', async () => {
    renderWithIntl(await LoadingState())
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeInTheDocument()
  })
})
