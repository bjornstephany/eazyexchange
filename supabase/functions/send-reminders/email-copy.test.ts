import { describe, it, expect } from 'vitest'
import { buildSubject, buildEmail, type ReminderForm } from './email-copy'

const APP_URL = 'https://app.test'

// ASCII apostrophe between two letters = French typography regression (copy
// must use the typographic ’). Markup quotes and &#39;-escaped user input
// never sit between two letters, so they cannot false-positive.
const ASCII_APOSTROPHE = /\p{L}'\p{L}/u

// Fixtures are deliberately apostrophe-free: buildSubject interpolates the
// exchange name UNESCAPED, so an apostrophe-bearing fixture would trip the
// guard. Escaping behavior has its own dedicated test below.
const form = (over: Partial<ReminderForm> = {}): ReminderForm => ({
  name: 'Passeport',
  deadline: '2026-10-10',
  overdue: false,
  ...over,
})

describe('buildSubject', () => {
  it('names the exchange when there is exactly one', () => {
    expect(buildSubject(['Espagne 2026'], false)).toBe('Rappel : ton dossier pour Espagne 2026')
  })

  it('switches to « Action requise » when anything is overdue', () => {
    expect(buildSubject(['Espagne 2026'], true)).toBe('Action requise : ton dossier pour Espagne 2026')
  })

  it('falls back to generic wording — with a typographic apostrophe — for multi-exchange', () => {
    expect(buildSubject(['Espagne 2026', 'Canada 2027'], false)).toBe('Rappel : ton dossier d’échange')
  })
})

describe('buildEmail', () => {
  it('greets the student, names the exchange, lists forms with French short dates', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('Bonjour Yanis,')
    expect(html).toContain('ton dossier pour <strong>Espagne 2026</strong>')
    expect(html).toContain('Passeport')
    expect(html).toContain('10 oct') // frShortDate; tolerate the locale's trailing period
  })

  it('falls back to a bare greeting when the student has no name', () => {
    expect(buildEmail('', ['Espagne 2026'], [form()], APP_URL)).toContain('Bonjour,')
  })

  it('uses generic multi-exchange wording with a typographic apostrophe', () => {
    const html = buildEmail('Yanis', ['Espagne 2026', 'Canada 2027'], [form()], APP_URL)
    expect(html).toContain('à ton dossier d’échange :')
  })

  it('flags overdue forms', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form({ overdue: true })], APP_URL)
    expect(html).toContain('en retard — date limite')
  })

  it('keeps the typographic apostrophe in the footer', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('ton dossier d’échange scolaire est en cours de préparation')
  })

  it('links to the passed appUrl', () => {
    const html = buildEmail('Yanis', ['Espagne 2026'], [form()], APP_URL)
    expect(html).toContain('href="https://app.test/my-forms"')
  })

  it('escapes user-supplied content (behavior carried over from index.ts)', () => {
    const html = buildEmail('<Yanis>', ['Espagne <2026>'], [form({ name: 'AST <sortie>' })], APP_URL)
    expect(html).toContain('&lt;Yanis&gt;')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).toContain('AST &lt;sortie&gt;')
    expect(html).not.toContain('<Yanis>')
  })
})

describe('ASCII-apostrophe guard across the rendered matrix', () => {
  const oneForm = [form()]
  const twoForms = [form(), form({ name: 'Autorisation de sortie', deadline: '2026-11-02' })]

  for (const exchangeNames of [['Espagne 2026'], ['Espagne 2026', 'Canada 2027']]) {
    for (const formSet of [oneForm, twoForms]) {
      for (const overdue of [false, true]) {
        const label = `${exchangeNames.length} exchange(s) × ${formSet.length} form(s) × overdue=${overdue}`
        it(`subject and body are ASCII-apostrophe-free: ${label}`, () => {
          const rendered = formSet.map(f => ({ ...f, overdue }))
          expect(buildSubject(exchangeNames, overdue)).not.toMatch(ASCII_APOSTROPHE)
          expect(buildEmail('Yanis', exchangeNames, rendered, APP_URL)).not.toMatch(ASCII_APOSTROPHE)
        })
      }
    }
  }
})
