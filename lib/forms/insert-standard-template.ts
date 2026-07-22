import type { SupabaseClient } from '@supabase/supabase-js'
import { readBundledPdf } from '@/lib/forms/assets'
import type { StandardTemplate } from '@/lib/forms/standard-library'

// Insert ONE library entry (+ document slot / fields / bundled PDF). The
// caller activates it afterwards. The partial unique index
// form_templates_standard_key_unique makes a repeat add an expected outcome —
// surfaced as { duplicate: true }, never thrown.
export async function insertStandardTemplate(
  supabase: SupabaseClient,
  std: StandardTemplate,
  opts: { exchangeId: string; schoolId: string; userId: string; deadline: string },
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await supabase
    .from('form_templates')
    .insert({
      exchange_id: opts.exchangeId,
      school_id: opts.schoolId,
      name: std.name,
      description: std.description,
      type: std.kind === 'online' || std.kind === 'fillable' ? 'data_entry' : 'document_upload',
      kind: std.kind,
      status: 'draft',
      audience: std.audience,
      standard_key: std.key,
      condition_label: std.condition_label,
      external_url: std.external_url,
      deadline: opts.deadline,
      created_by: opts.userId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    throw error
  }
  const templateId = data.id as string

  if (std.kind !== 'online' && std.kind !== 'fillable') {
    const { error: slotError } = await supabase
      .from('document_slots')
      .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
    if (slotError) throw slotError
  }
  if (std.fields.length > 0) {
    const { error: fieldError } = await supabase
      .from('form_fields')
      .insert(std.fields.map((f, i) => ({
        template_id: templateId, label: f.label, field_type: f.field_type, required: true, order: i,
      })))
    if (fieldError) throw fieldError
  }

  // National forms ship with the app; copy into the school's own path so the
  // download/replace plumbing, bucket and RLS are the same as a manual upload.
  const bundled = await readBundledPdf(std.key)
  if (bundled) {
    const path = `${opts.schoolId}/${templateId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('form-templates')
      .upload(path, new Blob([new Uint8Array(bundled)], { type: 'application/pdf' }),
        { upsert: true, contentType: 'application/pdf' })
    if (uploadError) throw uploadError
    const { error: pathError } = await supabase
      .from('form_templates').update({ template_file_path: path }).eq('id', templateId)
    if (pathError) throw pathError
  }

  return { id: templateId }
}
