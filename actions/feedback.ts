'use server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/request'
import { sendFeedbackNotificationEmail } from '@/lib/email'

type FeedbackResult = { ok: true } | { ok: false; error: string }

const GENERIC_ERROR = 'Une erreur est survenue. Veuillez réessayer.'

export async function submitFeedback(input: {
  type: string
  message: string
  pagePath?: string | null
}): Promise<FeedbackResult> {
  // Organizer-only surface. Gate in the action (not RLS), like other org actions.
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') {
    return { ok: false, error: GENERIC_ERROR }
  }

  const type = input.type
  if (type !== 'suggestion' && type !== 'bug') {
    return { ok: false, error: GENERIC_ERROR }
  }

  const message = (input.message ?? '').trim()
  if (message.length < 1 || message.length > 2000) {
    return { ok: false, error: 'Votre message doit faire entre 1 et 2000 caractères.' }
  }

  const pagePath = input.pagePath ? input.pagePath.slice(0, 300) : null

  const supabase = await createClient()
  const { error } = await supabase.from('feedback').insert({
    user_id: profile.id,
    school_id: profile.school_id,
    type,
    message,
    page_path: pagePath,
  })
  if (error) {
    // Expected DB failure (RLS/constraint/outage): return, never throw.
    return { ok: false, error: GENERIC_ERROR }
  }

  // Best-effort notification. The row is already saved and is the source of
  // truth — a Resend outage must not surface an error or lose the feedback.
  try {
    await sendFeedbackNotificationEmail({
      type,
      schoolName: profile.schools?.name ?? '',
      organizerName: profile.full_name ?? '',
      pagePath,
      message,
    })
  } catch {
    console.error('[feedback] notification email failed')
  }

  return { ok: true }
}
