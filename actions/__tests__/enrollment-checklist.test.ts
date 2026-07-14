import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const checklistMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendChecklistEmail: (...a: unknown[]) => checklistMock(...a),
}))

// ---- switchable state ----
let activeTemplates: any[] = []
let assignmentRows: any[] = []
const applicationUpdates: any[] = []

const CLAIMED = {
  id: 'app-1', email: 'lea@x.fr', school_id: 'school-1', exchange_id: 'ex-1',
  data: { first_name: 'Léa', last_name: 'Martin' },
}

// Chainable stub that terminates as single/maybeSingle and is also directly
// awaitable (the checklist helper awaits .select().eq().eq().eq() chains).
function chain(data: any) {
  const c: any = {
    eq: () => c, in: () => c, select: () => c,
    single: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: any) => resolve({ data, error: null }),
  }
  return c
}

const adminClient = {
  from: (table: string) => {
    if (table === 'applications') {
      return {
        // pre-check: not expired, points at ex-1
        select: () => chain({ id: 'app-1', invite_token_expires_at: null, exchange_id: 'ex-1' }),
        // claim (maybeSingle) + finalize (direct await) both land here
        update: (row: any) => { applicationUpdates.push(row); return chain(CLAIMED) },
      }
    }
    if (table === 'exchanges') {
      // archived_at → assertExchangeWritable; name → checklist helper
      return { select: (cols: string) => (cols === 'name' ? chain({ name: 'Espagne 2026' }) : chain({ archived_at: null })) }
    }
    if (table === 'form_templates') return { select: () => chain(activeTemplates) }
    if (table === 'assignments') return { select: () => chain(assignmentRows) }
    if (table === 'users') return { insert: () => Promise.resolve({ error: null }) }
    if (table === 'exchange_enrollments') return { insert: () => Promise.resolve({ error: null }) }
    return { select: () => chain(null) }
  },
  auth: { admin: {
    inviteUserByEmail: async () => ({ data: { user: { id: 'stu-1' } }, error: null }),
    deleteUser: async () => ({ error: null }),
  } },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))

import { respondToInvitation } from '@/actions/invitations'

describe('enrollment checklist email (respondToInvitation « yes »)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    checklistMock.mockClear()
    checklistMock.mockResolvedValue(true)
    applicationUpdates.length = 0
    activeTemplates = []
    assignmentRows = []
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { warnSpy.mockRestore() })

  it('sends one checklist listing only the pending items', async () => {
    activeTemplates = [
      { id: 't1', name: 'Passeport', deadline: '2026-10-10' },
      { id: 't2', name: 'Fiche santé', deadline: null },
    ]
    assignmentRows = [
      { template_id: 't1', submissions: null },                     // pending
      { template_id: 't2', submissions: { status: 'approved' } },   // done
    ]
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).toHaveBeenCalledTimes(1)
    const call = checklistMock.mock.calls[0][0]
    expect(call.to).toBe('lea@x.fr')
    expect(call.studentName).toBe('Léa Martin')
    expect(call.exchangeName).toBe('Espagne 2026')
    expect(call.items).toEqual([{ name: 'Passeport', deadline: '2026-10-10' }])
  })

  it('rejected and draft submissions still count as pending', async () => {
    activeTemplates = [
      { id: 't1', name: 'Passeport', deadline: '2026-10-10' },
      { id: 't2', name: 'Fiche santé', deadline: null },
    ]
    assignmentRows = [
      { template_id: 't1', submissions: { status: 'rejected' } },
      { template_id: 't2', submissions: { status: 'draft' } },
    ]
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).toHaveBeenCalledTimes(1)
    expect(checklistMock.mock.calls[0][0].items).toEqual([
      { name: 'Passeport', deadline: '2026-10-10' },
      { name: 'Fiche santé', deadline: null },
    ])
  })

  it('skips the email when nothing is pending', async () => {
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    assignmentRows = [{ template_id: 't1', submissions: { status: 'approved' } }]
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('skips the email when no template is active', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('an email failure never breaks the enrollment', async () => {
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    assignmentRows = [{ template_id: 't1', submissions: null }]
    checklistMock.mockRejectedValueOnce(new Error('smtp down'))
    await expect(respondToInvitation('inv-1', 'yes', '')).resolves.toBeUndefined()
    // enrollment was finalized despite the email failure
    expect(applicationUpdates.some(u => u.status === 'enrolled')).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    // never log the student email (PII)
    expect(String(warnSpy.mock.calls[0][0])).not.toContain('lea@x.fr')
  })
})
