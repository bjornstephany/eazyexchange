import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandingNav } from '@/components/landing/LandingNav'
import { landingContent } from '@/lib/landing/content'

// Menu items render in LOCALES order: en, fr, es, it, de.
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
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
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

describe('LandingNav language menu — keyboard cycling', () => {
  it('traps Tab inside the menu, wrapping in both directions', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    // Opens on the first item (English); Tab walks the five items in order.
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('menuitem', { name: 'Español' })).toHaveFocus()
    // Shift+Tab from the first item wraps to the last (Deutsch).
    await user.tab({ shift: true })
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('menuitem', { name: 'Deutsch' })).toHaveFocus()
  })

  it('moves focus between menuitems with ArrowDown and ArrowUp (wrapping)', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveFocus()
    // ArrowUp from the first item wraps to the last (Deutsch).
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Deutsch' })).toHaveFocus()
  })
})
