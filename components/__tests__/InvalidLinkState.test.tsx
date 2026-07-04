import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvalidLinkState } from '@/components/InvalidLinkState'

describe('InvalidLinkState', () => {
  it('renders the passed title and body', () => {
    render(<InvalidLinkState title="Ce lien a expire" body="Demande un nouveau lien." />)
    expect(screen.getByText('Ce lien a expire')).toBeTruthy()
    expect(screen.getByText('Demande un nouveau lien.')).toBeTruthy()
  })
})
