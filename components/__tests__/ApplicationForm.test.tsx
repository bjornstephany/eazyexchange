import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
vi.mock('@/actions/apply', () => ({
  saveApplicationDraft: vi.fn(async () => ({ ok: true as const })),
  submitApplication: vi.fn(async () => ({ ok: true as const })),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
  setApplicationLanguage: vi.fn(async () => {}),
  downloadApplicationRecap: vi.fn(async () => ({ ok: true as const, filename: 'c.pdf', pdf: '' })),
}))
// Route the validation through a controllable mock so tests don't have to
// populate all ~50 required fields.
const missingMock = vi.fn((..._args: any[]) => [] as string[])
vi.mock('@/lib/application-form', async (orig) => {
  const actual = await (orig() as Promise<any>)
  return { ...actual, missingRequiredApplication: (...args: any[]) => missingMock(...args) }
})

import { ApplicationForm } from '@/components/ApplicationForm'
import { sendApplicationResumeLink, submitApplication } from '@/actions/apply'
import { storeResumeToken, readResumeToken } from '@/lib/apply-storage'
import { APPLICATION_SECTIONS } from '@/lib/application-form'

beforeEach(() => { vi.clearAllMocks(); missingMock.mockReturnValue([]); localStorage.clear() })

function renderForm(over: Partial<Parameters<typeof ApplicationForm>[0]> = {}) {
  return renderWithIntl(
    <ApplicationForm
      token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} locale="fr"
      initialPhotoUrl={null} sections={APPLICATION_SECTIONS} photoEnabled
      {...over}
    />,
  )
}

describe('ApplicationForm', () => {
  it('renders header + submit, has no "Finish later" button, shows the reassurance line and the language switcher', () => {
    renderForm()
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminer plus tard/i })).not.toBeInTheDocument()
    expect(screen.getByText(/lien par e-mail/i)).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()
    // The EN/FR two-button toggle became the shared combobox control.
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('fr')
  })

  it('"Resend link" re-emails the resume link', async () => {
    const user = userEvent.setup()
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /renvoyer le lien/i }))
    expect(sendApplicationResumeLink).toHaveBeenCalledWith('t')
  })

  it('clears the stored resume token on successful submit', async () => {
    const user = userEvent.setup()
    storeResumeToken('s', 't')
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(readResumeToken('s')).toBeNull()
  })

  it('offers the recap download on the confirmation screen', async () => {
    const user = userEvent.setup()
    renderForm({ exchangeName: 'X' })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/ta candidature a été envoyée/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeInTheDocument()
  })

  it('renders the photo upload card and the parent helper text', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /choisir une photo/i })).toBeInTheDocument()
    expect(screen.getByText('Remplissez au moins un parent en entier.')).toBeInTheDocument()
  })

  it('blocks submit and flags the photo when validation reports it missing', async () => {
    const user = userEvent.setup()
    missingMock.mockReturnValue(['photo'])
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/remplir tous les champs obligatoires/i)).toBeInTheDocument()
    expect(screen.getByText(/une photo est requise/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
    // validation was asked about the photo
    expect(missingMock).toHaveBeenCalledWith(
      expect.any(Object), { hasPhoto: false, photoRequired: true, sections: APPLICATION_SECTIONS },
    )
  })

  it('hides the separation housing address until family status is separated / step-family', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText(/adresse où sera accueilli le correspondant/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Séparé' }))
    expect(screen.getByText(/adresse où sera accueilli le correspondant/i)).toBeInTheDocument()
  })

  it('hides the gender specify field until "Autre" is selected', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText(/^précisez/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Autre' }))
    expect(screen.getByText(/^précisez/i)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Fille' }))
    expect(screen.queryByText(/^précisez/i)).not.toBeInTheDocument()
  })

  it('shows a live character counter on limited profile textareas', () => {
    renderForm({ initialData: { lived_abroad: 'abc' } })
    expect(screen.getByText('3/150')).toBeInTheDocument()
  })

  it('blocks submit client-side when an answer exceeds its limit', async () => {
    const user = userEvent.setup()
    renderForm({ initialData: { lived_abroad: 'x'.repeat(151) } })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/dépassent la limite/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
  })

  it('surfaces a server-side over-limit rejection without marking the form done', async () => {
    const user = userEvent.setup()
    vi.mocked(submitApplication).mockResolvedValueOnce({ ok: false, reason: 'too_long', fields: ['sports'] })
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/dépassent la limite/i)).toBeInTheDocument()
    expect(screen.queryByText(/ta candidature a été envoyée/i)).not.toBeInTheDocument()
  })

  it('blocks submit client-side on a malformed phone and flags the field', async () => {
    const user = userEvent.setup()
    renderForm({ initialData: { cell_phone: 'io' } })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/vérifie le format/i)).toBeInTheDocument()
    // Anchored: "Père — Téléphone portable" and its mother twin also match.
    expect(screen.getByLabelText(/^téléphone portable/i)).toHaveAttribute('aria-invalid', 'true')
    expect(submitApplication).not.toHaveBeenCalled()
  })

  it('blocks submit client-side on a malformed e-mail', async () => {
    const user = userEvent.setup()
    renderForm({ initialData: { email: 'marie@gmail.' } })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/vérifie le format/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
  })

  it('accepts a spaced French mobile number', async () => {
    const user = userEvent.setup()
    renderForm({ initialData: { cell_phone: '06 12 34 56 78' } })
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(submitApplication).toHaveBeenCalled()
  })

  it('surfaces a server-side bad-format rejection without marking the form done', async () => {
    const user = userEvent.setup()
    vi.mocked(submitApplication).mockResolvedValueOnce({ ok: false, reason: 'bad_format', fields: ['father_email'] })
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/vérifie le format/i)).toBeInTheDocument()
    expect(screen.queryByText(/ta candidature a été envoyée/i)).not.toBeInTheDocument()
  })
})

describe('ApplicationForm with a customized questionnaire', () => {
  const TRIMMED = [
    { id: 'student', fields: [
      { id: 'last_name', type: 'text' as const, required: true },
      { id: 'c_7f3a', type: 'textarea' as const, label: 'Sait nager ?', maxLength: 150 },
    ] },
    { id: 'parents', fields: [] },
    { id: 'hosting', fields: [] },
    { id: 'profile', fields: [] },
  ]

  it('renders a custom question with its typed label, untranslated', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.getByText('Sait nager ?')).toBeInTheDocument()
  })

  it('does not render a removed built-in question', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.queryByText('Animaux domestiques')).not.toBeInTheDocument()
  })

  it('does not render an empty section', () => {
    renderForm({ sections: TRIMMED })
    expect(screen.queryByText('Conditions d’accueil')).not.toBeInTheDocument()
    // …and the step counter counts only what is on screen.
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  it('hides the photo uploader when the portrait was removed', () => {
    renderForm({ sections: TRIMMED, photoEnabled: false })
    expect(screen.queryByText(/photo/i)).not.toBeInTheDocument()
  })

  it('still shows the student section when the photo is its only remaining question', () => {
    const photoOnly = TRIMMED.map(s => (s.id === 'student' ? { ...s, fields: [] } : s))
    renderForm({ sections: photoOnly, photoEnabled: true })
    expect(screen.getByText('Élève')).toBeInTheDocument()
  })
})
