'use server'
// Fillable, signable standard forms — two trust models in one feature file:
// organizer program-details management (this half) and the student fill/sign
// action (saveFillable below, Task 7). Spec:
// docs/superpowers/specs/2026-07-19-fillable-signable-forms-design.md
import { createClient } from '@/lib/supabase/server'
import { requireOrganizer } from '@/lib/auth/require'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExchangeProgramDetails } from '@/types/db'

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
    input.receiving_school_name, input.proviseur_name, input.sending_city]
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
  if (start && end && end < start) {
    return { ok: false, message: 'La date de retour doit être après la date de départ.' }
  }

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
