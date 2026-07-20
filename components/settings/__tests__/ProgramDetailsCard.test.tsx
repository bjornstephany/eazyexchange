import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl as render } from '@/lib/test/renderWithIntl'
import { ProgramDetailsCard } from '../ProgramDetailsCard'

const saveMock = vi.fn()
vi.mock('@/actions/fillable', () => ({
  saveProgramDetails: (...args: unknown[]) => saveMock(...args),
}))

describe('ProgramDetailsCard', () => {
  beforeEach(() => saveMock.mockReset().mockResolvedValue({ ok: true as const }))

  it('renders empty fields with no initial row', () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    expect(screen.getByLabelText('Destination')).toHaveValue('')
  })

  it('submits parsed values (lists split on newlines)', async () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'le Minnesota, USA' } })
    fireEvent.change(screen.getByLabelText('Accompagnateurs'), { target: { value: 'A B\nC D\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const [exchangeId, input] = saveMock.mock.calls[0] as [string, { destination: string; chaperones: string[] }]
    expect(exchangeId).toBe('ex-1')
    expect(input.destination).toBe('le Minnesota, USA')
    expect(input.chaperones).toEqual(['A B', 'C D'])
  })

  it('surfaces the structured error message on { ok: false }', async () => {
    saveMock.mockResolvedValueOnce({ ok: false as const, message: 'Un champ dépasse 200 caractères.' })
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Un champ dépasse 200 caractères.')).toBeInTheDocument()
  })

  it('falls back to the generic error when the action throws', async () => {
    saveMock.mockRejectedValueOnce(new Error('boom'))
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument()
  })

  it('disables everything when readOnly', () => {
    render(<ProgramDetailsCard exchangeId="ex-1" initial={null} readOnly={true} />)
    expect(screen.getByLabelText('Destination')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('pre-fills from an existing row and joins lists with newlines', () => {
    render(
      <ProgramDetailsCard
        exchangeId="ex-1"
        initial={{
          exchange_id: 'ex-1',
          destination: 'le Minnesota, USA',
          travel_start: '2026-10-01',
          travel_end: '2026-10-15',
          chaperones: ['A B', 'C D'],
          association_name: 'Assoc',
          sending_school_name: 'Lycée A',
          receiving_school_name: 'School B',
          proviseur_name: 'M. X',
          sending_city: 'Paris',
          absence_dates: ['le jeudi 19 octobre 2026'],
          updated_at: '2026-01-01T00:00:00Z',
        }}
        readOnly={false}
      />,
    )
    expect(screen.getByLabelText('Destination')).toHaveValue('le Minnesota, USA')
    expect(screen.getByLabelText('Accompagnateurs')).toHaveValue('A B\nC D')
  })
})
