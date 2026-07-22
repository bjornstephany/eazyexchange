import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicationReadView } from '@/components/ApplicationReadView'

describe('ApplicationReadView', () => {
  it('maps radio values to their labels in the requested language', () => {
    render(<ApplicationReadView data={{ family_status: 'step_family', sex: 'female' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('Famille recomposée')).toBeInTheDocument()
    expect(screen.getByText('Fille')).toBeInTheDocument()
  })

  it('falls back to the raw string for legacy free-text answers', () => {
    render(<ApplicationReadView data={{ sex: 'F', pronouns: 'she' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('F')).toBeInTheDocument()
    expect(screen.getByText('she')).toBeInTheDocument()
  })

  it('renders yes/no answers as Oui/Non in French and Yes/No in English', () => {
    const { unmount } = render(<ApplicationReadView data={{ smoking_home: 'yes', own_room: 'no' }} photoUrl={null} lang="fr" />)
    expect(screen.getByText('Oui')).toBeInTheDocument()
    expect(screen.getByText('Non')).toBeInTheDocument()
    unmount()
    render(<ApplicationReadView data={{ smoking_home: 'yes' }} photoUrl={null} lang="en" />)
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('renders an em dash for missing answers', () => {
    render(<ApplicationReadView data={{}} photoUrl={null} lang="fr" />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
