import { describe, it, expect } from 'vitest'
import {
  renderGoodNews,
  fillDetails,
  hasUnfilledPlaceholders,
  templateHasUnfilledPlaceholders,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'
import type { GoodNewsValues } from '@/lib/exchange/good-news-fields'

const DETAILS: GoodNewsValues = {
  travel_start: '2027-04-12',
  travel_end: '2027-04-26',
  participation_cost: '850 € par élève',
  payment_details: 'https://helloasso.example/adhesion',
  confirmation_deadline: '2027-01-15',
}

describe('renderGoodNews', () => {
  const base = { studentName: 'Marie Dupont', exchangeName: 'France-Canada 2026' }

  it('substitutes both placeholders in subject and body', () => {
    const { subject, bodyHtml } = renderGoodNews({
      subject: 'Bravo {{student_name}} — {{exchange_name}}',
      body: 'Bonjour, la candidature de {{student_name}} pour {{exchange_name}} est retenue.',
      ...base,
    })
    expect(subject).toBe('Bravo Marie Dupont — France-Canada 2026')
    expect(bodyHtml).toContain('Marie Dupont')
    expect(bodyHtml).toContain('France-Canada 2026')
    expect(bodyHtml).not.toContain('{{student_name}}')
    expect(bodyHtml).not.toContain('{{exchange_name}}')
  })

  it('HTML-escapes organizer body and substituted values', () => {
    const { bodyHtml } = renderGoodNews({
      subject: null,
      body: 'Note <b>importante</b> pour {{student_name}}',
      studentName: '<script>x</script>',
      exchangeName: 'E',
    })
    expect(bodyHtml).toContain('&lt;b&gt;importante&lt;/b&gt;')
    expect(bodyHtml).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(bodyHtml).not.toContain('<b>')
    expect(bodyHtml).not.toContain('<script>')
  })

  it('escapes detail values, which are organizer-authored too', () => {
    const { bodyHtml } = renderGoodNews({
      subject: null,
      body: 'Coût : {{participation_cost}}',
      details: { ...DETAILS, participation_cost: '<img src=x onerror=alert(1)>' },
      ...base,
    })
    expect(bodyHtml).toContain('&lt;img')
    expect(bodyHtml).not.toContain('<img')
  })

  it('converts newlines to <br> in the body', () => {
    const { bodyHtml } = renderGoodNews({ subject: null, body: 'ligne 1\nligne 2', ...base })
    expect(bodyHtml).toBe('ligne 1<br>ligne 2')
  })

  it('fills the default body from the program details', () => {
    const { bodyHtml } = renderGoodNews({ subject: null, body: null, details: DETAILS, ...base })
    expect(bodyHtml).not.toContain('{{')
    expect(bodyHtml).toContain('850 € par élève')
    expect(bodyHtml).toContain('helloasso')
    // Travel dates render as a period, both bounds carrying the year.
    expect(bodyHtml).toContain('du 12 avr. 2027 au 26 avr. 2027')
    expect(bodyHtml).toContain('15 janv. 2027')
  })

  it('leaves a token unsubstituted when its value is blank — the guard depends on it', () => {
    const { bodyHtml } = renderGoodNews({ subject: null, body: null, details: null, ...base })
    expect(bodyHtml).toContain('{{travel_dates}}')
    expect(bodyHtml).toContain('{{participation_cost}}')
    // Names are still substituted: they come from the application, not Réglages.
    expect(bodyHtml).toContain('Marie Dupont')
  })

  it('falls back to defaults when subject/body are null', () => {
    const { subject } = renderGoodNews({ subject: null, body: null, details: DETAILS, ...base })
    expect(subject).toContain('Marie Dupont')
    expect(subject).toContain('France-Canada 2026')
    expect(subject).not.toContain('{{')
  })

  it('falls back to defaults when subject/body are empty/whitespace', () => {
    const { subject, bodyHtml } = renderGoodNews({ subject: '   ', body: '\n', ...base })
    expect(subject).not.toBe('   ')
    expect(subject).toContain('Marie Dupont')
    expect(bodyHtml).not.toBe('')
  })

  it('the exported defaults carry the name tokens and the four detail tokens', () => {
    for (const t of [DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY]) {
      expect(t).toContain('{{student_name}}')
      expect(t).toContain('{{exchange_name}}')
    }
    for (const token of ['travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline']) {
      expect(DEFAULT_GOOD_NEWS_BODY).toContain(`{{${token}}}`)
    }
    // The old literal placeholders are gone for good.
    expect(DEFAULT_GOOD_NEWS_BODY).not.toContain('à compléter')
  })
})

describe('fillDetails', () => {
  it('needs both bounds before it renders a travel period', () => {
    const half = { ...DETAILS, travel_end: null }
    expect(fillDetails('{{travel_dates}}', half)).toBe('{{travel_dates}}')
  })

  it('treats whitespace as blank', () => {
    const blank = { ...DETAILS, participation_cost: '   ' }
    expect(fillDetails('{{participation_cost}}', blank)).toBe('{{participation_cost}}')
  })

  it('leaves every token alone when there is no details row at all', () => {
    expect(fillDetails(DEFAULT_GOOD_NEWS_BODY, null)).toBe(DEFAULT_GOOD_NEWS_BODY)
  })
})

describe('hasUnfilledPlaceholders', () => {
  it('catches an unsubstituted token', () => {
    expect(hasUnfilledPlaceholders('Coût : {{participation_cost}}')).toBe(true)
  })

  it('catches a placeholder the organizer typed by hand', () => {
    expect(hasUnfilledPlaceholders('Dates : [à compléter]')).toBe(true)
    expect(hasUnfilledPlaceholders('Prix : [à préciser]')).toBe(true)
    expect(hasUnfilledPlaceholders('Lien : [XXX]')).toBe(true)
  })

  it('catches an unresolved editor chip', () => {
    expect(hasUnfilledPlaceholders('Bonjour [[Prénom et nom de l’élève]]')).toBe(true)
  })

  it('passes a fully written body', () => {
    expect(hasUnfilledPlaceholders(
      'Dates : du 12 au 26 avril 2027\nCoût : 850 €\nRéponse avant le 15 janvier.',
    )).toBe(false)
  })

  it('does not trip on a lone bracket or an empty pair', () => {
    expect(hasUnfilledPlaceholders('Coût : 850 € [')).toBe(false)
    expect(hasUnfilledPlaceholders('Voir []')).toBe(false)
  })
})

describe('templateHasUnfilledPlaceholders', () => {
  it('blocks the shipped default when Réglages is empty', () => {
    expect(templateHasUnfilledPlaceholders({ subject: null, body: null, details: null })).toBe(true)
  })

  it('passes the shipped default once Réglages is filled', () => {
    expect(templateHasUnfilledPlaceholders({ subject: null, body: null, details: DETAILS })).toBe(false)
  })

  it('passes a custom body that hard-codes the values, even with Réglages empty', () => {
    expect(templateHasUnfilledPlaceholders({
      subject: 'Bonne nouvelle pour {{student_name}}',
      body: 'Départ le 12 avril, 850 € — réponse avant le 15 janvier.',
      details: null,
    })).toBe(false)
  })

  it('blocks a custom body carrying a hand-typed placeholder', () => {
    expect(templateHasUnfilledPlaceholders({
      subject: null,
      body: 'Le séjour coûte [montant à confirmer].',
      details: DETAILS,
    })).toBe(true)
  })

  it('scans the subject too', () => {
    expect(templateHasUnfilledPlaceholders({
      subject: 'Bonne nouvelle — [nom du séjour]',
      body: 'Tout est écrit ici.',
      details: DETAILS,
    })).toBe(true)
  })

  it('never lets a student or exchange name trigger the guard', () => {
    expect(templateHasUnfilledPlaceholders({
      subject: 'Bravo {{student_name}}',
      body: 'Bienvenue à {{exchange_name}} — tout est écrit ici.',
      details: DETAILS,
    })).toBe(false)
  })
})
