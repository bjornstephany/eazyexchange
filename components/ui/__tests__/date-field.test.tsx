import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { DateField } from '@/components/ui/date-field'

// The same "12 septembre 2026" formatting date-field.tsx uses (via lib/dates'
// longDate), computed independently here so the day-cell aria-label
// assertions aren't circular.
function longFr(iso: string) {
  return new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${iso}T00:00:00`))
}

// Opens the popover and hands back the onChange spy. Default value puts the
// view on September 2026, a month whose 1st is a Tuesday.
function open(value = '2026-09-10') {
  const onChange = vi.fn()
  renderWithIntl(<DateField value={value} onChange={onChange} />)
  const name = value ? longFr(value) : 'Choisir une date'
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

  it('carries the id, and combines the external label with the formatted date in the accessible name', () => {
    renderWithIntl(
      <>
        <span id="lbl">Date limite</span>
        <DateField value="2026-09-01" onChange={vi.fn()} id="fld" ariaLabelledBy="lbl" />
      </>,
    )
    // Both the external <Label>'s text and the trigger's own date must reach
    // a screen reader — a bare "Date limite" (the label alone) is the
    // regression this guards: an <input type="date"> always announced both
    // its label and its value, and losing the value here would be worse than
    // the native picker it replaced.
    const trigger = screen.getByRole('button', { name: 'Date limite 1 septembre 2026' })
    expect(trigger).toHaveAttribute('id', 'fld')
  })

  it('falls back to just the label when there is no date yet', () => {
    renderWithIntl(
      <>
        <span id="lbl">Date limite</span>
        <DateField value="" onChange={vi.fn()} id="fld" ariaLabelledBy="lbl" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Date limite Choisir une date' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-09-15') }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-09-15')
    expect(screen.queryByRole('button', { name: 'Mois suivant' })).not.toBeInTheDocument()
  })

  it('reports the month on screen, not the month the value came from', () => {
    const onChange = open()
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-10-03') }))
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

describe('accessibility of the popover and its day cells', () => {
  // Regression coverage for the review finding: Radix stamps role="dialog" on
  // the popover with no accessible name, and a bare day number gives a
  // screen reader no month or year to anchor on after paging.
  it('names the popover dialog with the month on screen', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'septembre 2026' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByRole('dialog', { name: 'octobre 2026' })).toBeInTheDocument()
  })

  it('names each day cell with its full date', () => {
    open('2026-09-10')
    const calendar = within(screen.getByRole('dialog'))
    expect(calendar.getByRole('button', { name: longFr('2026-09-10') })).toBeInTheDocument()
    expect(calendar.getByRole('button', { name: longFr('2026-09-15') })).toBeInTheDocument()
  })

  // "Today" and the selected value can be two different cells, or the same
  // one — pinned with fake timers so the assertion doesn't depend on which
  // day this suite happens to run on.
  describe('selection vs. today, on a fixed clock', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-20T12:00:00'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('marks the selected day aria-pressed, distinct from the aria-current today cell', () => {
      open('2026-09-10') // selected day ≠ today (the 20th)
      const calendar = within(screen.getByRole('dialog'))

      const selected = calendar.getByRole('button', { name: longFr('2026-09-10') })
      expect(selected).toHaveAttribute('aria-pressed', 'true')
      expect(selected).not.toHaveAttribute('aria-current')

      const todayCell = calendar.getByRole('button', { name: longFr('2026-09-20') })
      expect(todayCell).toHaveAttribute('aria-current', 'date')
      expect(todayCell).toHaveAttribute('aria-pressed', 'false')
    })

    it('carries both attributes when today is also the selected day', () => {
      open('2026-09-20') // selected day = today
      const calendar = within(screen.getByRole('dialog'))

      const cell = calendar.getByRole('button', { name: longFr('2026-09-20') })
      expect(cell).toHaveAttribute('aria-pressed', 'true')
      expect(cell).toHaveAttribute('aria-current', 'date')
    })
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
