import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('@/actions/forms', () => ({
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { TemplateCard } from '@/components/forms/TemplateCard'
import type { TemplateVM, AssigneeRow } from '@/lib/forms/rollup'

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Autorisation médicale',
  description: null, deadline: '2026-10-10T00:00:00+00:00', standard_key: 'medical',
  condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: [], assignees: [a('1', 'approved'), a('2', null)], ...over,
})

describe('TemplateCard', () => {
  it('active pdf card: name, type pill, status chip, response count, thumbnail shimmer', () => {
    renderWithIntl(<TemplateCard vm={vm({})} onOpen={() => {}} />)
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('PDF · à signer')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.getByTestId('thumb-shimmer')).toBeInTheDocument() // lazy: noop IO stub
  })

  it('pdf draft without file: dashed « PDF à joindre » and em-dash count', () => {
    renderWithIntl(<TemplateCard vm={vm({ status: 'draft', template_file_path: null, assignees: [] })} onOpen={() => {}} />)
    expect(screen.getByText('PDF à joindre')).toBeInTheDocument()
    expect(screen.getByText('Brouillon')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('online form: paper preview shows the real field labels', () => {
    renderWithIntl(<TemplateCard vm={vm({
      kind: 'online', template_file_path: null,
      fields: ['Groupe sanguin', 'Allergies connues', 'Médecin traitant'],
    })} onOpen={() => {}} />)
    expect(screen.getByText('Groupe sanguin')).toBeInTheDocument()
    expect(screen.getByText('Allergies connues')).toBeInTheDocument()
    expect(screen.getByText('Formulaire en ligne')).toBeInTheDocument()
  })

  it('doc: illustrative placeholder and requirement pill', () => {
    renderWithIntl(<TemplateCard vm={vm({ kind: 'doc', template_file_path: null, name: 'Passeport de l’élève' })} onOpen={() => {}} />)
    expect(screen.getByText('Copie à déposer')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
  })

  it('clicking anywhere on the card fires onOpen (no other buttons)', () => {
    const onOpen = vi.fn()
    renderWithIntl(<TemplateCard vm={vm({})} onOpen={onOpen} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
