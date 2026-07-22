import { describe, it, expect } from 'vitest'
import {
  renderGoodNews,
  DEFAULT_GOOD_NEWS_SUBJECT,
  DEFAULT_GOOD_NEWS_BODY,
} from '@/lib/good-news-template'

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

  it('converts newlines to <br> in the body', () => {
    const { bodyHtml } = renderGoodNews({ subject: null, body: 'ligne 1\nligne 2', ...base })
    expect(bodyHtml).toBe('ligne 1<br>ligne 2')
  })

  it('falls back to defaults when subject/body are null', () => {
    const { subject, bodyHtml } = renderGoodNews({ subject: null, body: null, ...base })
    // Default subject/body carry placeholders that must be substituted, not shown raw.
    expect(subject).toContain('Marie Dupont')
    expect(subject).toContain('France-Canada 2026')
    expect(subject).not.toContain('{{')
    expect(bodyHtml).toContain('Marie Dupont')
    expect(bodyHtml).not.toContain('{{')
  })

  it('falls back to defaults when subject/body are empty/whitespace', () => {
    const { subject, bodyHtml } = renderGoodNews({ subject: '   ', body: '\n', ...base })
    expect(subject).not.toBe('   ')
    expect(subject).toContain('Marie Dupont')
    expect(bodyHtml).not.toBe('')
  })

  it('the exported defaults contain both placeholders', () => {
    for (const t of [DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY]) {
      expect(t).toContain('{{student_name}}')
      expect(t).toContain('{{exchange_name}}')
    }
  })
})
