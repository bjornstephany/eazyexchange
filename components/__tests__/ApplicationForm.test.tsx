import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/actions/apply', () => ({
  saveApplicationDraft: vi.fn(async () => ({ ok: true as const })),
  submitApplication: vi.fn(async () => ({ ok: true as const })),
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
  sendApplicationResumeLink: vi.fn(async () => {}),
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

beforeEach(() => { vi.clearAllMocks(); missingMock.mockReturnValue([]); localStorage.clear() })

function renderForm(over: Partial<Parameters<typeof ApplicationForm>[0]> = {}) {
  return render(
    <ApplicationForm token="t" slug="s" exchangeName="Échange Espagne" initialData={{}} initialLanguage="fr" initialPhotoUrl={null} {...over} />,
  )
}

describe('ApplicationForm', () => {
  it('renders header + submit, has no "Finish later" button, and shows the reassurance line', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.getByText('Échange Espagne')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /envoyer ma candidature/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminer plus tard/i })).not.toBeInTheDocument()
    expect(screen.getByText(/lien par e-mail/i)).toBeInTheDocument()
    expect(screen.getByText('ENREGISTRÉ ✓')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Application')).toBeInTheDocument()
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
    expect(await screen.findByText(/veuillez remplir tous les champs obligatoires/i)).toBeInTheDocument()
    expect(screen.getByText(/une photo est requise/i)).toBeInTheDocument()
    expect(submitApplication).not.toHaveBeenCalled()
    // validation was asked about the photo
    expect(missingMock).toHaveBeenCalledWith(expect.any(Object), { hasPhoto: false })
  })

  it('hides the separation housing address until family status is separated / step-family', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText(/adresse où sera accueilli le correspondant/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Séparé' }))
    expect(screen.getByText(/adresse où sera accueilli le correspondant/i)).toBeInTheDocument()
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
    vi.mocked(submitApplication).mockResolvedValueOnce({ ok: false, overLimit: ['sports'] })
    renderForm()
    await user.click(screen.getByRole('button', { name: /envoyer ma candidature/i }))
    expect(await screen.findByText(/dépassent la limite/i)).toBeInTheDocument()
    expect(screen.queryByText(/ta candidature a été envoyée/i)).not.toBeInTheDocument()
  })
})
