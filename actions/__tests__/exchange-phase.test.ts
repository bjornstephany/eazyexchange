import { describe, it, expect, vi, beforeEach } from 'vitest'

const checklistMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendPhase2ChecklistEmail: (...a: unknown[]) => checklistMock(...a),
  sendTemplateReminderEmail: vi.fn().mockResolvedValue(true),
}))

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))

// Switchable role for testing
let role = 'organizer'

// Switchable state for the one-shot Phase-2 checklist send
let checklistSentAt: string | null = null
let activeTemplates: any[] = []
let assignmentRows: any[] = []
let enrolledUsers: any[] = []

// Chainable query stub: users profile lookup + exchanges scope/detail lookup +
// form_templates/assignments/exchange_enrollments/users list lookups + update
const from = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: (cols: string) => ({
        eq: () => ({ single: () => Promise.resolve({ data: { school_id: 'school-1', role } }) }),
        in: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: enrolledUsers }) }) }),
      }),
    }
  }
  if (table === 'form_templates') {
    return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: activeTemplates }) }) }) }) }
  }
  if (table === 'assignments') {
    return { select: () => ({ in: () => Promise.resolve({ data: assignmentRows }) }) }
  }
  if (table === 'exchange_enrollments') {
    return { select: () => ({ eq: () => Promise.resolve({ data: enrolledUsers.map(u => ({ user_id: u.id })) }) }) }
  }
  // exchanges
  return {
    select: (cols: string) => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }),
        single: () => Promise.resolve({ data: { name: 'Espagne', phase2_checklist_sent_at: checklistSentAt } }),
      }),
    }),
    update,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setExchangePhase } from '@/actions/exchanges'

describe('setExchangePhase', () => {
  beforeEach(() => {
    update.mockClear()
    updateEq.mockClear()
    checklistMock.mockClear()
    role = 'organizer'
    checklistSentAt = null
    activeTemplates = []
    assignmentRows = []
    enrolledUsers = []
  })

  it('updates the phase for an in-scope exchange', async () => {
    await setExchangePhase('ex-1', 2)
    expect(update).toHaveBeenCalledWith({ phase: 2 })
    expect(updateEq).toHaveBeenCalledWith('id', 'ex-1')
  })

  it('rejects an invalid phase value', async () => {
    // @ts-expect-error deliberately invalid
    await expect(setExchangePhase('ex-1', 3)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects when caller is a student (not organizer)', async () => {
    role = 'student'
    await expect(setExchangePhase('ex-1', 2)).rejects.toThrow(/Unauthorized/)
    expect(update).not.toHaveBeenCalled()
  })

  it('sends the checklist once when entering phase 2', async () => {
    checklistSentAt = null
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    enrolledUsers = [{ id: 's1', full_name: 'Léa', email: 'l@x.fr' }]
    assignmentRows = [{ id: 'a1', template_id: 't1', student_id: 's1', submissions: null }]
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).toHaveBeenCalledTimes(1)
    expect(checklistMock.mock.calls[0][0].items).toEqual([{ name: 'Passeport', deadline: '2026-10-10' }])
    // stamped afterwards
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ phase2_checklist_sent_at: expect.any(String) }))
  })

  it('does not re-send when already stamped', async () => {
    checklistSentAt = '2026-07-01T08:00:00Z'
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('skips students with nothing pending', async () => {
    checklistSentAt = null
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    enrolledUsers = [{ id: 's1', full_name: 'Léa', email: 'l@x.fr' }]
    assignmentRows = [{ id: 'a1', template_id: 't1', student_id: 's1', submissions: { status: 'approved' } }]
    await setExchangePhase('ex-1', 2)
    expect(checklistMock).not.toHaveBeenCalled()
  })
})
