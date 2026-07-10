import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '@/components/ui/skeleton'

describe('Skeleton', () => {
  it('renders a shimmer block and merges caller classes', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('h-4')
    expect(el.className).toContain('w-32')
  })
})
