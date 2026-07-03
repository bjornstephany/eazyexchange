'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldType, FormType } from '@/types/db'

// Throw unless the caller is an organizer. Returns the organizer's school_id.
async function assertOrganizer(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return profile.school_id as string
}

// Throw unless the caller is an organizer for the school that owns the template.
async function assertOrganizerOwnsTemplate(
  supabase: SupabaseClient, userId: string, templateId: string,
): Promise<void> {
  const schoolId = await assertOrganizer(supabase, userId)
  const { data: tmpl } = await supabase
    .from('form_templates').select('school_id').eq('id', templateId).maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
}

export async function createTemplate(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase, user.id)

  const exchangeId = formData.get('exchange_id') as string
  const name = formData.get('name') as string
  const description = formData.get('description') as string | null
  const type = formData.get('type') as FormType
  const deadline = formData.get('deadline') as string

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: schoolId,
    name, description: description || null, type, deadline,
    created_by: user.id,
    // Matches the column defaults ('doc' / 'active' / 'all') — kept explicit
    // because the phase-3 Insert type no longer defaults these.
    kind: type === 'data_entry' ? 'online' : 'doc',
    status: 'active',
    audience: 'all',
  }).select('id').single()
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
  return data.id
}

export async function getTemplate(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, id)

  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_fields(*), document_slots(*)')
    .eq('id', id)
    .order('order', { referencedTable: 'form_fields', ascending: true })
    .order('order', { referencedTable: 'document_slots', ascending: true })
    .single() as any
  if (error) throw error
  return data as any
}

export async function addField(templateId: string, label: string, fieldType: FieldType, required: boolean, options?: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, templateId)

  const { data: existing } = await supabase
    .from('form_fields').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('form_fields').insert({
    template_id: templateId, label, field_type: fieldType,
    required, options: options ?? null, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeField(fieldId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: field } = await supabase
    .from('form_fields').select('template_id').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found')
  await assertOrganizerOwnsTemplate(supabase, user.id, field.template_id)

  const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function addSlot(templateId: string, label: string, description: string | null, required: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, templateId)

  const { data: existing } = await supabase
    .from('document_slots').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('document_slots').insert({
    template_id: templateId, label, description: description || null, required, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeSlot(slotId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: slot } = await supabase
    .from('document_slots').select('template_id').eq('id', slotId).maybeSingle()
  if (!slot) throw new Error('Slot not found')
  await assertOrganizerOwnsTemplate(supabase, user.id, slot.template_id)

  const { error } = await supabase.from('document_slots').delete().eq('id', slotId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}
