'use server'
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendTemplateRequestEmail } from '@/lib/email'
import {
  templateRequestFileIssue, TEMPLATE_REQUEST_NOTE_MAX, type TemplateRequestIssue,
} from '@/lib/template-request'

// « Vous ne trouvez pas votre modèle ? » — the organizer uploads the application
// form they already use and we add it to the library by hand.
//
// The EMAIL IS THE DELIVERY. Nothing is stored: no bucket, no object, no path.
// So unlike submitFeedback — where the row is the source of truth and the mail
// is best-effort — the order is inverted here. Send first, and only claim
// success if it actually went out; the `feedback` row that follows is a trace
// of who asked for what, not the artifact.
export type TemplateRequestReason = TemplateRequestIssue | 'note_too_long' | 'rate_limited' | 'failed'
export type TemplateRequestResult = { ok: true } | { ok: false; reason: TemplateRequestReason }

// The organizer's filename becomes the attachment's filename. Strip anything
// path-like or non-printing and cap the length: it is displayed in a mail
// client and saved to a disk that is not ours.
function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (cleaned === '' ? 'modele' : cleaned).slice(0, 120)
}

export async function submitTemplateRequest(formData: FormData): Promise<TemplateRequestResult> {
  // Throws 'Unauthenticated' / 'Unauthorized' for a non-organizer, like every
  // other organizer action. Everything below is an expected outcome and returns.
  const { user, profile } = await requireOrganizer()

  // Fails CLOSED on a DB blip: this action sends mail from our domain with an
  // attachment, so losing the cap is worse than refusing a legitimate request
  // the organizer can retry (same posture as the other mail-sending caps).
  const rate = await checkRateLimit(`template-request:${user.id}`, 5, 3600)
  if (rate !== 'allowed') return { ok: false, reason: 'rate_limited' }

  const raw = formData.get('file')
  const file = raw instanceof File ? raw : null
  // The dialog checks the same two things for fast feedback; this is the check
  // that counts, because a FormData post is trivially forgeable.
  const issue = templateRequestFileIssue(file)
  if (issue || !file) return { ok: false, reason: issue ?? 'missing_file' }

  const note = (formData.get('note') as string | null)?.trim() ?? ''
  if (note.length > TEMPLATE_REQUEST_NOTE_MAX) return { ok: false, reason: 'note_too_long' }

  const filename = safeFilename(file.name)

  let sent = false
  try {
    const content = Buffer.from(await file.arrayBuffer()).toString('base64')
    sent = await sendTemplateRequestEmail({
      schoolName: profile.schools?.name ?? '',
      organizerName: profile.full_name ?? '',
      organizerEmail: user.email ?? '',
      note: note === '' ? null : note,
      filename,
      content,
    })
  } catch {
    // No detail: an attachment failure can echo the file's contents.
    console.error('[template-request] send threw')
    return { ok: false, reason: 'failed' }
  }
  if (!sent) return { ok: false, reason: 'failed' }

  // Best-effort trace, after the fact. The organizer has been served either
  // way — refusing here would ask them to send the file a second time for a
  // row only we read.
  const supabase = await createClient()
  const { error } = await supabase.from('feedback').insert({
    user_id: profile.id,
    school_id: profile.school_id,
    type: 'template_request',
    message: note === '' ? `Fichier : ${filename}` : `Fichier : ${filename}\n\n${note}`,
    page_path: '/applications',
  })
  if (error) console.error('[template-request] trace row failed')

  return { ok: true }
}
