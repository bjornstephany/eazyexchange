// What a standard-library entry still needs before it can be activated, and
// how add-time answers fold back into the exchange's program-details row.
// Pure — no React, no Supabase (mirrors lib/forms/rollup.ts).
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import { missingDetailKeys } from '@/lib/forms/fillable/render'
import type { ProgramDetailsValues } from '@/lib/forms/fillable/types'

export type DetailKey = keyof ProgramDetailsValues

// What the add prompt sends back. Text columns arrive as strings, the two
// list columns as string arrays. Absent keys mean « not asked ».
export type ProgramDetailPatch = Partial<{
  destination: string
  travel_start: string
  travel_end: string
  chaperones: string[]
  association_name: string
  sending_school_name: string
  receiving_school_name: string
  proviseur_name: string
  sending_city: string
  absence_dates: string[]
}>

export const EMPTY_DETAILS: ProgramDetailsValues = {
  destination: null, travel_start: null, travel_end: null, chaperones: [],
  association_name: null, sending_school_name: null, receiving_school_name: null,
  proviseur_name: null, sending_city: null, absence_dates: [],
}

const LIST_KEYS = ['chaperones', 'absence_dates'] as const
export const LIST_DETAIL_KEYS: readonly DetailKey[] = LIST_KEYS
export const DATE_DETAIL_KEYS: readonly DetailKey[] = ['travel_start', 'travel_end']

// Only fillable entries carry program-detail requirements; everything else
// needs nothing beyond its deadline. Object.hasOwn keeps a crafted key
// ('constructor', '__proto__') from resolving to a prototype member.
export function missingProgramFields(
  standardKey: string | null,
  details: ProgramDetailsValues | null,
): DetailKey[] {
  if (!standardKey || !Object.hasOwn(FILLABLE_DEFINITIONS, standardKey)) return []
  return missingDetailKeys(FILLABLE_DEFINITIONS[standardKey], details)
}

// Patch wins only where it carries a real value — a blank answer never wipes
// data the organizer already saved in Réglages → Programme.
export function mergeProgramDetails(
  existing: ProgramDetailsValues | null,
  patch: ProgramDetailPatch,
): ProgramDetailsValues {
  const base: ProgramDetailsValues = { ...EMPTY_DETAILS, ...(existing ?? {}) }
  for (const key of LIST_KEYS) {
    const next = (patch[key] ?? []).map(x => x.trim()).filter(Boolean)
    if (next.length > 0) base[key] = next
  }
  for (const key of ['destination', 'travel_start', 'travel_end', 'association_name',
    'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city'] as const) {
    const next = (patch[key] ?? '').trim()
    if (next) base[key] = next
  }
  return base
}
