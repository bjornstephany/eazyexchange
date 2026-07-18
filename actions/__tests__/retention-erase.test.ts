import { describe, it, expect, vi, beforeEach } from 'vitest'

const eraseStudent = vi.fn(async () => ({ userId: 'stu-1', documentsDeleted: 2, photosDeleted: 1, applicationsDeleted: 1 }))
const eraseApplication = vi.fn(async () => ({ applicationId: 'app-1', photosDeleted: 0 }))
const logAudit = vi.fn(async () => {})
vi.mock('@/lib/retention/erase', () => ({ eraseStudent, eraseApplication }))
vi.mock('@/lib/audit', () => ({ logAudit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const requireOrganizer = vi.fn(async () => ({ user: { id: 'org-1' }, profile: { id: 'org-1', school_id: 'sch-1' } }))
vi.mock('@/lib/auth/require', () => ({ requireOrganizer }))

// createClient stub returning configurable maybeSingle data.
let found: any
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found }) }), maybeSingle: async () => ({ data: found }) }) }) }),
  }),
}))

beforeEach(() => { vi.clearAllMocks(); found = { id: 'ok' } })

describe('eraseSubject', () => {
  it('erases an in-school student and audits', async () => {
    const { eraseSubject } = await import('@/actions/retention')
    const res = await eraseSubject({ kind: 'student', id: 'stu-1' })
    expect(res).toEqual({ ok: true })
    expect(eraseStudent).toHaveBeenCalledWith('stu-1')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'subject.erased', targetType: 'user', targetId: 'stu-1' }))
  })

  it('refuses a subject not visible to the caller (RLS returns null)', async () => {
    found = null
    const { eraseSubject } = await import('@/actions/retention')
    const res = await eraseSubject({ kind: 'application', id: 'other-school-app' })
    expect(res).toEqual({ ok: false, error: 'not_found' })
    expect(eraseApplication).not.toHaveBeenCalled()
  })
})
