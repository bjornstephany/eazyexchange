import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_GOOD_NEWS_SUBJECT, DEFAULT_GOOD_NEWS_BODY } from '@/lib/good-news-template'

let scenario: { exchange: Record<string, unknown> | null }

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'admin', email: 'a@b.c', full_name: 'A' },
  }),
}))

// getCommunicationSettings issues a single row read and none of the count
// queries getProgramInfo runs, so only the row branch needs a builder.
function table(data: unknown) {
  const b: any = {
    select: () => b, eq: () => b,
    maybeSingle: async () => ({ data }),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => table(scenario.exchange),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getCommunicationSettings } from '@/actions/settings'

beforeEach(() => {
  scenario = {
    exchange: {
      id: 'ex1', name: 'Programme Espagne', year: 2026, archived_at: null,
      school_a_id: 's1', school_b_id: 's2',
      reminders_enabled: null, reminder_cadence: null,
      good_news_subject: null, good_news_body: null,
    },
  }
})

describe('getCommunicationSettings', () => {
  it('returns the stored values', async () => {
    scenario.exchange = {
      ...scenario.exchange!,
      reminders_enabled: false, reminder_cadence: 'insistante',
      good_news_subject: 'Super nouvelle', good_news_body: 'Bonjour {{prenom}}',
    }
    const s = await getCommunicationSettings('ex1')
    expect(s).toEqual({
      exchangeName: 'Programme Espagne',
      remindersEnabled: false,
      reminderCadence: 'insistante',
      goodNewsSubject: 'Super nouvelle',
      goodNewsBody: 'Bonjour {{prenom}}',
    })
  })

  it('defaults reminders_enabled null to true', async () => {
    expect((await getCommunicationSettings('ex1')).remindersEnabled).toBe(true)
  })

  it('defaults reminder_cadence null to normale', async () => {
    expect((await getCommunicationSettings('ex1')).reminderCadence).toBe('normale')
  })

  it('falls back to the default good-news template when the columns are blank', async () => {
    scenario.exchange = { ...scenario.exchange!, good_news_subject: '   ', good_news_body: '  ' }
    const s = await getCommunicationSettings('ex1')
    expect(s.goodNewsSubject).toBe(DEFAULT_GOOD_NEWS_SUBJECT)
    expect(s.goodNewsBody).toBe(DEFAULT_GOOD_NEWS_BODY)
  })

  it('rejects an exchange outside the caller school', async () => {
    scenario.exchange = { ...scenario.exchange!, school_a_id: 's8', school_b_id: 's9' }
    await expect(getCommunicationSettings('ex1')).rejects.toThrow('Unauthorized')
  })

  it('rejects a missing exchange', async () => {
    scenario.exchange = null
    await expect(getCommunicationSettings('ex1')).rejects.toThrow('Unauthorized')
  })
})
