import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendInvitationEmail } from '@/lib/email'
import { EXCHANGE_TERMS_EMAIL } from '@/lib/exchange-terms'

describe('sendInvitationEmail (French acceptance email + terms)', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('French copy, terms notice below the button, escaped user content', async () => {
    await sendInvitationEmail({
      to: 'x@y.fr', applicantName: '<Léa>', exchangeName: 'Espagne <2026>',
      respondUrl: 'https://app.test/invite/tok123',
    })
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Bonne nouvelle — ta candidature pour Espagne <2026> a été retenue !')
    expect(html).toContain('Bonjour &lt;Léa&gt;,')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).not.toContain('<Léa>')
    expect(html).toContain('Répondre à l’invitation')
    expect(html).toContain('https://app.test/invite/tok123')
    expect(html).toContain(EXCHANGE_TERMS_EMAIL)
    expect(html).toContain('Tu reçois cet e-mail car tu as candidaté')
  })
})
