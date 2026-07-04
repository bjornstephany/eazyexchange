import { describe, it, expect, vi, beforeEach } from 'vitest'

// Record every upsert call so we can assert the conflict target.
const upsertCalls: { table: string; rows: any; options: any }[] = []

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'student-1' } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        update: () => builder,
        // assignment ownership check + existing-submission lookup both resolve here
        maybeSingle: async () => {
          if (table === 'assignments') {
            return { data: { id: 'a1', form_templates: { exchange_id: 'ex1' } }, error: null }
          }
          if (table === 'submissions') return { data: { id: 's1' }, error: null }
          // exchange-guard's read: no archived_at means the exchange is live.
          if (table === 'exchanges') return { data: { archived_at: null }, error: null }
          return { data: null, error: null }
        },
        single: async () => ({ data: { id: 's1' }, error: null }),
        upsert: async (rows: any, options?: any) => {
          upsertCalls.push({ table, rows, options })
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeClient(),
}))
vi.mock('@/lib/email', () => ({ sendRejectionEmail: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveFormAnswers } from '../submissions'

describe('saveFormAnswers', () => {
  beforeEach(() => {
    upsertCalls.length = 0
  })

  it('upserts field answers on the (submission_id, field_id) conflict target', async () => {
    // Resubmitting after rejection re-sends answers for already-stored
    // (submission_id, field_id) pairs. Without an explicit onConflict target,
    // PostgREST defaults to the primary key and attempts a plain INSERT, which
    // violates unique(submission_id, field_id) -> error 23505.
    await saveFormAnswers('a1', { 'field-1': 'updated value' }, true)

    const call = upsertCalls.find(c => c.table === 'field_answers')
    expect(call).toBeDefined()
    expect(call!.options).toEqual({ onConflict: 'submission_id,field_id' })
  })
})
