import { describe, it, expect, beforeEach, vi } from 'vitest'
import { activateTemplateRecord, type ActivatableTemplate } from '@/lib/forms/activate'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

let state: {
  details: Record<string, unknown> | null
  enrolled: string[]
  schoolStudents: string[]
}
const updated: Record<string, unknown>[] = []
const assignmentsInserted: unknown[] = []

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'exchange_program_details') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.details }) }) }) }
      }
      if (table === 'exchange_enrollments') {
        return { select: () => ({ eq: async () => ({ data: state.enrolled.map(user_id => ({ user_id })) }) }) }
      }
      if (table === 'users') {
        return { select: () => ({ in: (_c: string, ids: string[]) => ({ eq: () => ({ eq: async () => ({
          data: ids.filter(i => state.schoolStudents.includes(i)).map(id => ({ id })),
        }) }) }) }) }
      }
      if (table === 'form_templates') {
        return { update: (patch: Record<string, unknown>) => ({ eq: async () => { updated.push(patch); return { error: null } } }) }
      }
      if (table === 'assignments') {
        return { insert: async (rows: unknown) => { assignmentsInserted.push(rows); return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  } as never
}

const base: ActivatableTemplate = {
  id: 't-1', exchange_id: 'ex-1', school_id: 'sch-1', kind: 'doc', status: 'draft',
  audience: 'all', deadline: '2026-10-01', standard_key: null,
  template_file_path: null, form_fields: [],
}

beforeEach(() => {
  state = { details: fullDetails, enrolled: ['stu-1'], schoolStudents: ['stu-1'] }
  updated.length = 0
  assignmentsInserted.length = 0
})

describe('activateTemplateRecord', () => {
  it('is a no-op for an already active template', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, status: 'active' }))
      .resolves.toEqual({ ok: true })
    expect(updated).toHaveLength(0)
  })

  it('requires a deadline', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, deadline: null }))
      .resolves.toEqual({ ok: false, message: MSG_DEADLINE_REQUIRED })
  })

  it('requires a PDF for kind=pdf', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'pdf' }))
      .resolves.toEqual({ ok: false, message: MSG_PDF_REQUIRED })
  })

  it('requires at least one question for kind=online', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'online' }))
      .resolves.toEqual({ ok: false, message: MSG_QUESTIONS_REQUIRED })
  })

  it('activates an « all » doc without inserting assignments (the trigger does it)', async () => {
    await expect(activateTemplateRecord(fakeClient(), base)).resolves.toEqual({ ok: true })
    expect(updated).toEqual([{ status: 'active' }])
    expect(assignmentsInserted).toHaveLength(0)
  })

  it('requires a student selection for a conditional doc', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }))
      .resolves.toEqual({ ok: false, message: 'Choisissez au moins un élève concerné.' })
  })

  it('activates a conditional doc and inserts assignments for the chosen students', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }, ['stu-1']))
      .resolves.toEqual({ ok: true })
    expect(assignmentsInserted).toEqual([[{ template_id: 't-1', student_id: 'stu-1' }]])
  })

  it('rejects a student who is not enrolled in the exchange', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, audience: 'conditional' }, ['stu-1', 'ghost']))
      .resolves.toEqual({ ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' })
  })

  it('activates a fillable when program details are complete', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'decharge' }))
      .resolves.toEqual({ ok: true })
    expect(updated).toEqual([{ status: 'active' }])
  })

  it('blocks a fillable listing the missing details', async () => {
    state.details = { ...fullDetails, destination: null, chaperones: [] }
    const r = await activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'decharge' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('Destination')
      expect(r.message).toContain('Accompagnateurs')
    }
    expect(updated).toHaveLength(0)
  })

  it('blocks a fillable with an unknown standard_key', async () => {
    await expect(activateTemplateRecord(fakeClient(), { ...base, kind: 'fillable', standard_key: 'constructor' }))
      .resolves.toEqual({ ok: false, message: 'Modèle à signer inconnu.' })
  })
})
