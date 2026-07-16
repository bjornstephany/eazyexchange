import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { LOCALE_NAMES } from '@/lib/i18n/config'

const updateLocale = vi.fn(async (_l: string) => {})
vi.mock('@/actions/settings', () => ({ updateLocale: (l: string) => updateLocale(l) }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LanguageSelect } from '@/components/settings/LanguageSelect'

describe('LanguageSelect', () => {
  it('lists all five languages by native name and defaults to the current locale', () => {
    renderWithIntl(<LanguageSelect current="fr" />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    }
    expect(select.value).toBe('fr')
  })

  it('calls updateLocale then refreshes on change', async () => {
    renderWithIntl(<LanguageSelect current="fr" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'de' } })
    await vi.waitFor(() => expect(updateLocale).toHaveBeenCalledWith('de'))
    expect(refresh).toHaveBeenCalled()
  })
})
