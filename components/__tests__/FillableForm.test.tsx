import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FillableForm } from '../FillableForm'
import type { FillableDefinition } from '@/lib/forms/fillable/types'

const saveMock = vi.fn(async (..._args: unknown[]) => ({ ok: true as const }))
vi.mock('@/actions/fillable', () => ({
  saveFillable: (...args: unknown[]) => saveMock(...args),
}))
const routerPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

const def: FillableDefinition = {
  key: 'test', title: 'Test',
  variables: ['destination'],
  blocks: [
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous, soussignés ' },
      { t: 'blank', key: 'parent1', label: 'Nom du représentant légal 1' },
      { t: 'text', text: ', autorisons le voyage — ' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '.' },
    ] },
    { b: 'field', key: 'mother_phone', label: 'Portable de la mère', input: 'phone', required: false, prefix: '0 11 33' },
    { b: 'radio', key: 'regime', label: 'Régime', options: ['interne', 'externe'], required: false },
    { b: 'check', key: 'ok', runs: [{ t: 'text', text: 'J’accepte.' }], required: true },
    { b: 'signature', key: 'sig1', roleLabel: 'Représentant légal 1', required: true },
  ],
}

describe('FillableForm', () => {
  beforeEach(() => { saveMock.mockClear(); routerPush.mockClear() })

  it('substitutes variables into the text', () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'le Minnesota, USA' }}
      initialData={null} readOnly={false} studentName="Zoé" />)
    expect(screen.getByText(/le Minnesota, USA/)).toBeInTheDocument()
  })

  it('sends answers and signatures on submit', async () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'X' }}
      initialData={null} readOnly={false} studentName="Zoé" />)
    fireEvent.change(screen.getByLabelText('Nom du représentant légal 1'), { target: { value: 'Jean Dupont' } })
    fireEvent.click(screen.getByLabelText('J’accepte.'))
    fireEvent.change(screen.getByLabelText('Nom complet — Représentant légal 1'), { target: { value: 'Jean Dupont' } })
    fireEvent.click(screen.getByLabelText(/Lu et approuvé — Représentant légal 1/))
    fireEvent.click(screen.getByRole('button', { name: 'Signer et envoyer' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalled())
    const [assignmentId, input, submit] = saveMock.mock.calls[0] as [string, { answers: Record<string, string>; signatures: { key: string; approved: boolean }[] }, boolean]
    expect(assignmentId).toBe('a-1')
    expect(submit).toBe(true)
    expect(input.answers.parent1).toBe('Jean Dupont')
    expect(input.answers.ok).toBe('true')
    expect(input.signatures[0]).toMatchObject({ key: 'sig1', approved: true })
  })

  it('shows a structured error without navigating', async () => {
    saveMock.mockResolvedValueOnce({ ok: false, message: 'Complétez tout.' } as never)
    render(<FillableForm assignmentId="a-1" def={def} values={{}} initialData={null} readOnly={false} studentName="Zoé" />)
    fireEvent.click(screen.getByRole('button', { name: 'Signer et envoyer' }))
    await waitFor(() => expect(screen.getByText('Complétez tout.')).toBeInTheDocument())
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('readOnly renders values as text without buttons', () => {
    render(<FillableForm assignmentId="a-1" def={def} values={{ destination: 'X' }}
      initialData={{ answers: { parent1: 'Jean Dupont', mother_phone: '6 12 34 56 78', regime: 'externe', ok: 'true' }, signatures: [{ key: 'sig1', role_label: 'Représentant légal 1', full_name: 'Jean Dupont', signed_at: '2026-07-19T10:00:00Z' }] }}
      readOnly={true} studentName="Zoé" />)
    expect(screen.queryByRole('button', { name: 'Signer et envoyer' })).toBeNull()
    expect(screen.getAllByText(/Jean Dupont/).length).toBeGreaterThan(0)

    // field and radio render as plain document text, not editable controls (text is
    // split across a label span and a value strong, so match on aggregated textContent)
    expect(screen.getByText((_, el) => el?.textContent === 'Portable de la mère : 0 11 33 6 12 34 56 78')).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'Régime : externe')).toBeInTheDocument()
    expect(screen.getByText('☑')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
