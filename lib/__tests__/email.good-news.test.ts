import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendGoodNewsEmail, sendStudentSetupEmail } from '@/lib/email'

describe('sendGoodNewsEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('sends to the parent array with rendered subject/body and three deep-linked buttons (fr)', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr', 'mom@x.fr'],
      studentName: 'Marie Dupont',
      exchangeName: 'France-Canada 2026',
      subject: 'Bravo {{student_name}}',
      body: 'Candidature de {{student_name}} pour {{exchange_name}} retenue.',
      respondUrl: 'https://app.test/invite/tok123',
      language: 'fr',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['dad@x.fr', 'mom@x.fr'])
    expect(call.subject).toBe('Bravo Marie Dupont')
    expect(call.html).toContain('Marie Dupont')
    expect(call.html).toContain('France-Canada 2026')
    // Three deep-linked buttons, GET links (no scripts in email).
    expect(call.html).toContain('https://app.test/invite/tok123?r=yes')
    expect(call.html).toContain('https://app.test/invite/tok123?r=no')
    expect(call.html).toContain('https://app.test/invite/tok123?r=maybe')
    // French button labels.
    expect(call.html).toContain('Oui, nous confirmons')
    expect(call.html).toContain('Oui, mais nous avons des questions')
  })

  it('renders an escaped personal note block when one is supplied', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
      personalNote: 'Une place s’est libérée <b>enfin</b>',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('Une place s’est libérée')
    expect(html).toContain('&lt;b&gt;enfin&lt;/b&gt;')
  })

  it('renders no note block when none is supplied', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).not.toContain('#EAF7F0')
  })

  it('escapes organizer body content', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: 'Danger <img src=x> {{student_name}}',
      respondUrl: 'https://app.test/invite/t', language: 'fr',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img src=x>')
  })

  it('uses English button labels when language is en', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'en',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('Yes, we confirm')
    expect(html).toContain('Yes, but we have questions')
  })
})

describe('sendStudentSetupEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })
  it('sends a French set-your-access email linking to the setup URL', async () => {
    await sendStudentSetupEmail({
      to: 'student@x.fr',
      exchangeName: 'France-Canada 2026',
      setupUrl: 'https://app.test/auth/confirm?token_hash=h&type=magiclink&next=%2Faccept-invite',
    })
    const { to, subject, html } = sendMock.mock.calls[0][0]
    expect(to).toBe('student@x.fr')
    expect(subject).toContain('France-Canada 2026')
    expect(html).toContain('https://app.test/auth/confirm?token_hash=h&type=magiclink&next=%2Faccept-invite')
    expect(html).toContain('Créer mon accès')
  })
})
