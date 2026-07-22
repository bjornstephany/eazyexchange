import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { LOCALE_NAMES } from '@/lib/i18n/config'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'

describe('LanguageSwitcher', () => {
  it('lists all five languages by native name and shows the current one', () => {
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={vi.fn()} ariaLabel="Langue" />)
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    }
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('fr')
  })

  it('calls onSelect with the chosen locale', async () => {
    const onSelect = vi.fn(async () => {})
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={onSelect} ariaLabel="Langue" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } })
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith('de'))
  })

  it('disables the control while onSelect is in flight', async () => {
    let release: () => void = () => {}
    const onSelect = vi.fn(() => new Promise<void>(r => { release = r }))
    renderWithIntl(<LanguageSwitcher current="fr" onSelect={onSelect} ariaLabel="Langue" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'es' } })
    await vi.waitFor(() => expect(select.disabled).toBe(true))
    release()
    await vi.waitFor(() => expect(select.disabled).toBe(false))
  })
})
