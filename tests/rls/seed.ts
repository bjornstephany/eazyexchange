import type postgres from 'postgres'
import { randomUUID, randomBytes } from 'node:crypto'

export type Fixtures = {
  suffix: string
  schoolA: string; schoolB: string
  orgA: string; orgB: string; studentA: string; studentB: string
  exchangeA: string; applySlugA: string
  templateA: string; fieldA: string; fieldA2: string; slotA: string; slotA2: string
  assignmentA: string; submissionA: string; answerA: string
  applicationA: string; resumeTokenA: string; feedbackA: string
  docPathA: string; photoPathA: string; tplPathA: string
}

// Seed a complete "school A" world plus a second school B with an organizer and
// a student, committed as the postgres superuser (bypasses RLS; triggers still
// run). Matrix tests act as school-B personas against school-A rows.
export async function seedFixtures(sql: postgres.Sql): Promise<Fixtures> {
  const suffix = randomBytes(4).toString('hex')
  const id = () => randomUUID()
  const fx: Fixtures = {
    suffix,
    schoolA: id(), schoolB: id(),
    orgA: id(), orgB: id(), studentA: id(), studentB: id(),
    exchangeA: id(), applySlugA: `rls-matrix-${suffix}`,
    templateA: id(), fieldA: id(), fieldA2: id(), slotA: id(), slotA2: id(),
    assignmentA: '', submissionA: id(), answerA: id(),
    applicationA: id(), resumeTokenA: `rls-resume-${suffix}`, feedbackA: id(),
    docPathA: '', photoPathA: '', tplPathA: '',
  }

  await sql`insert into schools (id, name) values
    (${fx.schoolA}, ${'RLS École A ' + suffix}), (${fx.schoolB}, ${'RLS École B ' + suffix})`

  const authRows = [fx.orgA, fx.orgB, fx.studentA, fx.studentB].map((uid) => ({
    id: uid,
    instance_id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email: `${uid}@rls.test`,
  }))
  await sql`insert into auth.users ${sql(authRows)}`

  await sql`insert into users ${sql([
    { id: fx.orgA, school_id: fx.schoolA, role: 'organizer', org_role: 'owner', full_name: 'Org A', email: `${fx.orgA}@rls.test` },
    { id: fx.orgB, school_id: fx.schoolB, role: 'organizer', org_role: 'owner', full_name: 'Org B', email: `${fx.orgB}@rls.test` },
    { id: fx.studentA, school_id: fx.schoolA, role: 'student', org_role: 'admin', full_name: 'Étudiant A', email: `${fx.studentA}@rls.test` },
    { id: fx.studentB, school_id: fx.schoolB, role: 'student', org_role: 'admin', full_name: 'Étudiant B', email: `${fx.studentB}@rls.test` },
  ])}`

  await sql`insert into exchanges (id, name, year, school_a_id, school_b_id, apply_slug, application_open)
    values (${fx.exchangeA}, ${'RLS Échange A ' + suffix}, 2026, ${fx.schoolA}, null, ${fx.applySlugA}, true)`

  // Enrollment BEFORE the template: the active-template trigger then creates the assignment.
  await sql`insert into exchange_enrollments (exchange_id, user_id)
    values (${fx.exchangeA}, ${fx.studentA})`

  await sql`insert into form_templates
      (id, exchange_id, school_id, name, description, type, kind, status, audience, deadline, created_by)
    values (${fx.templateA}, ${fx.exchangeA}, ${fx.schoolA}, ${'Fiche RLS ' + suffix}, null,
      'data_entry', 'online', 'active', 'all', current_date + 30, ${fx.orgA})`

  await sql`insert into form_fields (id, template_id, label, field_type, required, "order") values
    (${fx.fieldA},  ${fx.templateA}, 'Réponse', 'text', true, 0),
    (${fx.fieldA2}, ${fx.templateA}, 'Réponse 2 (jamais répondue)', 'text', false, 1)`
  await sql`insert into document_slots (id, template_id, label, description, required, "order") values
    (${fx.slotA},  ${fx.templateA}, 'Passeport', null, true, 0),
    (${fx.slotA2}, ${fx.templateA}, 'Visa (jamais déposé)', null, false, 1)`

  const [assignment] = await sql`
    select id from assignments where template_id = ${fx.templateA} and student_id = ${fx.studentA}`
  if (!assignment) throw new Error('seed failed: auto-assign trigger did not create the assignment')
  fx.assignmentA = assignment.id as string

  // 'submitted' with null review fields — guard_submission_review rejects
  // seeding review outcomes as the postgres role (my_role() is null).
  await sql`insert into submissions (id, assignment_id, status, submitted_at)
    values (${fx.submissionA}, ${fx.assignmentA}, 'submitted', now())`
  await sql`insert into field_answers (id, submission_id, field_id, value)
    values (${fx.answerA}, ${fx.submissionA}, ${fx.fieldA}, 'quarante-deux')`

  fx.docPathA = `${fx.assignmentA}/${fx.slotA}/passeport.pdf`
  await sql`insert into document_uploads (submission_id, slot_id, storage_path, file_name)
    values (${fx.submissionA}, ${fx.slotA}, ${fx.docPathA}, 'passeport.pdf')`

  await sql`insert into applications (id, exchange_id, school_id, email, resume_token, status, data, submitted_at)
    values (${fx.applicationA}, ${fx.exchangeA}, ${fx.schoolA}, ${'applicant-' + suffix + '@rls.test'},
      ${fx.resumeTokenA}, 'submitted', ${sql.json({ first_name: 'Testine', last_name: 'Fixture' })}, now())`

  await sql`insert into feedback (id, user_id, school_id, type, message)
    values (${fx.feedbackA}, ${fx.orgA}, ${fx.schoolA}, 'suggestion', 'ligne de test RLS')`

  fx.photoPathA = `${fx.applicationA}/photo.jpg`
  fx.tplPathA = `${fx.schoolA}/${fx.templateA}.pdf`
  await sql`insert into storage.objects (bucket_id, name) values
    ('documents', ${fx.docPathA}),
    ('application-photos', ${fx.photoPathA}),
    ('form-templates', ${fx.tplPathA})`

  return fx
}

export async function cleanupFixtures(sql: postgres.Sql, fx: Fixtures): Promise<void> {
  // storage.objects has a local-stack safety trigger (protect_objects_delete)
  // that blocks direct DELETEs unless explicitly allowed for the statement.
  await sql.begin(async (tx) => {
    await tx`set local storage.allow_delete_query = 'true'`
    await tx`delete from storage.objects where name in (${fx.docPathA}, ${fx.photoPathA}, ${fx.tplPathA})`
  })
  // exchange delete cascades templates → fields/slots/assignments → submissions
  // → answers/uploads, plus applications and enrollments.
  await sql`delete from exchanges where id = ${fx.exchangeA}`
  // auth.users delete cascades the public.users profiles and feedback.
  await sql`delete from auth.users where id in (${fx.orgA}, ${fx.orgB}, ${fx.studentA}, ${fx.studentB})`
  await sql`delete from schools where id in (${fx.schoolA}, ${fx.schoolB})`
}
