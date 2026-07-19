import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  assignmentFound: boolean
  templateKind: string
  standardKey: string | null
  submissionStatus: string | null
  uploadError: { message: string } | null
  pdfFails: boolean
}

const updates: Record<string, unknown>[] = []

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'sub-1' }, error: null }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push({ table, ...payload })
          return { eq: async () => ({ error: null }) }
        },
        single: async () => {
          if (table === 'users') return { data: { role: 'student', school_id: 's-1' }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'assignments') {
            if (!scenario.assignmentFound) return { data: null, error: null }
            return { data: { id: 'a-1', form_templates: {
              id: 't-1', kind: scenario.templateKind, standard_key: scenario.standardKey,
              exchange_id: 'ex-1', name: 'Décharge',
            } }, error: null }
          }
          if (table === 'submissions') {
            if (!scenario.submissionStatus) return { data: null, error: null }
            return { data: { id: 'sub-1', status: scenario.submissionStatus }, error: null }
          }
          if (table === 'exchanges') return { data: { name: 'France-Minnesota 2026', archived_at: null }, error: null }
          if (table === 'exchange_program_details') return { data: null, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: scenario.uploadError }),
      }),
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
vi.mock('@/lib/pdf/fillable-pdf', () => ({
  renderFillablePdf: vi.fn(async () => {
    if (scenario.pdfFails) throw new Error('render boom')
    return Buffer.from('%PDF-fake')
  }),
}))

import { saveFillable } from '../fillable'

// Décharge requires: parent1_name, parent2_name, student_name,
// conduct_student_name, parents_place + sig_parent1 + sig_parent2 + sig_student
// (every signature block the paper form shows is required).
const completeInput = {
  answers: {
    parent1_name: 'Jean Dupont', parent2_name: 'Marie Dupont', student_name: 'Zoé Dupont',
    conduct_student_name: 'Zoé Dupont', parents_place: 'Luynes',
  },
  signatures: [
    { key: 'sig_parent1', full_name: 'Jean Dupont', approved: true },
    { key: 'sig_parent2', full_name: 'Marie Dupont', approved: true },
    { key: 'sig_student', full_name: 'Zoé Dupont', approved: true },
  ],
}

describe('saveFillable', () => {
  beforeEach(() => {
    updates.length = 0
    scenario = {
      userId: 'stu-1', assignmentFound: true, templateKind: 'fillable',
      standardKey: 'decharge', submissionStatus: null, uploadError: null, pdfFails: false,
    }
  })

  it('throws for an assignment the student does not own', async () => {
    scenario.assignmentFound = false
    await expect(saveFillable('a-1', completeInput, false)).rejects.toThrow('Assignment not found')
  })

  it('throws for a non-fillable template', async () => {
    scenario.templateKind = 'online'
    await expect(saveFillable('a-1', completeInput, false)).rejects.toThrow()
  })

  it('locks an approved submission (structured)', async () => {
    scenario.submissionStatus = 'approved'
    const r = await saveFillable('a-1', completeInput, false)
    expect(r.ok).toBe(false)
  })

  it('returns validation failure on submit with missing signature', async () => {
    const r = await saveFillable('a-1', { ...completeInput, signatures: [] }, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })

  it('saves a draft without stamping signed_at', async () => {
    const r = await saveFillable('a-1', completeInput, false)
    expect(r).toEqual({ ok: true })
    const draft = updates.find(u => u.table === 'submissions') as { fillable_data: { signatures: { signed_at: string | null }[] } } | undefined
    // No prior submission → the row was inserted then updated with data only.
    if (draft) expect(draft.fillable_data.signatures.every(s => s.signed_at === null)).toBe(true)
  })

  it('submits: stamps signatures, uploads PDF, sets submitted', async () => {
    const r = await saveFillable('a-1', completeInput, true)
    expect(r).toEqual({ ok: true })
    const final = updates.find(u => u.table === 'submissions' && u.status === 'submitted') as any
    expect(final).toBeDefined()
    expect(final.generated_pdf_path).toBe('a-1/fillable/sub-1.pdf')
    expect(final.fillable_data.signatures.every((s: any) => typeof s.signed_at === 'string')).toBe(true)
  })

  it('PDF failure → structured error, stays draft', async () => {
    scenario.pdfFails = true
    const r = await saveFillable('a-1', completeInput, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })

  it('storage failure → structured error, stays draft', async () => {
    scenario.uploadError = { message: 'boom' }
    const r = await saveFillable('a-1', completeInput, true)
    expect(r.ok).toBe(false)
    expect(updates.filter(u => u.table === 'submissions' && u.status === 'submitted')).toHaveLength(0)
  })
})
