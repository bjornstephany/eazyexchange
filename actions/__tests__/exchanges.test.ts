import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { role: string; school: string; exchangeSchools: [string, string]; archived: boolean; updated: any }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b,
        update: (row: any) => { scenario.updated = row; return { eq: async () => ({ error: null }) } },
        single: async () => table === 'users'
          ? { data: { school_id: scenario.school, role: scenario.role } }
          : { data: null },
        maybeSingle: async () => table === 'exchanges'
          ? { data: {
              school_a_id: scenario.exchangeSchools[0], school_b_id: scenario.exchangeSchools[1],
              archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null,
            } }
          : { data: null },
      }
      return b
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setApplicationOpen, updateReminderSettings } from '../exchanges'

beforeEach(() => { scenario = { role: 'organizer', school: 's-1', exchangeSchools: ['s-1', 's-2'], archived: false, updated: null } })

describe('setApplicationOpen', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(setApplicationOpen('ex-1', true, null)).rejects.toThrow('Unauthorized')
  })
  it('updates the flag for an in-scope organizer', async () => {
    await setApplicationOpen('ex-1', true, '2026-09-01')
    expect(scenario.updated).toEqual({ application_open: true, application_deadline: '2026-09-01' })
  })
})

describe('updateReminderSettings', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(updateReminderSettings('ex-1', true, 'normale')).rejects.toThrow('Unauthorized')
  })
  it('rejects an out-of-scope organizer', async () => {
    scenario.exchangeSchools = ['s-8', 's-9']
    await expect(updateReminderSettings('ex-1', true, 'normale')).rejects.toThrow('Unauthorized')
  })
  it('rejects a cadence outside the allow-list', async () => {
    await expect(updateReminderSettings('ex-1', true, 'daily' as any)).rejects.toThrow('Invalid cadence')
  })
  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(updateReminderSettings('ex-1', false, 'douce')).rejects.toThrow('archivé')
  })
  it('updates both columns for an in-scope organizer', async () => {
    await updateReminderSettings('ex-1', false, 'insistante')
    expect(scenario.updated).toEqual({ reminders_enabled: false, reminder_cadence: 'insistante' })
  })
})
