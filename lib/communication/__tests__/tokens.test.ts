import { describe, it, expect } from 'vitest'
import { toEditor, toStored, tokenChip, type TokenLabels } from '@/lib/communication/tokens'

// The real French labels, apostrophe included — the transform must survive
// non-ASCII and typographic punctuation.
const FR: TokenLabels = {
  studentName: 'Prénom et nom de l’élève',
  exchangeName: 'Nom du programme',
}
const DE: TokenLabels = { studentName: 'Vor- und Nachname', exchangeName: 'Programmname' }

describe('tokenChip', () => {
  it('wraps a label in the double-bracket delimiters', () => {
    expect(tokenChip(FR.studentName)).toBe('[[Prénom et nom de l’élève]]')
  })
})

describe('toEditor', () => {
  it('renders each mustache token as its localized label', () => {
    expect(toEditor('{{student_name}}', FR)).toBe('[[Prénom et nom de l’élève]]')
    expect(toEditor('{{exchange_name}}', FR)).toBe('[[Nom du programme]]')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(toEditor('{{student_name}} et {{student_name}}', FR))
      .toBe('[[Prénom et nom de l’élève]] et [[Prénom et nom de l’élève]]')
  })

  it('leaves surrounding prose and newlines untouched', () => {
    expect(toEditor('Bonjour,\n\n{{student_name}} part !', FR))
      .toBe('Bonjour,\n\n[[Prénom et nom de l’élève]] part !')
  })

  it('leaves an unknown mustache token alone rather than mangling it', () => {
    expect(toEditor('{{unknown}}', FR)).toBe('{{unknown}}')
  })

  it('is locale-driven: the same storage renders differently per locale', () => {
    expect(toEditor('{{student_name}}', DE)).toBe('[[Vor- und Nachname]]')
  })
})

describe('toStored', () => {
  it('converts each localized label back to mustache', () => {
    expect(toStored('[[Prénom et nom de l’élève]]', FR)).toBe('{{student_name}}')
    expect(toStored('[[Nom du programme]]', FR)).toBe('{{exchange_name}}')
  })

  it('leaves unmatched brackets as literal text', () => {
    expect(toStored('[[Autre chose]]', FR)).toBe('[[Autre chose]]')
    expect(toStored('[[', FR)).toBe('[[')
    expect(toStored('a ] b [ c', FR)).toBe('a ] b [ c')
  })

  it('does not convert a label written without its brackets', () => {
    expect(toStored('Prénom et nom de l’élève', FR)).toBe('Prénom et nom de l’élève')
  })

  it('leaves mustache the organizer somehow typed by hand alone', () => {
    expect(toStored('{{student_name}}', FR)).toBe('{{student_name}}')
  })
})

describe('round trip', () => {
  const samples = [
    '{{student_name}} — {{exchange_name}}',
    'Bonjour,\n\nLa candidature de {{student_name}} pour {{exchange_name}} a été retenue !',
    'Aucun jeton ici.',
    '',
  ]
  it('toStored(toEditor(x)) === x for every stored sample', () => {
    for (const s of samples) expect(toStored(toEditor(s, FR), FR)).toBe(s)
  })
  it('toEditor(toStored(y)) === y for every editor sample', () => {
    for (const s of samples) {
      const editor = toEditor(s, FR)
      expect(toEditor(toStored(editor, FR), FR)).toBe(editor)
    }
  })
})
