import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const createApplication = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  createApplication: (...a: unknown[]) => createApplication(...(a as [])),
}))
const send = vi.fn()
vi.mock('@/actions/applications-review', () => ({
  sendApplicationInvitations: (...a: unknown[]) => send(...(a as [])),
}))

import { ApplicationSetup } from '@/components/applications/ApplicationSetup'
import { standardQuestionnaire } from '@/lib/application-templates/library'

// Today is always inside the calendar's opening month view and is never
// "before today", so it is the one date that is safe to pick whenever the
// suite runs. The day-cell's accessible name is the full date, computed
// independently of lib/dates so this isn't circular.
const now = new Date()
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const longFr = (iso: string) => new Intl.DateTimeFormat('fr', {
  day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(`${iso}T00:00:00`))
const DEADLINE_EMPTY = 'Date limite des candidatures Choisir une date'

function renderSetup(over: Partial<Parameters<typeof ApplicationSetup>[0]> = {}) {
  return renderWithIntl(
    <ApplicationSetup
      exchangeId="ex-1"
      applySlug="france-canada"
      created={false}
      applicationTemplate={null}
      applicationDeadline={null}
      questionCount={55}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createApplication.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('ApplicationSetup — Vierge', () => {
  it('shows the blank state and nothing else', () => {
    renderSetup()
    expect(screen.getByRole('heading', { name: 'Aucune candidature' })).toBeInTheDocument()
    expect(screen.getByText('Choisissez un modèle pour commencer.')).toBeInTheDocument()
    expect(screen.queryByText('Choisissez un modèle')).toBeNull()
  })

  it('the CTA opens the library', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
    expect(screen.getByText('Questionnaire standard')).toBeInTheDocument()
  })

  // ENTERING THE LIBRARY IS NEVER DESTRUCTIVE: the write happens on
  // « Ajouter », not on « Choisir ».
  it('neither opening the library nor choosing a card writes anything', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(createApplication).not.toHaveBeenCalled()
  })
})

describe('ApplicationSetup — Bibliothèque', () => {
  // One decision at a time: the deadline belongs to the candidature being
  // created, so it has nothing to ask before a template exists to attach it to.
  it('does not show the deadline until a template is chosen', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    expect(screen.queryByRole('button', { name: DEADLINE_EMPTY })).toBeNull()
    expect(screen.queryByText('Date limite des candidatures')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(screen.getByRole('button', { name: DEADLINE_EMPTY })).toBeInTheDocument()
  })

  // « Changer de modèle » starts with the current template already picked, so
  // the field is there from the first frame — and still carries its date.
  it('shows the deadline immediately when re-entering with a template already chosen', () => {
    renderSetup({ created: true, applicationTemplate: 'standard', applicationDeadline: TODAY })
    fireEvent.click(screen.getByRole('button', { name: 'Changer de modèle' }))
    expect(screen.getByRole('button', { name: `Date limite des candidatures ${longFr(TODAY)}` })).toBeInTheDocument()
  })

  it('keeps « Ajouter la candidature » disabled until both a template and a deadline are chosen', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    const add = screen.getByRole('button', { name: 'Ajouter la candidature' })
    expect(add).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(add).toBeDisabled()                       // template only — not enough
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    expect(add).toBeEnabled()
  })

  it('creating switches to the created card with no navigation at all', async () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la candidature' }))
    await waitFor(() => expect(createApplication).toHaveBeenCalledWith('ex-1', 'standard', TODAY))
    // The returned doc is enough to render the card — the screen never waits
    // on a server round-trip it cannot observe.
    expect(await screen.findByText('Candidature · Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText(`55 questions · date limite ${longFr(TODAY)}`)).toBeInTheDocument()
  })

  it('surfaces a refusal as its own message and stays in the library', async () => {
    createApplication.mockResolvedValue({ ok: false, reason: 'deadline_past' })
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: DEADLINE_EMPTY }))
    fireEvent.click(screen.getByRole('button', { name: longFr(TODAY) }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la candidature' }))
    expect(await screen.findByText(/une candidature ouverte sur une date passée/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
  })

  it('« Annuler » returns to the blank state', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une candidature' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByRole('heading', { name: 'Aucune candidature' })).toBeInTheDocument()
  })
})

describe('ApplicationSetup — Créée', () => {
  const createdProps = {
    created: true, applicationTemplate: 'standard', applicationDeadline: '2026-06-12',
  }

  it('names the template, counts the questions and offers all three actions', () => {
    renderSetup(createdProps)
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
    expect(screen.getByText(`55 questions · date limite ${longFr('2026-06-12')}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Personnaliser/ })).toHaveAttribute('href', '/applications/questionnaire')
    expect(screen.getByRole('button', { name: 'Changer de modèle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inviter les élèves' })).toBeInTheDocument()
  })

  // A legacy exchange can sit at application_open = true with a null deadline.
  // Never render « date limite » with nothing after it.
  it('drops the deadline clause when there is no deadline', () => {
    renderSetup({ ...createdProps, applicationDeadline: null })
    expect(screen.getByText('55 questions')).toBeInTheDocument()
    expect(screen.queryByText(/date limite/)).toBeNull()
  })

  // NULL means « created before templates existed » — it resolves to standard,
  // never to a blank name.
  it('resolves a null template to the standard one', () => {
    renderSetup({ ...createdProps, applicationTemplate: null })
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
  })

  it('the invite dialog carries BOTH methods', () => {
    renderSetup(createdProps)
    fireEvent.click(screen.getByRole('button', { name: 'Inviter les élèves' }))
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/marie@ecole\.fr/)).toBeInTheDocument()
  })

  it('« Changer de modèle » re-enters the library with the deadline pre-filled, and cancelling comes back here', () => {
    renderSetup(createdProps)
    fireEvent.click(screen.getByRole('button', { name: 'Changer de modèle' }))
    expect(screen.getByRole('heading', { name: 'Choisissez un modèle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Date limite des candidatures ${longFr('2026-06-12')}` }))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('Candidature · Questionnaire standard')).toBeInTheDocument()
  })
})
