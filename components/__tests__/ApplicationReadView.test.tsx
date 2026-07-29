import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { ApplicationReadView } from '@/components/ApplicationReadView'

// The view is an async Server Component now and follows the READER's locale
// (mocked to fr above) rather than a `lang` prop. The English side of the
// label catalog is covered by lib/pdf/__tests__/application-recap.test.ts.
describe('ApplicationReadView', () => {
  it('maps radio values to their labels in the requested language', async () => {
    renderWithIntl(await ApplicationReadView({ data: { family_status: 'step_family', sex: 'female' }, photoUrl: null }))
    expect(screen.getByText('Famille recomposée')).toBeInTheDocument()
    expect(screen.getByText('Fille')).toBeInTheDocument()
  })

  it('falls back to the raw string for legacy free-text answers', async () => {
    renderWithIntl(await ApplicationReadView({ data: { sex: 'F', pronouns: 'she' }, photoUrl: null }))
    expect(screen.getByText('F')).toBeInTheDocument()
    expect(screen.getByText('she')).toBeInTheDocument()
  })

  it('renders yes/no answers as Oui/Non in French', async () => {
    renderWithIntl(await ApplicationReadView({ data: { smoking_home: 'yes', own_room: 'no' }, photoUrl: null }))
    expect(screen.getByText('Oui')).toBeInTheDocument()
    expect(screen.getByText('Non')).toBeInTheDocument()
  })

  it('renders an em dash for missing answers', async () => {
    renderWithIntl(await ApplicationReadView({ data: {}, photoUrl: null }))
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders a custom question verbatim and skips an emptied section', async () => {
    const sections = [
      { id: 'student', fields: [{ id: 'c_7f3a', type: 'textarea' as const, label: 'Sait nager ?' }] },
      { id: 'parents', fields: [] },
      { id: 'hosting', fields: [] },
      { id: 'profile', fields: [] },
    ]
    renderWithIntl(await ApplicationReadView({ data: { c_7f3a: 'Oui' }, photoUrl: null, sections }))
    expect(screen.getByText('Sait nager ?')).toBeInTheDocument()
    expect(screen.getByText('Oui')).toBeInTheDocument()
    expect(screen.queryByText('Parents')).not.toBeInTheDocument()
  })
})
