import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import {
  sendStudentReminderEmail,
  sendTemplateReminderEmail,
  sendChecklistEmail,
  sendInvitationEmail,
  sendOrganizerInviteEmail,
} from '@/lib/email'

// ASCII apostrophe between two letters = French typography regression (copy
// must use the typographic ’). Markup quotes and &#39;-escaped user input
// never sit between two letters, so they cannot false-positive.
const ASCII_APOSTROPHE = /\p{L}'\p{L}/u

// Fixtures are deliberately apostrophe-free: subjects interpolate names
// UNESCAPED, so an apostrophe-bearing fixture would trip the guard. Escaping
// behavior stays covered by lib/__tests__/student-reminder-email.test.ts.

function lastSend(): { subject: string; html: string } {
  expect(sendMock).toHaveBeenCalledTimes(1)
  return sendMock.mock.calls[0][0]
}

describe('French email copy uses typographic apostrophes only', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('sendStudentReminderEmail (manual « Relancer », per student)', async () => {
    await sendStudentReminderEmail({
      to: 'x@y.fr', studentName: 'Yanis', exchangeName: 'Espagne 2026',
      items: [
        { name: 'Passeport', deadline: '2026-10-10' },
        { name: 'Autorisation de sortie', deadline: null },
      ],
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    // STUDENT_FOOTER — positive pin proving the guard scans real ’ copy.
    expect(html).toContain('d’échange scolaire')
  })

  it('sendTemplateReminderEmail (manual « Relancer », per template)', async () => {
    await sendTemplateReminderEmail({
      to: 'x@y.fr', studentName: 'Yanis', templateName: 'Passeport',
      exchangeName: 'Espagne 2026', deadline: '2026-10-10',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('d’échange scolaire') // STUDENT_FOOTER
  })

  it('sendChecklistEmail', async () => {
    await sendChecklistEmail({
      to: 'x@y.fr', studentName: 'Yanis', exchangeName: 'Espagne 2026',
      items: [{ name: 'Passeport', deadline: '2026-10-10' }],
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(subject).toContain('c’est parti')
    expect(html).toContain('qu’il reste')
  })

  it('sendInvitationEmail (application accepted)', async () => {
    await sendInvitationEmail({
      to: 'x@y.fr', applicantName: 'Yanis', exchangeName: 'Espagne 2026',
      respondUrl: 'https://app.test/respond/tok123',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('l’invitation') // button label
  })

  it('sendOrganizerInviteEmail', async () => {
    await sendOrganizerInviteEmail({
      to: 'c@lycee.fr', inviterName: 'Marie Dupont', schoolName: 'Lycée Mistral',
      joinUrl: 'https://app.test/join/tok123',
    })
    const { subject, html } = lastSend()
    expect(subject).not.toMatch(ASCII_APOSTROPHE)
    expect(html).not.toMatch(ASCII_APOSTROPHE)
    expect(html).toContain('vous invite à rejoindre')
  })
})
