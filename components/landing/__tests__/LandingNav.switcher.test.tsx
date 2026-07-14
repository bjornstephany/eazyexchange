import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingNav } from '@/components/landing/LandingNav'
import { landingContent } from '@/lib/landing/content'
import { LOCALE_NAMES } from '@/lib/i18n/config'

describe('LandingNav language switcher', () => {
  const nav = landingContent.en.nav

  it('offers all five languages by native name', async () => {
    const user = userEvent.setup()
    render(<LandingNav nav={nav} lang="en" setLanguage={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /changer de langue/i }))
    for (const name of Object.values(LOCALE_NAMES)) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('calls setLanguage with the chosen locale', async () => {
    const spy = vi.fn()
    const user = userEvent.setup()
    render(<LandingNav nav={nav} lang="en" setLanguage={spy} />)
    await user.click(screen.getByRole('button', { name: /changer de langue/i }))
    await user.click(screen.getByRole('menuitem', { name: LOCALE_NAMES.de }))
    expect(spy).toHaveBeenCalledWith('de')
  })
})
