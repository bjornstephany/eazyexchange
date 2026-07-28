import { describe, it, expect } from 'vitest'
import { buildManifest } from '../lib/manifest.mjs'

const base = {
  password: 'demo1234',
  domain: 'seed.example.com',
  school: 'Lycée Démo (seed)',
  exchange: 'Échange Démo 2026',
  students: [
    { slug: 'eleve-01', name: 'Camille Bernard', shape: 'untouched' },
    { slug: 'eleve-05', name: 'Léa Roux', shape: 'mixed' },
  ],
  highlights: ['eleve-05'],
  labels: { untouched: 'rien commencé', mixed: 'états mélangés' },
}

describe('buildManifest', () => {
  it('puts both organizers first, then the students', () => {
    const m = buildManifest(base)
    expect(m.accounts.map((a) => a.role)).toEqual(['organizer', 'organizer', 'student', 'student'])
  })

  it('builds addresses from slug and domain', () => {
    const m = buildManifest(base)
    expect(m.accounts.map((a) => a.email)).toEqual([
      'orga@seed.example.com',
      'orga-2@seed.example.com',
      'eleve-01@seed.example.com',
      'eleve-05@seed.example.com',
    ])
  })

  it('labels each student with their shape', () => {
    const m = buildManifest(base)
    const lea = m.accounts.find((a) => a.email.startsWith('eleve-05'))
    expect(lea.note).toBe('états mélangés')
    expect(lea.name).toBe('Léa Roux')
  })

  it('marks highlighted students and both organizers', () => {
    const m = buildManifest(base)
    const highlighted = m.accounts.filter((a) => a.highlight).map((a) => a.email)
    expect(highlighted).toContain('orga@seed.example.com')
    expect(highlighted).toContain('eleve-05@seed.example.com')
    expect(highlighted).not.toContain('eleve-01@seed.example.com')
  })

  it('falls back to the shape name when no label exists', () => {
    const m = buildManifest({
      ...base,
      students: [{ slug: 'eleve-09', name: 'X', shape: 'brand-new' }],
      highlights: [],
    })
    expect(m.accounts.at(-1).note).toBe('brand-new')
  })

  it('carries the password, world names and a version', () => {
    const m = buildManifest(base)
    expect(m).toMatchObject({
      version: 1,
      password: 'demo1234',
      school: 'Lycée Démo (seed)',
      exchange: 'Échange Démo 2026',
    })
  })
})

describe('buildManifest — reserved smoke accounts', () => {
  const withSmoke = {
    ...base,
    smokeStudents: [{ slug: 'smoke-01', name: 'Smoke Un', shape: 'untouched' }],
  }

  it('appends them after the human students and flags them', () => {
    const m = buildManifest(withSmoke)
    expect(m.accounts.at(-1)).toMatchObject({
      email: 'smoke-01@seed.example.com',
      role: 'student',
      smoke: true,
      highlight: false,
    })
  })

  it('marks every other account as not reserved', () => {
    const m = buildManifest(withSmoke)
    for (const a of m.accounts.slice(0, -1)) {
      expect(a.smoke).toBe(false)
    }
  })

  it('defaults to no reserved accounts when none are passed', () => {
    expect(buildManifest(base).accounts.some((a) => a.smoke)).toBe(false)
  })
})
