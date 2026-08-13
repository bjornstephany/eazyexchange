import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const submitTemplateRequest = vi.fn()
vi.mock('@/actions/template-request', () => ({
  submitTemplateRequest: (...a: unknown[]) => submitTemplateRequest(...(a as [])),
}))

import { TemplateLibrary } from '@/components/applications/TemplateLibrary'

const onSelect = vi.fn()

function renderLibrary(selected: 'standard' | null = null) {
  return renderWithIntl(<TemplateLibrary selected={selected} onSelect={onSelect} />)
}

function pdf(name = 'dossier.pdf', type = 'application/pdf', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  submitTemplateRequest.mockResolvedValue({ ok: true })
})

describe('TemplateLibrary — inspecting a template', () => {
  it('opens a preview listing the template’s real questions', async () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: /Voir les questions — Questionnaire standard/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // Labels come from the apply catalog through editorRows — the same source
    // the funnel and the editor use, so this is the applicant's own wording.
    expect(screen.getAllByText('Nom').length).toBeGreaterThan(0)
    expect(screen.getByText('Photo récente')).toBeInTheDocument()
    // All four sections, not just the first.
    for (const title of ['Élève', 'Parents', 'Conditions d’accueil', 'Profil de l’élève']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  // The whole point: looking is not choosing.
  it('inspecting selects nothing', async () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: /Voir les questions/ }))
    await screen.findByRole('dialog')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('« Choisir ce modèle » in the preview selects and closes it', async () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: /Voir les questions/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir ce modèle' }))

    expect(onSelect).toHaveBeenCalledWith('standard')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the one-click « Choisir » on the card', () => {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    expect(onSelect).toHaveBeenCalledWith('standard')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the chosen state on the selected card', () => {
    renderLibrary('standard')
    expect(screen.getByRole('button', { name: 'Choisi ✓' })).toBeInTheDocument()
  })
})

describe('TemplateLibrary — requesting a template', () => {
  function openDialog() {
    renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer mon formulaire' }))
    return screen.findByRole('dialog')
  }

  it('asks for a blank copy, on PII grounds', async () => {
    await openDialog()
    expect(screen.getByText('Envoyez un exemplaire vierge, sans réponses ni données d’élèves.')).toBeInTheDocument()
  })

  it('cannot be submitted without a file', async () => {
    await openDialog()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('sends the file and the note, then confirms', async () => {
    await openDialog()
    fireEvent.change(screen.getByLabelText(/Votre formulaire/), { target: { files: [pdf()] } })
    fireEvent.change(screen.getByLabelText('Précisions (facultatif)'), { target: { value: 'Le nôtre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(submitTemplateRequest).toHaveBeenCalled())
    const body = submitTemplateRequest.mock.calls[0][0] as FormData
    expect((body.get('file') as File).name).toBe('dossier.pdf')
    expect(body.get('note')).toBe('Le nôtre')
    expect(await screen.findByText(/Bien reçu/)).toBeInTheDocument()
  })

  it('rejects an unsupported file in the browser, without calling the action', async () => {
    await openDialog()
    fireEvent.change(screen.getByLabelText(/Votre formulaire/), {
      target: { files: [pdf('x.zip', 'application/zip')] },
    })
    expect(await screen.findByText(/Format non accepté/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
    expect(submitTemplateRequest).not.toHaveBeenCalled()
  })

  // A refusal is a structured reason, mapped to localized copy — never a
  // thrown message, which production would redact to a digest.
  it('shows the reason the action returned', async () => {
    submitTemplateRequest.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    await openDialog()
    fireEvent.change(screen.getByLabelText(/Votre formulaire/), { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText(/Trop d’envois/)).toBeInTheDocument()
    expect(screen.queryByText(/Bien reçu/)).toBeNull()
  })

  it('shows a failure rather than a merci when the send fails', async () => {
    submitTemplateRequest.mockResolvedValue({ ok: false, reason: 'failed' })
    await openDialog()
    fireEvent.change(screen.getByLabelText(/Votre formulaire/), { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText(/L’envoi a échoué/)).toBeInTheDocument()
    expect(screen.queryByText(/Bien reçu/)).toBeNull()
  })
})
