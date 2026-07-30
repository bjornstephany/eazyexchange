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
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1', status: 'approved' }),
}))

// Every column list handed to .select(), in call order.
let selectCalls: string[] = []

// The mock `from()` below does not distinguish `applications` from
// `exchanges` — it returns this same row for both selects — so
// `application_fields` doubles as the exchange's questionnaire column too.
// beforeEach resets it to null (never customized); individual tests
// override it to exercise the customized path.
const applicationRow: { application_fields: unknown } & Record<string, unknown> = {
  id: 'app-1', exchange_id: 'ex-1', school_id: 'school-1', status: 'submitted',
  email: 'stu@x.fr', data: { first_name: 'Léa' }, photo_path: null,
  invite_response: null, invite_response_note: null, review_note: null,
  application_fields: null,
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

beforeEach(() => {
  selectCalls = []
  applicationRow.application_fields = null
})

describe('getApplicationForReview', () => {
  it('never selects the private funnel tokens', async () => {
    await getApplicationForReview('app-1')
    // One select for the application row, one for the exchange's own
    // questionnaire (application_fields) — neither carries a funnel token.
    expect(selectCalls).toHaveLength(2)
    for (const cols of selectCalls) {
      expect(cols).not.toBe('*')
      expect(cols).not.toContain('resume_token')
      expect(cols).not.toContain('invite_token')
    }
  })

  it('selects every column the detail view consumes', async () => {
    await getApplicationForReview('app-1')
    const cols = selectCalls[0].split(',').map(c => c.trim())
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'exchange_id', 'school_id', 'status', 'email', 'data', 'photo_path',
      'invite_response', 'invite_response_note', 'review_note',
    ]))
  })

  // Pins the plumbing at actions/applications-review.ts:77. Without this, a
  // call site that reads the wrong column (or never adds applicationFields
  // to the return value at all) would still pass every other test here.
  it('returns null applicationFields for a never-customized exchange', async () => {
    const result = await getApplicationForReview('app-1')
    expect(result.applicationFields).toBeNull()
  })

  it("returns the exchange's own application_fields document when customized", async () => {
    const doc = {
      version: 1,
      sections: [{ id: 'student', fields: [{ id: 'c_1', type: 'text', label: 'Allergies' }] }],
    }
    applicationRow.application_fields = doc
    const result = await getApplicationForReview('app-1')
    expect(result.applicationFields).toEqual(doc)
  })
})
