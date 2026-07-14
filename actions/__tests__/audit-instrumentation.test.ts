import { describe, it, expect, vi, beforeEach } from 'vitest'

const logAudit = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendRejectionEmail: vi.fn(),
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// Table-aware minimal builder (same pattern as submissions.test.ts).
function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: () => builder,
        update: () => builder,
        maybeSingle: async () => {
          if (table === 'assignments') {
            return { data: { form_templates: { school_id: 'school-1', exchange_id: 'ex-1' } }, error: null }
          }
          if (table === 'exchanges') return { data: { archived_at: null, name: 'Échange' }, error: null }
          if (table === 'applications') {
            return {
              data: {
                id: 'app-1', school_id: 'school-1', exchange_id: 'ex-1',
                status: 'submitted', email: 'x@x.test', data: {},
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'submissions') return { data: { id: 'sub-1', status: 'submitted' }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}))
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}))

import { approveSubmission } from '../submissions'
import { rejectApplication } from '../applications-review'

describe('audit instrumentation', () => {
  beforeEach(() => logAudit.mockClear())

  it('approveSubmission writes a submission.approved entry', async () => {
    await approveSubmission('a-1')
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'submission.approved',
        actorUserId: 'org-1',
        actorSchoolId: 'school-1',
        targetType: 'submission',
        targetId: 'sub-1',
      }),
    )
  })

  it('rejectApplication writes an application.rejected entry (no note content)', async () => {
    await rejectApplication('app-1', 'note privée', false)
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'application.rejected',
        actorUserId: 'org-1',
        actorSchoolId: 'school-1',
        targetType: 'application',
        targetId: 'app-1',
      }),
    )
    // PII rule: the free-text note must never reach the audit row.
    expect(JSON.stringify(logAudit.mock.calls[0][0])).not.toContain('note privée')
  })
})
