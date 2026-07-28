// How a cast entry's `shape` becomes database rows. Extracted from
// seed-demo.mjs so the smoke suite's per-spec reset of the reserved students
// (scripts/seed-cast.mjs SMOKE_STUDENTS) cannot drift from the seed: there is
// no second understanding of the schema, only this one, called twice.
//
// The split between `submissions` and `reviews` is load-bearing.
// trg_guard_submission_review rejects review columns from any caller that is
// not an organizer of the school — the service role included, since auth.uid()
// is null for it. So every submission is written in the state a student could
// have produced, and the reviewed ones are then moved by a real organizer
// session.

const DAY = 86_400_000

/** ISO-timestamp helper: `day(-6)` is six days ago. Injectable clock for tests. */
export function dayFactory(now = new Date()) {
  const base = now.getTime()
  return (offset) => new Date(base + offset * DAY).toISOString()
}

/**
 * Pure. `shape` is the positional status array from SHAPES; `templateIds` are
 * the form_templates ids in TEMPLATES order.
 */
export function shapeSubmissions(shape, templateIds, day) {
  const submissions = []
  const reviews = []
  shape.forEach((status, i) => {
    if (!status) return
    const templateId = templateIds[i]
    const reviewed = status === 'approved' || status === 'rejected'
    submissions.push({
      template_id: templateId,
      status: reviewed ? 'submitted' : status,
      submitted_at: status === 'draft' ? null : day(-6 + i),
    })
    if (reviewed) reviews.push({ template_id: templateId, status, at: day(-2 + i) })
  })
  return { submissions, reviews }
}

/** The student's assignment ids, keyed by template id. */
async function assignmentsFor(db, studentId) {
  const { data, error } = await db
    .from('assignments')
    .select('id, template_id')
    .eq('student_id', studentId)
  if (error) throw new Error(`assignments ${studentId}: ${error.message}`)
  return data
}

/**
 * Back to a clean slate: every submission on this student's assignments is
 * deleted and the reminder clock is cleared. Safe to run on an already-clean
 * student — it is a no-op.
 */
export async function clearStudentShape({ db, studentId }) {
  const assignments = await assignmentsFor(db, studentId)
  const ids = assignments.map((a) => a.id)
  if (ids.length === 0) return
  const { error } = await db.from('submissions').delete().in('assignment_id', ids)
  if (error) throw new Error(`clear submissions ${studentId}: ${error.message}`)
  const { error: err } = await db
    .from('assignments')
    .update({ last_reminded_at: null })
    .in('id', ids)
  if (err) throw new Error(`clear last_reminded_at ${studentId}: ${err.message}`)
}

/**
 * Write the shape. `asOrganizer` is an authenticated organizer client and is
 * only required when the shape contains an approved/rejected form; passing null
 * for a shape that needs one is a programming error, not a silent skip.
 */
export async function applyStudentShape({
  db,
  asOrganizer = null,
  organizerId = null,
  studentId,
  shape,
  templateIds,
  day = dayFactory(),
}) {
  const assignments = await assignmentsFor(db, studentId)
  const byTemplate = new Map(assignments.map((a) => [a.template_id, a.id]))
  const { submissions, reviews } = shapeSubmissions(shape, templateIds, day)

  if (reviews.length > 0 && (!asOrganizer || !organizerId)) {
    throw new Error(
      'applyStudentShape: this shape has reviewed forms and needs an organizer client',
    )
  }

  if (submissions.length > 0) {
    const rows = submissions.map((s) => ({
      assignment_id: byTemplate.get(s.template_id),
      status: s.status,
      submitted_at: s.submitted_at,
    }))
    const { error } = await db.from('submissions').insert(rows)
    if (error) throw new Error(`submissions ${studentId}: ${error.message}`)
  }

  for (const r of reviews) {
    const { error } = await asOrganizer
      .from('submissions')
      .update({
        status: r.status,
        reviewer_id: organizerId,
        reviewed_at: r.at,
        review_note: r.status === 'rejected' ? 'Document illisible, merci de le renvoyer.' : null,
      })
      .eq('assignment_id', byTemplate.get(r.template_id))
    if (error) throw new Error(`review ${studentId}/${r.template_id}: ${error.message}`)
  }

  // Back-date the reminder clock on the untouched forms so send-reminders'
  // pacing logic has something to act on rather than starting from zero.
  const written = new Set(submissions.map((s) => byTemplate.get(s.template_id)))
  const idle = assignments.filter((a) => !written.has(a.id)).map((a) => a.id)
  if (idle.length > 0) {
    const { error } = await db
      .from('assignments')
      .update({ last_reminded_at: day(-8) })
      .in('id', idle)
    if (error) throw new Error(`last_reminded_at ${studentId}: ${error.message}`)
  }
}

/** Idempotent: clear, then re-apply. Running it twice leaves the same rows. */
export async function resetStudentShape(args) {
  await clearStudentShape(args)
  await applyStudentShape(args)
}
