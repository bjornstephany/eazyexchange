import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion as removeFromDoc } from '@/lib/application-fields'

const removeQuestion = vi.fn()
const resetQuestionnaire = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  removeQuestion: (...a: unknown[]) => removeQuestion(...(a as [])),
  resetQuestionnaire: (...a: unknown[]) => resetQuestionnaire(...(a as [])),
}))

import { QuestionnaireEditor } from '@/components/applications/QuestionnaireEditor'

beforeEach(() => {
  vi.clearAllMocks()
  removeQuestion.mockImplementation(async (_id: string, sectionId: never, questionId: string) =>
    ({ ok: true, doc: removeFromDoc(standardQuestionnaire(), sectionId, questionId) }))
  resetQuestionnaire.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
})

function renderEditor(over: Partial<Parameters<typeof QuestionnaireEditor>[0]> = {}) {
  return renderWithIntl(
    <QuestionnaireEditor exchangeId="ex-1" initialDoc={standardQuestionnaire()} locked={false} applicationCount={0} {...over} />,
  )
}

describe('QuestionnaireEditor', () => {
  it('renders all four sections, always', () => {
    renderEditor()
    for (const title of ['Élève', 'Parents', 'Conditions d’accueil', 'Profil de l’élève']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  it('gives the three invitation-driving questions a lock and no remove button', () => {
    renderEditor()
    expect(screen.queryByRole('button', { name: /Retirer — Nom$/ })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText(/sert à envoyer l’invitation/)).toHaveLength(3)
  })

  it('offers the portrait for removal like any other question', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: /Retirer — Photo récente/ })).toBeInTheDocument()
  })

  it('persists a removal immediately — there is no save button', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ }))
    expect(removeQuestion).toHaveBeenCalledWith('ex-1', 'hosting', 'pets')
    expect(await screen.findByText(/9 questions/)).toBeInTheDocument()
  })

  it('warns before a cascading removal and only then persists both', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Genre/ }))
    expect(removeQuestion).not.toHaveBeenCalled()
    expect(screen.getByText(/entraîne une autre/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer les deux' }))
    expect(removeQuestion).toHaveBeenCalledWith('ex-1', 'student', 'sex')
  })

  it('is read-only once locked, and says why', () => {
    renderEditor({ locked: true, applicationCount: 12 })
    expect(screen.getByText(/12 candidatures ont déjà été reçues/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Réinitialiser' })).not.toBeInTheDocument()
  })

  it("shows the server's refusal code as a sentence, never a digest", async () => {
    const user = userEvent.setup()
    removeQuestion.mockResolvedValue({ ok: false, reason: 'locked' })
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Retirer — Animaux domestiques/ }))
    expect(await screen.findByText(/verrouillé/)).toBeInTheDocument()
  })

  it('resets to the standard questionnaire after confirming', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(resetQuestionnaire).toHaveBeenCalledWith('ex-1')
  })
})
