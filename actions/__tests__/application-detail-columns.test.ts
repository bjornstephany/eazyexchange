import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
  sendGoodNewsEmail: vi.fn(async () => true),
  sendApplicationRejectionEmail: vi.fn(),
  sendApplicationInviteEmail: vi.fn(),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// Every column list handed to .select(), in call order.
let selectCalls: string[] = []

const applicationRow = {
  id: 'app-1', exchange_id: 'ex-1', school_id: 'school-1', status: 'submitted',
  email: 'stu@x.fr', data: { first_name: 'Léa' }, photo_path: null,
  invite_response: null, invite_response_note: null, review_note: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const b: any = {
        select: (cols: string) => { selectCalls.push(cols); return b },
        eq: () => b,
        maybeSingle: async () => ({ data: applicationRow, error: null }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { getApplicationForReview } from '../applications-review'

beforeEach(() => { selectCalls = [] })

describe('getApplicationForReview', () => {
  it('never selects the private funnel tokens', async () => {
    await getApplicationForReview('app-1')
    expect(selectCalls).toHaveLength(1)
    const cols = selectCalls[0]
    expect(cols).not.toBe('*')
    expect(cols).not.toContain('resume_token')
    expect(cols).not.toContain('invite_token')
  })

  it('selects every column the detail view consumes', async () => {
    await getApplicationForReview('app-1')
    const cols = selectCalls[0].split(',').map(c => c.trim())
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'exchange_id', 'school_id', 'status', 'email', 'data', 'photo_path',
      'invite_response', 'invite_response_note', 'review_note',
    ]))
  })
})
