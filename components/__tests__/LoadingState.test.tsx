import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingState } from '@/components/LoadingState'

describe('LoadingState', () => {
  it('renders the wordmark and the loading caption', () => {
    render(<LoadingState />)
    expect(screen.getByText('Eazyexchange')).toBeTruthy()
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeTruthy()
  })
})
