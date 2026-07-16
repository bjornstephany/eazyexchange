import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/exchanges', () => ({ updateReminderSettings: vi.fn(async () => {}) }))

import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'
import { updateReminderSettings } from '@/actions/exchanges'

describe('ReminderSettingsCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the three presets with the saved one selected', () => {
    renderWithIntl(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly={false} />)
    expect(screen.getByText('Rappels automatiques')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /normale/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /douce/i })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /insistante/i })).toBeInTheDocument()
  })

  it('saves a cadence change', async () => {
    const user = userEvent.setup()
    renderWithIntl(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly={false} />)
    await user.click(screen.getByRole('radio', { name: /insistante/i }))
    expect(updateReminderSettings).toHaveBeenCalledWith('ex-1', true, 'insistante')
  })

  it('turning reminders off hides the presets and saves', async () => {
    const user = userEvent.setup()
    renderWithIntl(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="douce" readOnly={false} />)
    await user.click(screen.getByRole('button', { name: 'Désactivés' }))
    expect(updateReminderSettings).toHaveBeenCalledWith('ex-1', false, 'douce')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('archived: read-only, nothing saved', async () => {
    const user = userEvent.setup()
    renderWithIntl(<ReminderSettingsCard exchangeId="ex-1" initialEnabled initialCadence="normale" readOnly />)
    expect(screen.getByText(/lecture seule/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Désactivés' }))
    expect(updateReminderSettings).not.toHaveBeenCalled()
  })
})
