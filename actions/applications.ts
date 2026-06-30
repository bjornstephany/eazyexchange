'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomToken } from '@/lib/tokens'
import { normalizeEmail, isValidEmail, MAX_ANSWER_LENGTH } from '@/lib/validation'
import { missingRequiredApplication } from '@/lib/application-form'
import { validateUploadFile } from '@/lib/uploads'
import {
  sendApplicationResumeEmail, sendApplicationConfirmationEmail, sendNewApplicationAlertEmail,
} from '@/lib/email'

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
  await sendApplicationConfirmationEmail({
    to: app.email, applicantName, exchangeName: exchange?.name ?? '',
  })
  const { data: organizers } = await admin
    .from('users').select('email').eq('school_id', app.school_id).eq('role', 'organizer')
  for (const org of organizers ?? []) {
    await sendNewApplicationAlertEmail({
      to: org.email, applicantName, exchangeName: exchange?.name ?? '',
      reviewUrl: `${APP_URL}/exchanges/${app.exchange_id}/applications`,
    })
  }
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
