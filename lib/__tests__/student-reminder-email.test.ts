import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendStudentReminderEmail, sendOrganizerInviteEmail } from '@/lib/email'

describe('sendStudentReminderEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('lists every outstanding item and escapes user content', async () => {
    const ok = await sendStudentReminderEmail({
      to: 'x@y.fr', studentName: '<Yanis>', exchangeName: 'Espagne <2026>',
      items: [
        { name: 'Passeport', deadline: '2026-10-10' },
        { name: 'AST <sortie>', deadline: null },
      ],
    })
    expect(ok).toBe(true)
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Rappel : ton dossier pour Espagne <2026>')
    expect(html).toContain('&lt;Yanis&gt;')
    expect(html).toContain('Espagne &lt;2026&gt;')
    expect(html).toContain('AST &lt;sortie&gt;')
    expect(html).toContain('Passeport')
    expect(html).toContain('10 oct') // shortDate(…, 'fr') rendering
    expect(html).not.toContain('<Yanis>')
  })
})

describe('sendOrganizerInviteEmail', () => {
  it('French vouvoiement, escaped names, join link', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    sendMock.mockClear()
    const ok = await sendOrganizerInviteEmail({
      to: 'c@lycee.fr', inviterName: 'Marie <B>', schoolName: 'Lycée <Mistral>',
      joinUrl: 'https://app.test/join/tok123',
    })
    expect(ok).toBe(true)
    const { subject, html } = sendMock.mock.calls[0][0]
    expect(subject).toBe('Marie <B> vous invite sur Eazyexchange')
    expect(html).toContain('Marie &lt;B&gt;')
    expect(html).toContain('Lycée &lt;Mistral&gt;')
    expect(html).toContain('https://app.test/join/tok123')
    expect(html).toContain('valable 14 jours')
  })
})
