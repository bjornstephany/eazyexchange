import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useSidebarCollapsed } from '@/components/shell/useSidebarCollapsed'

function Probe() {
  const { collapsed, toggle } = useSidebarCollapsed()
  return (
    <button type="button" onClick={toggle}>
      {collapsed ? 'collapsed' : 'expanded'}
    </button>
  )
}

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setWidth(1440)
  })

  it('defaults to expanded on a wide viewport with no stored value', () => {
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
  })

  it('defaults to collapsed on a narrow viewport with no stored value', () => {
    setWidth(1000)
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
  })

  it('a stored "true" wins over a wide viewport', () => {
    window.localStorage.setItem('ee.sidebar.collapsed', 'true')
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
  })

  it('a stored "false" wins over a narrow viewport', () => {
    setWidth(900)
    window.localStorage.setItem('ee.sidebar.collapsed', 'false')
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
  })

  it('toggle flips the value and persists it', () => {
    render(<Probe />)
    act(() => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('true')
    act(() => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('false')
  })
})
