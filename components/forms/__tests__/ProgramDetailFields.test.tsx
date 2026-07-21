import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import {
  ProgramDetailFields, EMPTY_DETAIL_STATE, detailPatch,
} from '@/components/forms/ProgramDetailFields'

describe('ProgramDetailFields', () => {
  it('renders only the requested keys, with the Réglages labels', () => {
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['destination', 'travel_start']}
        state={EMPTY_DETAIL_STATE} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Destination')).toBeInTheDocument()
    expect(screen.getByLabelText('Date de départ')).toHaveAttribute('type', 'date')
    expect(screen.queryByLabelText('Accompagnateurs')).toBeNull()
  })

  it('renders list columns as textareas', () => {
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['chaperones']}
        state={EMPTY_DETAIL_STATE} onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText('Accompagnateurs').tagName).toBe('TEXTAREA')
  })

  it('reports edits by key', () => {
    const onChange = vi.fn()
    renderWithIntl(
      <ProgramDetailFields idPrefix="x" keys={['destination']}
        state={EMPTY_DETAIL_STATE} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Berlin' } })
    expect(onChange).toHaveBeenCalledWith('destination', 'Berlin')
  })
})

describe('detailPatch', () => {
  it('sends only the asked-for keys, splitting list columns on newlines', () => {
    const state = { ...EMPTY_DETAIL_STATE, destination: ' Berlin ', chaperones: 'A\n\n B ', sending_city: 'Luynes' }
    expect(detailPatch(['destination', 'chaperones'], state)).toEqual({
      destination: ' Berlin ', chaperones: ['A', 'B'],
    })
  })

  it('is empty when nothing was asked', () => {
    expect(detailPatch([], EMPTY_DETAIL_STATE)).toEqual({})
  })
})
