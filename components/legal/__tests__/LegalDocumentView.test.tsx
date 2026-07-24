import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LegalDocumentView } from '../LegalDocumentView'
import type { LegalDocument } from '@/lib/legal'

const doc: LegalDocument = {
  slug: 'x',
  title: 'Titre du document',
  lastUpdated: '2026-07-20',
  intro: 'Introduction.',
  sections: [
    { id: 's1', heading: 'Section un', blocks: [{ t: 'p', text: 'Paragraphe.' }, { t: 'ul', items: ['a', 'b'] }] },
  ],
}

describe('LegalDocumentView', () => {
  it('renders title, heading and list items', () => {
    render(<LegalDocumentView doc={doc} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Titre du document' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Section un' })).toBeInTheDocument()
    expect(screen.getByText('a')).toBeInTheDocument()
  })

  // The table of contents was dropped; section ids stay so deep links resolve.
  it('renders no table-of-contents nav above the text', () => {
    render(<LegalDocumentView doc={doc} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Section un' })).not.toBeInTheDocument()
  })

  it('keeps the section id so deep links still resolve', () => {
    const { container } = render(<LegalDocumentView doc={doc} />)
    expect(container.querySelector('section#s1')).not.toBeNull()
  })

  it('shows the draft banner only when placeholders are present', () => {
    const { rerender } = render(<LegalDocumentView doc={doc} />)
    expect(screen.queryByText(/brouillon/i)).not.toBeInTheDocument()
    rerender(<LegalDocumentView doc={{ ...doc, intro: 'Édité par [PLACEHOLDER].' }} />)
    expect(screen.getByText(/brouillon/i)).toBeInTheDocument()
  })

  it('shows the draft banner when doc.draft is true, even with no placeholders', () => {
    render(<LegalDocumentView doc={{ ...doc, draft: true }} />)
    expect(screen.getByText(/brouillon/i)).toBeInTheDocument()
  })
})
