import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion as removeFromDoc, type SectionId } from '@/lib/application-fields'

const addQuestion = vi.fn()
const listQuestionSuggestions = vi.fn()
vi.mock('@/actions/questionnaire', () => ({
  addQuestion: (...a: unknown[]) => addQuestion(...(a as [])),
  listQuestionSuggestions: () => listQuestionSuggestions(),
}))

import { AddQuestionDialog } from '@/components/applications/AddQuestionDialog'

const onAdded = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  addQuestion.mockResolvedValue({ ok: true, doc: standardQuestionnaire() })
  listQuestionSuggestions.mockResolvedValue([])
})

function renderDialog(
  doc = removeFromDoc(standardQuestionnaire(), 'hosting', 'pets'),
  sectionId: SectionId = 'hosting',
) {
  return renderWithIntl(
    <AddQuestionDialog
      exchangeId="ex-1" sectionId={sectionId} doc={doc} open
      onOpenChange={vi.fn()} onAdded={onAdded}
    />,
  )
}

describe('AddQuestionDialog', () => {
  it('offers a removed built-in back, fully translated', async () => {
    renderDialog()
    expect(await screen.findByRole('button', { name: /Animaux domestiques/ })).toBeInTheDocument()
  })

  it('restores a built-in BY REFERENCE — never as a custom copy', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /Animaux domestiques/ }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', { kind: 'builtin', ref: 'pets' })
    expect(onAdded).toHaveBeenCalled()
  })

  it('says so plainly when the section has lost nothing', async () => {
    renderDialog(standardQuestionnaire())
    expect(await screen.findByText(/Toutes les questions du modèle sont présentes/)).toBeInTheDocument()
  })

  it('shows an empty suggestion zone at launch rather than hiding it', async () => {
    renderDialog()
    expect(await screen.findByText(/Aucune suggestion pour l’instant/)).toBeInTheDocument()
  })

  it('shows a suggestion with how many schools converged on it', async () => {
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    renderDialog()
    expect(await screen.findByRole('button', { name: /Sait nager \?/ })).toBeInTheDocument()
    expect(screen.getByText('7 établissements')).toBeInTheDocument()
  })

  it('adds a suggestion as a custom question with its banked wording', async () => {
    const user = userEvent.setup()
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /Sait nager \?/ }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Sait nager ?', type: 'yesno', required: false, options: undefined,
    })
  })

  it('does not suggest a phrasing the section already asks, spelled differently', async () => {
    listQuestionSuggestions.mockResolvedValue([{ label: 'Sait nager ?', type: 'yesno', options: null, schools: 7 }])
    const doc = standardQuestionnaire()
    doc.sections[2].fields.push({ id: 'c_1', type: 'yesno', label: 'sait nager?' })
    renderDialog(doc)
    expect(await screen.findByText(/Aucune suggestion pour l’instant/)).toBeInTheDocument()
  })

  it('creates a custom question from the form', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('Intitulé'), 'Sait nager ?')
    await user.click(screen.getByLabelText('Oui / Non'))
    await user.click(screen.getByLabelText('Réponse obligatoire'))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Sait nager ?', type: 'yesno', required: true, options: undefined,
    })
  })

  it('reveals the options field only for a multiple choice, and sends the lines', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByLabelText(/Choix \(un par ligne\)/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Intitulé'), 'Régime')
    await user.click(screen.getByLabelText('Choix multiple'))
    await user.type(screen.getByLabelText(/Choix \(un par ligne\)/), 'Végétarien\nAucun')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(addQuestion).toHaveBeenCalledWith('ex-1', 'hosting', {
      kind: 'custom', label: 'Régime', type: 'radio', required: false, options: ['Végétarien', 'Aucun'],
    })
  })

  it('keeps « Ajouter » inert until a label is typed', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  it("renders the server's refusal code as a sentence", async () => {
    const user = userEvent.setup()
    addQuestion.mockResolvedValue({ ok: false, reason: 'invalid_options' })
    renderDialog()
    await user.type(screen.getByLabelText('Intitulé'), 'Régime')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText(/au moins deux options/)).toBeInTheDocument()
  })

  // The portrait is the one question `removedBuiltIns` structurally cannot
  // report (it is not an AppField), so without its own entry here the ✕ on
  // « Photo récente » would be irreversible short of resetting the whole
  // questionnaire. Bjorn ruled it must be restorable; these pin that it is.
  describe('the portrait', () => {
    const withoutPhoto = () => removeFromDoc(standardQuestionnaire(), 'student', 'photo')

    it('is offered back once removed, like any other question', async () => {
      renderDialog(withoutPhoto(), 'student')
      expect(await screen.findByRole('button', { name: /Photo récente/ })).toBeInTheDocument()
    })

    it('is restored by reference, through the same builtin input as the rest', async () => {
      const user = userEvent.setup()
      renderDialog(withoutPhoto(), 'student')
      await user.click(await screen.findByRole('button', { name: /Photo récente/ }))
      expect(addQuestion).toHaveBeenCalledWith('ex-1', 'student', { kind: 'builtin', ref: 'photo' })
      expect(onAdded).toHaveBeenCalled()
    })

    it('is not offered while the section still asks for it', async () => {
      renderDialog(standardQuestionnaire(), 'student')
      expect(await screen.findByText(/Toutes les questions du modèle sont présentes/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Photo récente/ })).not.toBeInTheDocument()
    })

    it('belongs to the student section alone — no other section offers it', async () => {
      renderDialog(withoutPhoto(), 'hosting')
      expect(await screen.findByText(/Aucune suggestion pour l’instant/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Photo récente/ })).not.toBeInTheDocument()
    })
  })
})
