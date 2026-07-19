import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string; role: 'organizer' | 'student'; profileSchool: string
  template: { school_id: string; kind: string; standard_key: string | null; status: string; deadline: string | null; exchange_id: string; audience: string }
  details: Record<string, unknown> | null
  updated: boolean
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, in: () => builder,
        update: () => { scenario.updated = true; return { eq: async () => ({ error: null }) } },
        insert: async () => ({ error: null }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'form_templates') return { data: { id: 't-1', ...scenario.template, template_file_path: null, form_fields: [] }, error: null }
          if (table === 'exchange_program_details') return { data: scenario.details, error: null }
          if (table === 'exchanges') return { data: { id: scenario.template.exchange_id, archived_at: null }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

import { activateTemplate } from '../forms'

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('activateTemplate for fillable', () => {
  beforeEach(() => {
    scenario = {
      userId: 'org-1', role: 'organizer', profileSchool: 'school-1',
      template: { school_id: 'school-1', kind: 'fillable', standard_key: 'decharge', status: 'draft', deadline: '2026-10-01', exchange_id: 'ex-1', audience: 'all' },
      details: fullDetails, updated: false,
    }
  })

  it('activates when program details are complete', async () => {
    const r = await activateTemplate('t-1')
    expect(r).toEqual({ ok: true })
    expect(scenario.updated).toBe(true)
  })

  it('blocks with a message listing missing details', async () => {
    scenario.details = { ...fullDetails, destination: null, chaperones: [] }
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('Destination')
      expect(r.message).toContain('Accompagnateurs')
    }
    expect(scenario.updated).toBe(false)
  })

  it('blocks when no details row exists at all', async () => {
    scenario.details = null
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
    expect(scenario.updated).toBe(false)
  })

  it('still requires a deadline', async () => {
    scenario.template.deadline = null
    const r = await activateTemplate('t-1')
    expect(r.ok).toBe(false)
  })
})
