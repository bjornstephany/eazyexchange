import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendGoodNewsEmail, sendStudentSetupEmail } from '@/lib/email'

describe('sendGoodNewsEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('sends to the parent array with rendered subject/body and one response button (fr)', async () => {
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
    // One button to the response page, which presents the three choices itself.
    expect(call.html).toContain('href="https://app.test/invite/tok123"')
    expect(call.html).toContain('Répondre à l’invitation')
    expect(call.html).not.toContain('?r=')
    expect(call.html).not.toContain('Oui, nous confirmons')
  })

  it('paints the response button in the brand blue', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('background:#2456E6')
    expect(html).not.toContain('#1F7A57')
  })

  it('fills the template from the program details it is handed', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'fr',
      details: {
        travel_start: '2027-04-12', travel_end: '2027-04-26',
        participation_cost: '850 € par élève',
        payment_details: 'https://helloasso.example/adhesion',
        confirmation_deadline: '2027-01-15',
      },
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('850 € par élève')
    expect(html).toContain('du 12 avr. 2027 au 26 avr. 2027')
    expect(html).not.toContain('{{')
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

  it('uses the English button label when language is en', async () => {
    await sendGoodNewsEmail({
      to: ['dad@x.fr'], studentName: 'M', exchangeName: 'E',
      subject: null, body: null,
      respondUrl: 'https://app.test/invite/t', language: 'en',
    })
    const { html } = sendMock.mock.calls[0][0]
    expect(html).toContain('Respond to the invitation')
  })
})

describe('sendStudentSetupEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })
  it('sends a French set-your-account email linking to the setup URL', async () => {
    await sendStudentSetupEmail({
      to: 'student@x.fr',
      exchangeName: 'France-Canada 2026',
      setupUrl: 'https://app.test/auth/confirm?token_hash=h&type=magiclink&next=%2Faccept-invite',
    })
    const { to, subject, html } = sendMock.mock.calls[0][0]
    expect(to).toBe('student@x.fr')
    expect(subject).toContain('France-Canada 2026')
    expect(html).toContain('https://app.test/auth/confirm?token_hash=h&type=magiclink&next=%2Faccept-invite')
    expect(html).toContain('Créer mon compte')
  })
})
