import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { DossierView } from '@/components/student/DossierView'
import { buildDossier, type RawAssignment } from '@/lib/student/dossier'

function raw(id: string, status: string | null, deadline: string | null, exchange = 'Espagne 2026'): RawAssignment {
  return {
    id, assigned_at: '2026-01-01',
    form_templates: { id: `t-${id}`, name: `Pièce ${id}`, type: 'document_upload', deadline, exchanges: { name: exchange } },
    submissions: status === null ? null : [{ status: status as never, submitted_at: '2026-06-01', review_note: status === 'rejected' ? 'Photo illisible' : null }],
  }
}
const NOW = new Date('2026-07-01T00:00:00Z')

describe('DossierView', () => {
  it('renders the three status sections with counts and per-status actions', async () => {
    const d = buildDossier([
      raw('a', null, '2026-07-10'),
      raw('b', 'draft', '2026-07-05'),
      raw('c', 'rejected', '2026-06-20'),
      raw('d', 'submitted', '2026-07-08'),
      raw('e', 'approved', null),
    ], NOW)
    renderWithIntl(await DossierView({ dossier: d, firstName: 'Léa' }))
    expect(screen.getByText('Bonjour Léa,')).toBeTruthy()
    expect(screen.getByText('À faire · 3')).toBeTruthy()
    expect(screen.getByText('En vérification · 1')).toBeTruthy()
    expect(screen.getByText('Validés · 1')).toBeTruthy()
    expect(screen.getByText('Commencer')).toBeTruthy()   // no submission
    expect(screen.getByText('Continuer')).toBeTruthy()   // draft
    expect(screen.getByText('Corriger')).toBeTruthy()    // rejected
    expect(screen.getByText('Photo illisible')).toBeTruthy() // review note surfaced
    expect(screen.getByText('2 / 5 envoyés')).toBeTruthy()
  })

  it('shows the complete-dossier banner and no À-faire section when all approved', async () => {
    const d = buildDossier([raw('a', 'approved', null), raw('b', 'approved', null)], NOW)
    renderWithIntl(await DossierView({ dossier: d, firstName: 'Léa' }))
    expect(screen.getByText('Ton dossier est complet')).toBeTruthy()
    expect(screen.queryByText(/À faire/)).toBeNull()
    expect(screen.getByText('2 / 2 envoyés')).toBeTruthy()
  })

  it('shows the all-sent banner when nothing is left to do but review pending', async () => {
    const d = buildDossier([raw('a', 'submitted', '2026-07-08')], NOW)
    renderWithIntl(await DossierView({ dossier: d, firstName: 'Léa' }))
    expect(screen.getByText('Tout est envoyé')).toBeTruthy()
    expect(screen.queryByText(/À faire/)).toBeNull()
  })

  it('shows the gentle empty copy when nothing is assigned', async () => {
    const d = buildDossier([], NOW)
    renderWithIntl(await DossierView({ dossier: d, firstName: 'Léa' }))
    expect(screen.getByText(/Rien à remplir/)).toBeTruthy()
    expect(screen.queryByText(/envoyés/)).toBeNull()
  })

  it('shows a mono exchange tag on cards only when multi-exchange', async () => {
    const multi = buildDossier([raw('a', null, '2026-07-10', 'Espagne 2026'), raw('b', null, '2026-07-11', 'Italie 2026')], NOW)
    renderWithIntl(await DossierView({ dossier: multi, firstName: 'Léa' }))
    expect(screen.getByText('Espagne 2026')).toBeTruthy()
    expect(screen.getByText('Italie 2026')).toBeTruthy()
  })

  it('renders the "up to date" banner and no progress bar when nothing is assigned', async () => {
    const d = buildDossier([], NOW)
    renderWithIntl(await DossierView({ dossier: d, firstName: 'Léa' }))
    expect(screen.getByText(/Tout est . jour/)).toBeTruthy()  // accent-agnostic (à)
    expect(screen.queryByText(/envoyés/)).toBeNull()          // no progress row
  })
})
