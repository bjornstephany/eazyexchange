'use server'
// Fillable, signable standard forms — two trust models in one feature file:
// organizer program-details management (this half) and the student fill/sign
// action (saveFillable below, Task 7). Spec:
// docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer, requireUser } from '@/lib/auth/require'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExchangeProgramDetails, FillableData, FillableSignature } from '@/types/db'
import { assertExchangeWritable } from '@/lib/exchange-guard'
import { travelOrderProblem } from '@/lib/exchange/travel-dates'
import { hasOverlongAnswer, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { validateFillable, signatureBlocks, resolveVariables } from '@/lib/forms/fillable/render'
import type { FillableInput } from '@/lib/forms/fillable/types'
import { renderFillablePdf } from '@/lib/pdf/fillable-pdf'

// Throw unless the caller is an organizer of a school participating in the
// exchange (either side — the details describe the shared trip).
async function assertOrganizerOnExchange(
  supabase: SupabaseClient, exchangeId: string,
): Promise<void> {
  const { profile } = await requireOrganizer()
  const { data: exchange } = await supabase
    .from('exchanges').select('id, school_a_id, school_b_id')
    .eq('id', exchangeId).maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }
}

export async function getProgramDetails(exchangeId: string): Promise<ExchangeProgramDetails | null> {
  const supabase = await createClient()
  await assertOrganizerOnExchange(supabase, exchangeId)
  const { data } = await supabase
    .from('exchange_program_details').select('*')
    .eq('exchange_id', exchangeId).maybeSingle()
  return data ?? null
}

export type ProgramDetailsInput = {
  destination: string | null
  travel_start: string | null
  travel_end: string | null
  chaperones: string[]
  association_name: string | null
  sending_school_name: string | null
  receiving_school_name: string | null
  proviseur_name: string | null
  sending_city: string | null
  absence_dates: string[]
  // The « Bonne nouvelle » acceptance email's three non-date values. Free text,
  // not numeric — see lib/exchange/good-news-fields.ts.
  participation_cost: string | null
  payment_details: string | null
  confirmation_deadline: string | null
}

const MAX_FIELD = 200
const MAX_LIST = 12
const MAX_LIST_ITEM = 160

function cleanText(v: string | null): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
function cleanList(v: string[]): string[] {
  return v.map(x => x.trim()).filter(Boolean)
}

export async function saveProgramDetails(
  exchangeId: string, input: ProgramDetailsInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient()
  await assertOrganizerOnExchange(supabase, exchangeId)

  const texts = [input.destination, input.association_name, input.sending_school_name,
    input.receiving_school_name, input.proviseur_name, input.sending_city,
    input.participation_cost, input.payment_details]
  if (texts.some(t => (t ?? '').length > MAX_FIELD)) {
    return { ok: false, message: `Un champ dépasse ${MAX_FIELD} caractères.` }
  }
  const chaperones = cleanList(input.chaperones)
  const absenceDates = cleanList(input.absence_dates)
  if (chaperones.length > MAX_LIST || absenceDates.length > MAX_LIST) {
    return { ok: false, message: `${MAX_LIST} entrées maximum par liste.` }
  }
  if ([...chaperones, ...absenceDates].some(x => x.length > MAX_LIST_ITEM)) {
    return { ok: false, message: `Une entrée de liste dépasse ${MAX_LIST_ITEM} caractères.` }
  }
  const start = cleanText(input.travel_start)
  const end = cleanText(input.travel_end)
  if ((start && !end) || (!start && end)) {
    return { ok: false, message: 'Renseignez les deux dates du voyage (départ et retour).' }
  }
  const orderProblem = travelOrderProblem(start, end)
  if (orderProblem) return { ok: false, message: orderProblem }

  const { error } = await supabase.from('exchange_program_details').upsert({
    exchange_id: exchangeId,
    destination: cleanText(input.destination),
    travel_start: start,
    travel_end: end,
    chaperones,
    association_name: cleanText(input.association_name),
    sending_school_name: cleanText(input.sending_school_name),
    receiving_school_name: cleanText(input.receiving_school_name),
    proviseur_name: cleanText(input.proviseur_name),
    sending_city: cleanText(input.sending_city),
    absence_dates: absenceDates,
    participation_cost: cleanText(input.participation_cost),
    payment_details: cleanText(input.payment_details),
    // A `date` column: '' from an unset <input type="date"> must land as null.
    confirmation_deadline: cleanText(input.confirmation_deadline),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'exchange_id' })
  if (error) return { ok: false, message: 'L’enregistrement a échoué. Réessayez.' }

  revalidatePath('/settings')
  // Fillable templates render these values on /forms drawers and the student
  // pages; organizer surfaces refresh here, student pages re-render on load
  // (server components, no cache) — same cross-actor stance as submissions.
  revalidatePath('/forms', 'layout')
  return { ok: true }
}

const MSG_LOCKED = 'Ce formulaire a déjà été validé et ne peut plus être modifié.'
const MSG_PDF_FAILED = 'La génération du PDF a échoué. Réessaie dans un instant.'
const MSG_UPLOAD_FAILED = 'L’enregistrement du PDF a échoué. Réessaie dans un instant.'

// Student fill & e-sign. Draft saves persist answers + signature names without
// timestamps; submit validates everything, stamps signed_at SERVER-side,
// renders the PDF, uploads it, then flips the submission to submitted. The
// submission row is only marked submitted after a successful upload — a PDF
// or storage failure leaves it in draft (structured error, nothing thrown).
export async function saveFillable(
  assignmentId: string,
  input: FillableInput,
  submit: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, form_templates!inner(id, kind, standard_key, exchange_id, name)')
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle<{ id: string; form_templates: {
      id: string; kind: string; standard_key: string | null; exchange_id: string; name: string
    } }>()
  if (!assignment) throw new Error('Assignment not found')
  const tmpl = assignment.form_templates
  const def = tmpl.kind === 'fillable' && tmpl.standard_key
    ? FILLABLE_DEFINITIONS[tmpl.standard_key]
    : undefined
  if (!def) throw new Error('Not a fillable template')
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  if (hasOverlongAnswer(input.answers)) {
    return { ok: false, message: `Une réponse dépasse la limite de ${MAX_ANSWER_LENGTH} caractères.` }
  }
  if (submit) {
    const valid = validateFillable(def, input)
    if (!valid.ok) return valid
  }

  const { data: existing } = await supabase
    .from('submissions').select('id, status')
    .eq('assignment_id', assignmentId).maybeSingle()
  if (existing?.status === 'approved') return { ok: false, message: MSG_LOCKED }

  let submissionId: string
  if (existing) {
    submissionId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('submissions')
      .insert({
        assignment_id: assignmentId, status: 'draft', submitted_at: null,
        reviewed_at: null, reviewer_id: null, review_note: null,
      })
      .select('id').single()
    if (error) throw error
    submissionId = created.id
  }

  const roleByKey = new Map(signatureBlocks(def).map(s => [s.key, s.roleLabel]))
  const signedAt = new Date().toISOString()
  const signatures: FillableSignature[] = input.signatures
    .filter(s => s.full_name.trim() !== '' || s.approved === true)
    .map(s => ({
      key: s.key,
      role_label: roleByKey.get(s.key) ?? s.key,
      full_name: s.full_name.trim(),
      signed_at: submit && s.approved === true ? signedAt : null,
    }))
  const fillableData: FillableData = { answers: input.answers, signatures }

  if (!submit) {
    // Draft: data only — a rejected submission stays rejected until resubmit.
    const { error } = await supabase
      .from('submissions').update({ fillable_data: fillableData }).eq('id', submissionId)
    if (error) throw error
  } else {
    const [{ data: exchange }, { data: details }] = await Promise.all([
      supabase.from('exchanges').select('name').eq('id', tmpl.exchange_id).maybeSingle(),
      supabase.from('exchange_program_details').select('*').eq('exchange_id', tmpl.exchange_id).maybeSingle(),
    ])
    const values = resolveVariables({ exchangeName: exchange?.name ?? '', details })

    let pdf: Buffer
    try {
      pdf = await renderFillablePdf({
        def, values, data: fillableData,
        meta: {
          exchangeName: exchange?.name ?? '',
          associationName: details?.association_name ?? null,
          submissionId,
        },
      })
    } catch {
      // Expected-enough failure mode; no PII in any log (ids only via the
      // structured return). Do not rethrow — the student can retry.
      return { ok: false, message: MSG_PDF_FAILED }
    }

    const path = `${assignmentId}/fillable/${submissionId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(path, pdf, { upsert: true, contentType: 'application/pdf' })
    if (uploadError) return { ok: false, message: MSG_UPLOAD_FAILED }

    const { error } = await supabase
      .from('submissions')
      .update({
        fillable_data: fillableData,
        generated_pdf_path: path,
        status: 'submitted',
        submitted_at: signedAt,
      })
      .eq('id', submissionId)
    if (error) throw error
  }

  revalidatePath(`/my-forms/${assignmentId}`)
  revalidatePath('/my-forms')
  return { ok: true }
}
