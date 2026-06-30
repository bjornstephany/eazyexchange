'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { randomToken } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication } from '@/lib/application-form'
import { validateUploadFile } from '@/lib/uploads'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
  sendInvitationEmail, sendApplicationRejectionEmail,
} from '@/lib/email'
import { revalidatePath } from 'next/cache'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const PHOTO_BUCKET = 'application-photos'

function applicationsClosed(exchange: { application_open: boolean; application_deadline: string | null }): boolean {
  if (!exchange.application_open) return true
  if (exchange.application_deadline) {
    const today = new Date().toISOString().slice(0, 10)
    if (today > exchange.application_deadline) return true
  }
  return false
}

function tooLong(data: Record<string, string>): boolean {
  return Object.values(data).some(v => (v?.length ?? 0) > MAX_ANSWER_LENGTH)
}

export async function startApplication(
  slug: string,
  input: { email: string; first_name: string; last_name: string; language: 'en' | 'fr' },
): Promise<{ token: string }> {
  const email = normalizeEmail(input.email)
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address')

  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('id, name, school_a_id, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()
  if (!exchange) throw new Error('Application not found')
  if (applicationsClosed(exchange)) throw new Error('Applications are closed for this exchange')

  const token = randomToken()
  const { error } = await admin.from('applications').insert({
    exchange_id: exchange.id,
    school_id: exchange.school_a_id,
    email,
    resume_token: token,
    invite_token: null,
    status: 'draft',
    language: input.language,
    data: { first_name: input.first_name.trim(), last_name: input.last_name.trim(), email },
    photo_path: null,
    invite_response: null,
    invite_response_note: null,
    responded_at: null,
    enrolled_user_id: null,
    submitted_at: null,
    reviewed_at: null,
    reviewer_id: null,
    review_note: null,
  }).select('id').single()
  if (error) throw error

  await sendApplicationResumeEmail({
    to: email,
    exchangeName: exchange.name,
    resumeUrl: `${APP_URL}/apply/resume/${token}`,
  })
  return { token }
}

export async function getApplicationDraft(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('status, data, language, photo_path, exchange_id')
    .eq('resume_token', token)
    .maybeSingle()
  if (!app) return null
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  return {
    status: app.status, data: app.data ?? {}, language: app.language,
    photo_path: app.photo_path, exchangeName: exchange?.name ?? '',
  }
}

export async function saveApplicationDraft(token: string, data: Record<string, string>): Promise<void> {
  if (tooLong(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')
  const { error } = await admin
    .from('applications').update({ data }).eq('resume_token', token)
  if (error) throw error
}

export async function submitApplication(token: string, data: Record<string, string>): Promise<void> {
  if (tooLong(data)) throw new Error(`An answer exceeds the ${MAX_ANSWER_LENGTH}-character limit.`)
  const missing = missingRequiredApplication(data)
  if (missing.length > 0) throw new Error('Please complete all required fields before submitting.')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications')
    .select('id, status, email, exchange_id, school_id')
    .eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted')

  const { error } = await admin.from('applications').update({
    data, status: 'submitted', submitted_at: new Date().toISOString(),
  }).eq('resume_token', token)
  if (error) throw error

  // Emails: applicant confirmation + organizer alert. Fire-and-forget.
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
  void sendApplicationConfirmationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
  }).catch(() => {})
  const { data: organizers } = await admin
    .from('users').select('email').eq('school_id', app.school_id).eq('role', 'organizer')
  void Promise.all((organizers ?? []).map(org =>
    sendNewApplicationAlertEmail({
      to: org.email, applicantName, exchangeName: exchange?.name ?? '',
      reviewUrl: `${APP_URL}/exchanges/${app.exchange_id}/applications`,
    }).catch(() => {})
  ))
}

export async function uploadApplicationPhoto(token: string, formData: FormData): Promise<{ path: string }> {
  const file = formData.get('photo')
  if (!(file instanceof File)) throw new Error('No file provided')
  const err = validateUploadFile({ type: file.type, size: file.size })
  if (err) throw new Error(err)
  if (!file.type.startsWith('image/')) throw new Error('Please upload an image file')

  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('id, status').eq('resume_token', token).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.status !== 'draft') throw new Error('This application is already submitted and locked')

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${app.id}/photo.${ext}`
  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (upErr) throw upErr
  const { error } = await admin.from('applications').update({ photo_path: path }).eq('id', app.id)
  if (error) throw error
  return { path }
}

// ---- Organizer actions (authenticated, RLS-enforced) ----

async function assertOrganizerOwnsApplication(supabase: any, userId: string, applicationId: string) {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  const { data: app } = await supabase
    .from('applications').select('*').eq('id', applicationId).maybeSingle()
  if (!app) throw new Error('Application not found')
  if (app.school_id !== profile.school_id) throw new Error('Unauthorized')
  return app
}

export async function listApplications(exchangeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('exchange_id', exchangeId)
    .neq('status', 'draft')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getApplicationForReview(applicationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const application = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)

  let photoUrl: string | null = null
  if (application.photo_path) {
    // Organizer authorization already verified above; use admin to sign the URL
    // (the application-photos bucket has no per-user storage policy).
    const admin = createAdminClient()
    const { data } = await admin.storage.from(PHOTO_BUCKET)
      .createSignedUrl(application.photo_path, 3600)
    photoUrl = data?.signedUrl ?? null
  }
  return { application, photoUrl }
}

export async function acceptApplication(applicationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const app = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)
  if (app.status !== 'submitted' && app.status !== 'rejected') {
    throw new Error('Only a submitted application can be accepted')
  }
  const inviteToken = randomToken()
  const { error } = await supabase.from('applications').update({
    status: 'accepted', invite_token: inviteToken,
    reviewed_at: new Date().toISOString(), reviewer_id: user.id, review_note: null,
  }).eq('id', applicationId)
  if (error) throw error

  const { data: exchange } = await supabase
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  void sendInvitationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
    respondUrl: `${APP_URL}/invite/${inviteToken}`,
  }).catch(() => {})
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
}

export async function rejectApplication(applicationId: string, note: string, sendEmail: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const app = await assertOrganizerOwnsApplication(supabase, user.id, applicationId)
  const { error } = await supabase.from('applications').update({
    status: 'rejected', reviewed_at: new Date().toISOString(),
    reviewer_id: user.id, review_note: note || null,
  }).eq('id', applicationId)
  if (error) throw error

  if (sendEmail) {
    const { data: exchange } = await supabase
      .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
    const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
    void sendApplicationRejectionEmail({
      to: app.email, applicantName, exchangeName: exchange?.name ?? '', note,
    }).catch(() => {})
  }
  revalidatePath(`/exchanges/${app.exchange_id}/applications`)
}

// ---- Public invitation response (keyed by invite_token) ----

export async function getInvitation(token: string) {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('status, data, exchange_id').eq('invite_token', token).maybeSingle()
  if (!app) return null
  const { data: exchange } = await admin
    .from('exchanges').select('name').eq('id', app.exchange_id).maybeSingle()
  const applicantName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  return { exchangeName: exchange?.name ?? '', applicantName, status: app.status }
}

export async function respondToInvitation(
  token: string, response: 'yes' | 'no' | 'maybe', note: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('applications').select('*').eq('invite_token', token).maybeSingle()
  if (!app) throw new Error('Invitation not found')
  if (!['accepted', 'maybe'].includes(app.status)) {
    throw new Error('This invitation is no longer open')
  }
  const base = {
    invite_response: response, invite_response_note: note || null,
    responded_at: new Date().toISOString(),
  }

  if (response === 'no') {
    await admin.from('applications').update({ ...base, status: 'declined' }).eq('id', app.id)
    return
  }
  if (response === 'maybe') {
    await admin.from('applications').update({ ...base, status: 'maybe' }).eq('id', app.id)
    return
  }

  // Yes → create the auth account + profile + enrollment (reuses inviteStudent's
  // proven sequence). The trg_assign_on_enrollment_insert trigger fans out the
  // Phase 2 form assignments automatically.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(app.email, {
    redirectTo: `${APP_URL}/accept-invite`,
  })
  if (inviteError) {
    if ((inviteError as any).code === 'email_exists') throw new Error('An account already exists for this email')
    throw inviteError
  }
  const fullName = `${app.data?.first_name ?? ''} ${app.data?.last_name ?? ''}`.trim()
  const { error: profileError } = await admin.from('users').insert({
    id: invited.user.id, school_id: app.school_id, role: 'student' as const,
    email: app.email, full_name: fullName,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id).catch(() => {})
    if ((profileError as any).code === '23505') throw new Error('An account already exists for this email')
    throw profileError
  }
  const { error: enrollError } = await admin.from('exchange_enrollments').insert({
    exchange_id: app.exchange_id, user_id: invited.user.id,
  })
  if (enrollError && (enrollError as any).code !== '23505') throw enrollError

  await admin.from('applications').update({
    ...base, status: 'enrolled', enrolled_user_id: invited.user.id,
  }).eq('id', app.id)
}
