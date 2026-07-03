import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendStudentReminderEmail } from '@/lib/email'

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
    expect(html).toContain('10 oct') // frShortDate rendering
    expect(html).not.toContain('<Yanis>')
  })
})
