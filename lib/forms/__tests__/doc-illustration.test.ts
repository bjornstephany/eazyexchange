import { describe, it, expect } from 'vitest'
import { docIllustrationKey, normalizeName } from '@/lib/forms/doc-illustration'

const tpl = (name: string, standard_key: string | null = null) => ({ name, standard_key })

describe('normalizeName', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeName('  Carte d’Identité ')).toBe('carte d’identite')
  })
})

describe('docIllustrationKey — standard library', () => {
  it('maps the three library documents', () => {
    expect(docIllustrationKey(tpl('Passeport de l’élève', 'passeport'))).toBe('passport')
    expect(docIllustrationKey(tpl('Passeport du parent', 'passeport-parent'))).toBe('passport-parent')
    expect(docIllustrationKey(tpl('ESTA', 'esta'))).toBe('travel-auth')
  })

  it('standard_key wins over a conflicting name keyword', () => {
    // Name says "photo", the library key says parent passport — key must win.
    expect(docIllustrationKey(tpl('Photo du passeport', 'passeport-parent'))).toBe('passport-parent')
  })

  it('ignores an unknown standard_key and falls through to the name', () => {
    expect(docIllustrationKey(tpl('Attestation d’assurance', 'not-a-key'))).toBe('insurance')
  })

  it('is not fooled by a prototype-valued standard_key', () => {
    expect(docIllustrationKey(tpl('Document divers', 'constructor'))).toBe('generic')
    expect(docIllustrationKey(tpl('Document divers', '__proto__'))).toBe('generic')
  })
})

describe('docIllustrationKey — custom names', () => {
  it.each([
    ['Passeport', 'passport'],
    ['Copy of passport', 'passport'],
    ['Photo d’identité', 'photo'],
    ['Carte d’identité', 'id-card'],
    ['carte d’identite', 'id-card'],
    ['CNI recto-verso', 'id-card'],
    ['Attestation d’assurance', 'insurance'],
    ['Insurance certificate', 'insurance'],
    ['Carnet de santé', 'medical'],
    ['Certificat de vaccination', 'medical'],
    ['Billet d’avion', 'ticket'],
    ['Flight confirmation', 'ticket'],
    ['RIB', 'bank'],
    ['Justificatif de domicile', 'address-proof'],
    ['Bulletin scolaire', 'school-record'],
    ['Visa étudiant', 'travel-auth'],
  ] as const)('%s → %s', (name, expected) => {
    expect(docIllustrationKey(tpl(name))).toBe(expected)
  })

  it('accent-insensitive: both spellings of identité agree', () => {
    expect(docIllustrationKey(tpl('Carte d’identité'))).toBe(
      docIllustrationKey(tpl('Carte d’identite')),
    )
  })

  it('photo wins over identité so « Photo d’identité » is a photo', () => {
    expect(docIllustrationKey(tpl('Photo d’identité'))).toBe('photo')
  })

  it('matches on word boundaries, not bare substrings', () => {
    // « bénévolat » contains "vol"; it must not become a plane ticket.
    expect(docIllustrationKey(tpl('Attestation de bénévolat'))).toBe('generic')
  })

  it('falls back to generic', () => {
    expect(docIllustrationKey(tpl('Document 1'))).toBe('generic')
    expect(docIllustrationKey(tpl(''))).toBe('generic')
    expect(docIllustrationKey(tpl('   '))).toBe('generic')
  })
})
