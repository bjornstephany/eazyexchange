import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => { delete process.env.RESEND_API_KEY })

import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail,
  sendNewApplicationAlertEmail, sendInvitationEmail, sendApplicationRejectionEmail,
  sendApplicationInviteEmail,
} from '../email'

describe('application emails (no API key → no-op, never throw)', () => {
  it('all resolve without a configured key', async () => {
    await expect(sendApplicationResumeEmail({ to: 'a@b.co', exchangeName: 'X', resumeUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendApplicationConfirmationEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X' })).resolves.toBeUndefined()
    await expect(sendNewApplicationAlertEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', reviewUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendInvitationEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', respondUrl: 'u' })).resolves.toBeUndefined()
    await expect(sendApplicationRejectionEmail({ to: 'a@b.co', applicantName: '<b>', exchangeName: 'X', note: 'n' })).resolves.toBeUndefined()
    await expect(sendApplicationInviteEmail({ to: 'a@b.co', exchangeName: 'X', applyUrl: 'u' })).resolves.toBeUndefined()
  })
})
