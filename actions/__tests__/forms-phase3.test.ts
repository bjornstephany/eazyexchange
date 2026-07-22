import { describe, it, expect, vi, beforeEach } from 'vitest'

const reminderMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendTemplateReminderEmail: (...a: unknown[]) => reminderMock(...a),
  sendChecklistEmail: vi.fn().mockResolvedValue(true),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ---- switchable state ----
let role = 'organizer'
let template: any
let assignments: any[] = []
let enrolledUsers: any[] = []
let exchange: any = { name: 'Espagne' }
// Recorded side effects createDraftTemplate / activateTemplateRecord produce,
// so new-activation tests can assert on them without a real DB.
let updates: Record<string, unknown>[] = []
let assignmentsInserted: unknown[] = []
// The row createDraftTemplate's own insert() just wrote — getOwnedTemplate's
// select().maybeSingle() must hand it back so activateTemplateRecord sees the
// real kind/audience/deadline of what was just created, not the fixture
// `template` (tpl-1) used by the other describe blocks in this file.
let insertedTemplate: Record<string, unknown> | null = null
const templateUpdate = vi.fn((patch: Record<string, unknown>) => ({
  // Mutate the row select()/maybeSingle() hand back, so a getOwnedTemplate()
  // re-fetch after this update (the updateTemplateMeta / replaceTemplateFile
  // re-activation rescue) sees the just-written columns, not stale fixture
  // data — mirrors the real DB round-trip.
  eq: async () => { updates.push(patch); Object.assign(insertedTemplate ?? template, patch); return { error: null } },
}))
const assignmentInsert = vi.fn((rows: unknown) => { assignmentsInserted.push(rows); return Promise.resolve({ error: null }) })
const assignmentUpdate = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) })
const templateDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const templateInsert = vi.fn((row: Record<string, unknown>) => {
  insertedTemplate = {
    id: 'tpl-new', exchange_id: row.exchange_id, school_id: row.school_id,
    name: row.name, kind: row.kind, status: 'draft', audience: row.audience,
    deadline: row.deadline, standard_key: null, condition_label: row.condition_label,
    template_file_path: null, form_fields: [],
  }
  return { select: () => ({ single: async () => ({ data: { id: 'tpl-new' }, error: null }) }) }
})

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
      select: () => ({ eq: () => ({
        single: async () => ({ data: insertedTemplate ?? template }),
        maybeSingle: async () => ({ data: insertedTemplate ?? template }),
      }) }),
      insert: templateInsert,
      update: templateUpdate,
      delete: templateDelete,
    }
  }
  if (table === 'document_slots') {
    return { insert: async () => ({ error: null }) }
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

import { deleteTemplate, remindTemplate, createDraftTemplate, updateTemplateMeta, replaceTemplateFile } from '@/actions/forms'
import { MSG_DEADLINE_REQUIRED } from '@/lib/forms/template-result'

beforeEach(() => {
  vi.clearAllMocks()
  role = 'organizer'
  exchange = { name: 'Espagne' }
  // 'stu-1' is the enrolled/valid student id the new createDraftTemplate
  // conditional-audience tests target; unused by every other describe below.
  enrolledUsers = [{ id: 'stu-1' }]
  assignments = []
  updates = []
  assignmentsInserted = []
  insertedTemplate = null
  template = {
    id: 'tpl-1', school_id: 'school-1', exchange_id: 'ex-1', name: 'Passeport',
    kind: 'doc', status: 'draft', audience: 'all', deadline: '2026-10-10',
    template_file_path: null, form_fields: [{ id: 'f1' }],
  }
})

describe('createDraftTemplate — structured results', () => {
  function fd(entries: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(entries)) f.set(k, v)
    return f
  }
  it('returns a structured error when the name is empty', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: '  ' }))
    expect(res).toEqual({ ok: false, message: 'Donnez un nom au modèle.' })
    expect(templateInsert).not.toHaveBeenCalled()
  })
  it('returns a structured error for a pdf kind without file', async () => {
    // Deadline required check now runs before the PDF-file check — supply one
    // so this still exercises the PDF validation, not the deadline gate.
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'pdf', name: 'Autorisation', deadline: '2026-09-30' }))
    expect(res).toEqual({ ok: false, message: 'Téléversez le PDF à faire signer.' })
  })
  it('returns the new id on success', async () => {
    // Deadline is now required and creation activates the template in-request.
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: 'Passeport', deadline: '2026-09-30' }))
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
  })

  it('refuses a missing deadline as a structured outcome', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Carte vitale')
    await expect(createDraftTemplate(fd)).resolves.toEqual({
      ok: false, message: MSG_DEADLINE_REQUIRED,
    })
  })

  it('a doc lands ACTIVE in one call', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Carte vitale')
    fd.set('deadline', '2026-09-30')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('a conditional doc activates with the chosen students', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Justificatif')
    fd.set('deadline', '2026-09-30'); fd.set('audience', 'conditional')
    fd.set('condition_label', 'si parents divorcés')
    fd.set('student_ids', JSON.stringify(['stu-1']))
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(assignmentsInserted).toEqual([[{ template_id: 'tpl-new', student_id: 'stu-1' }]])
  })

  it('a conditional doc with no selection stays draft with a structured message', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'doc'); fd.set('name', 'Justificatif')
    fd.set('deadline', '2026-09-30'); fd.set('audience', 'conditional')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: false, message: 'Choisissez au moins un élève concerné.' })
  })

  it('an online form stays DRAFT — its questions come next', async () => {
    const fd = new FormData()
    fd.set('exchange_id', 'ex-1'); fd.set('kind', 'online'); fd.set('name', 'Questionnaire')
    fd.set('deadline', '2026-09-30')
    const res = await createDraftTemplate(fd)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).not.toContainEqual({ status: 'active' })
  })
})

describe('updateTemplateMeta / replaceTemplateFile — structured results', () => {
  it('updateTemplateMeta returns a structured error when the name is empty', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: ' ', description: null, deadline: '2026-10-10', condition_label: null, external_url: null })
    expect(res).toEqual({ ok: false, message: 'Le nom ne peut pas être vide.' })
  })
  it('updateTemplateMeta refuses removing the deadline of an active template', async () => {
    template.status = 'active'
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: null, condition_label: null, external_url: null })
    expect(res).toEqual({ ok: false, message: 'Un modèle actif doit garder une date limite.' })
  })
  it('updateTemplateMeta returns ok on success', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: '2026-10-10', condition_label: null, external_url: null })
    expect(res).toEqual({ ok: true })
  })
  it('updateTemplateMeta rejects a non-https external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'http://esta.cbp.dhs.gov',
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta rejects an overlong external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'https://x.example/' + 'a'.repeat(500),
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta persists a valid external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: '  https://esta.cbp.dhs.gov  ',
    })
    expect(res).toEqual({ ok: true })
    expect(templateUpdate).toHaveBeenCalledWith(expect.objectContaining({ external_url: 'https://esta.cbp.dhs.gov' }))
  })
  it('replaceTemplateFile returns a structured error on a non-pdf template', async () => {
    const f = new FormData()
    f.set('template_id', 'tpl-1')
    f.set('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }))
    const res = await replaceTemplateFile(f)  // template.kind is 'doc' in beforeEach
    expect(res).toEqual({ ok: false, message: 'Ce modèle n’a pas de PDF.' })
  })

  // Re-activation rescue: an edit that supplies the exact field the gate was
  // waiting on must publish the draft, without ever failing the save itself.
  it('updateTemplateMeta activates an audience=all draft once the missing deadline is saved', async () => {
    template.deadline = null // the gate's only remaining objection
    const res = await updateTemplateMeta('tpl-1', {
      name: 'Passeport', description: null, deadline: '2026-11-01', condition_label: null, external_url: null,
    })
    expect(res).toEqual({ ok: true })
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('updateTemplateMeta never auto-activates a conditional draft (no student picker on this path)', async () => {
    template.audience = 'conditional'
    template.deadline = null
    const res = await updateTemplateMeta('tpl-1', {
      name: 'Justificatif', description: null, deadline: '2026-11-01', condition_label: 'si parents divorcés', external_url: null,
    })
    expect(res).toEqual({ ok: true })
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('updateTemplateMeta does not re-activate an already-active template', async () => {
    template.status = 'active'
    const res = await updateTemplateMeta('tpl-1', {
      name: 'Passeport', description: null, deadline: '2026-10-10', condition_label: null, external_url: null,
    })
    expect(res).toEqual({ ok: true })
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('replaceTemplateFile activates a pdf/audience=all draft once the file is uploaded', async () => {
    template.kind = 'pdf'
    template.template_file_path = null // the gate's only remaining objection
    const f = new FormData()
    f.set('template_id', 'tpl-1')
    f.set('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }))
    const res = await replaceTemplateFile(f)
    expect(res).toEqual({ ok: true })
    expect(updates).toContainEqual({ status: 'active' })
  })
})

describe('deleteTemplate', () => {
  it('deletes standard templates too (guard removed)', async () => {
    template.standard_key = 'passeport'
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
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
