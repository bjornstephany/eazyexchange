import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { DateField } from '@/components/ui/date-field'

// Opens the popover and hands back the onChange spy. Default value puts the
// view on September 2026, a month whose 1st is a Tuesday.
function open(value = '2026-09-10') {
  const onChange = vi.fn()
  renderWithIntl(<DateField value={value} onChange={onChange} />)
  const name = value
    ? new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(`${value}T00:00:00`))
    : 'Choisir une date'
  fireEvent.click(screen.getByRole('button', { name }))
  return onChange
}

describe('the trigger', () => {
  it('shows the date in the caller locale', () => {
    renderWithIntl(<DateField value="2026-09-01" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '1 septembre 2026' })).toBeInTheDocument()
  })

  it('shows a placeholder when there is no date yet', () => {
    renderWithIntl(<DateField value="" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choisir une date' })).toBeInTheDocument()
  })

  it('carries the id and the external label, so <Label htmlFor> still pairs', () => {
    renderWithIntl(
      <>
        <span id="lbl">Date limite</span>
        <DateField value="" onChange={vi.fn()} id="fld" ariaLabelledBy="lbl" />
      </>,
    )
    expect(screen.getByLabelText('Date limite')).toHaveAttribute('id', 'fld')
  })
})

describe('paging through months', () => {
  // The reported bug: the calendar used to close on every month change, so
  // reaching next June meant re-opening it nine times.
  it('keeps the calendar open, and reports nothing, while the month changes', () => {
    const onChange = open()
    expect(screen.getByText('septembre 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('août 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('juillet 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByText('août 2026')).toBeInTheDocument()

    // Still open, and still nothing persisted.
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rolls the year over', () => {
    open('2026-01-10')
    expect(screen.getByText('janvier 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByText('décembre 2025')).toBeInTheDocument()
  })
})

describe('picking a day', () => {
  it('reports the ISO date once and closes', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: '15' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-09-15')
    expect(screen.queryByRole('button', { name: 'Mois suivant' })).not.toBeInTheDocument()
  })

  it('reports the month on screen, not the month the value came from', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith('2026-10-03')
  })

  it('opens on today when there is no value yet', () => {
    const onChange = vi.fn()
    renderWithIntl(<DateField value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une date' }))
    const now = new Date()
    expect(screen.getByText(
      new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric' }).format(now),
    )).toBeInTheDocument()
  })
})

describe('disabled', () => {
  it('cannot be opened', () => {
    renderWithIntl(<DateField value="2026-09-10" onChange={vi.fn()} disabled />)
    const trigger = screen.getByRole('button', { name: '10 septembre 2026' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: 'Mois suivant' })).not.toBeInTheDocument()
  })
})
