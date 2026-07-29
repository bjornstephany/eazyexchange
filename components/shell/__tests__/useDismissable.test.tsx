import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDismissable } from '@/components/shell/useDismissable'

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDismissable<HTMLDivElement>(open, onClose)
  return (
    <div>
      <div ref={ref} data-testid="inside">panel</div>
      <div data-testid="outside">elsewhere</div>
    </div>
  )
}

describe('useDismissable', () => {
  let onClose: () => void
  beforeEach(() => {
    onClose = vi.fn()
  })

  it('closes on pointerdown outside the ref', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on pointerdown inside the ref', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    render(<Harness open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing while closed', () => {
    render(<Harness open={false} onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not resubscribe when the callback identity changes each render', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const { rerender } = render(<Harness open onClose={() => {}} />)
    const afterFirst = addSpy.mock.calls.length
    rerender(<Harness open onClose={() => {}} />)
    expect(addSpy.mock.calls.length).toBe(afterFirst)
    addSpy.mockRestore()
  })
})
