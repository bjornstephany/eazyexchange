import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingNav } from '@/components/landing/LandingNav'
import { landingContent } from '@/lib/landing/content'

function setup() {
  const setLanguage = vi.fn()
  const user = userEvent.setup()
  render(<LandingNav nav={landingContent.fr.nav} lang="fr" setLanguage={setLanguage} />)
  const trigger = screen.getByRole('button', { name: /changer de langue/i })
  return { user, setLanguage, trigger }
}

describe('LandingNav language menu — focus management', () => {
  it('moves focus to the first menuitem when the menu opens', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('selecting a language calls setLanguage, closes the menu and restores focus to the trigger', async () => {
    const { user, trigger, setLanguage } = setup()
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(setLanguage).toHaveBeenCalledWith('en')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('wires aria-controls to the menu id and toggles aria-expanded', async () => {
    const { user, trigger } = setup()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(menu.id).not.toBe('')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on outside pointerdown without forcing focus back to the trigger', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })
})
