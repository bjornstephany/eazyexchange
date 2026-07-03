import { describe, it, expect, vi, beforeEach } from 'vitest'

const reminderMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendTemplateReminderEmail: (...a: unknown[]) => reminderMock(...a),
  sendPhase2ChecklistEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ---- switchable state ----
let role = 'organizer'
let template: any
let assignments: any[] = []
let enrolledUsers: any[] = []
let exchange: any = { phase: 1, name: 'Espagne' }
const templateUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const assignmentInsert = vi.fn().mockResolvedValue({ error: null })
const assignmentUpdate = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
const templateDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

const from = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: (cols: string) => ({
        eq: () => ({
          single: async () => ({ data: { school_id: 'school-1', role } }),
        }),
        in: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: enrolledUsers }) }) }),
      }),
    }
  }
  if (table === 'form_templates') {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: template }), maybeSingle: async () => ({ data: template }) }) }),
      update: templateUpdate,
      delete: templateDelete,
    }
  }
  if (table === 'assignments') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: assignments }) }),
      insert: assignmentInsert,
      update: assignmentUpdate,
    }
  }
  if (table === 'exchanges') {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: exchange }), maybeSingle: async () => ({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }) }) }) }
  }
  if (table === 'exchange_enrollments') {
    return { select: () => ({ eq: () => Promise.resolve({ data: enrolledUsers.map(u => ({ user_id: u.id })) }) }) }
  }
  return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }) },
  }),
}))

import { activateTemplate, deleteTemplate, remindTemplate } from '@/actions/forms'

beforeEach(() => {
  vi.clearAllMocks()
  role = 'organizer'
  exchange = { phase: 1, name: 'Espagne' }
  enrolledUsers = []
  assignments = []
  template = {
    id: 'tpl-1', school_id: 'school-1', exchange_id: 'ex-1', name: 'Passeport',
    kind: 'doc', status: 'draft', audience: 'all', deadline: '2026-10-10',
    template_file_path: null, form_fields: [{ id: 'f1' }],
  }
})

describe('activateTemplate', () => {
  it('rejects a draft without deadline', async () => {
    template.deadline = null
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/échéance/i)
    expect(templateUpdate).not.toHaveBeenCalled()
  })
  it('rejects a pdf without file', async () => {
    template.kind = 'pdf'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/PDF/)
  })
  it('rejects an online form without questions', async () => {
    template.kind = 'online'
    template.form_fields = []
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/question/i)
  })
  it('rejects a conditional doc without chosen students', async () => {
    template.audience = 'conditional'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/élève/i)
  })
  it('activates an « all » doc and inserts no assignments itself (trigger does it)', async () => {
    await activateTemplate('tpl-1')
    expect(templateUpdate).toHaveBeenCalledWith({ status: 'active' })
    expect(assignmentInsert).not.toHaveBeenCalled()
  })
  it('activates a conditional doc inserting assignments for enrolled choices', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }, { id: 'stu-2', full_name: 'Hugo' }]
    await activateTemplate('tpl-1', ['stu-1'])
    expect(assignmentInsert).toHaveBeenCalledWith([{ template_id: 'tpl-1', student_id: 'stu-1' }])
  })
  it('rejects conditional choices that are not enrolled students', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }]
    await expect(activateTemplate('tpl-1', ['stu-1', 'ghost'])).rejects.toThrow()
  })
  it('non-organizer is rejected', async () => {
    role = 'student'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/Unauthorized/)
  })
})

describe('deleteTemplate', () => {
  it('refuses standard templates', async () => {
    template.standard_key = 'passeport'
    await expect(deleteTemplate('tpl-1')).rejects.toThrow(/standard/i)
    expect(templateDelete).not.toHaveBeenCalled()
  })
  it('deletes a custom template', async () => {
    template.standard_key = null
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
  })
})

describe('remindTemplate', () => {
  const HOURS = 3600 * 1000
  it('emails incomplete assignees, skips completed and recently-reminded', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: new Date(Date.now() - 2 * HOURS).toISOString(), submissions: { status: 'draft' }, users: { email: 'b@x.fr', full_name: 'B' } },
      { id: 'a3', student_id: 's3', last_reminded_at: new Date(Date.now() - 30 * HOURS).toISOString(), submissions: { status: 'rejected' }, users: { email: 'c@x.fr', full_name: 'C' } },
      { id: 'a4', student_id: 's4', last_reminded_at: null, submissions: { status: 'approved' }, users: { email: 'd@x.fr', full_name: 'D' } },
    ]
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 2, skipped: 1, failed: 0 })
    expect(reminderMock).toHaveBeenCalledTimes(2)
    expect(assignmentUpdate).toHaveBeenCalled()
  })
  it('counts failures without aborting the batch', async () => {
    template.status = 'active'
    assignments = [
      { id: 'a1', student_id: 's1', last_reminded_at: null, submissions: { status: null }, users: { email: 'a@x.fr', full_name: 'A' } },
      { id: 'a2', student_id: 's2', last_reminded_at: null, submissions: { status: null }, users: { email: 'b@x.fr', full_name: 'B' } },
    ]
    reminderMock.mockResolvedValueOnce(false)
    const res = await remindTemplate('tpl-1')
    expect(res).toEqual({ reminded: 1, skipped: 0, failed: 1 })
  })
})
