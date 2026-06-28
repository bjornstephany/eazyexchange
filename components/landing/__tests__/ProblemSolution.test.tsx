import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProblemSolution } from '@/components/landing/ProblemSolution'
import { landingContent } from '@/lib/landing/content'

describe('ProblemSolution', () => {
  it('renders the problem and solution headings', () => {
    render(<ProblemSolution />)
    const { problemTitle, solutionTitle } = landingContent.problemSolution
    expect(screen.getByRole('heading', { name: problemTitle })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: solutionTitle })).toBeInTheDocument()
  })
})
