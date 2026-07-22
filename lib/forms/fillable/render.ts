// Pure substitution + validation for fillable definitions. No React, no
// Supabase — mirrors the lib/forms/rollup.ts testing pattern.
import type {
  FillableDefinition, ProgramDetailsValues, ProgramVariable, FillableInput,
} from './types'
import { VARIABLE_REQUIREMENTS, DETAIL_LABELS, DETAIL_ORDER } from './types'
import { MAX_ANSWER_LENGTH } from '@/lib/validation'

const FR_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const FR_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
const EN_DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

// 'YYYY-MM-DD' → Date pinned to noon UTC so Paris formatting never shifts a day.
function parseDate(d: string): Date {
  return new Date(`${d}T12:00:00Z`)
}

export function joinNames(names: string[], conj: string): string {
  const clean = names.map(n => n.trim()).filter(Boolean)
  if (clean.length <= 1) return clean.join('')
  return `${clean.slice(0, -1).join(', ')} ${conj} ${clean[clean.length - 1]}`
}

export function travelPeriodFr(start: string, end: string): string {
  const s = parseDate(start)
  const e = parseDate(end)
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  return `du ${sameYear ? FR_DAY_MONTH.format(s) : FR_DATE.format(s)} au ${FR_DATE.format(e)}`
}

export function travelPeriodEn(start: string, end: string): string {
  return `from ${EN_DATE.format(parseDate(start))} through ${EN_DATE.format(parseDate(end))}`
}

export type ResolvedVariables = Partial<Record<ProgramVariable, string>>

export function resolveVariables(input: {
  exchangeName: string
  details: ProgramDetailsValues | null
  now?: Date
}): ResolvedVariables {
  const out: ResolvedVariables = {
    exchange_name: input.exchangeName,
    today: FR_DATE.format(input.now ?? new Date()),
  }
  const d = input.details
  if (!d) return out
  if (d.destination?.trim()) out.destination = d.destination.trim()
  if (d.travel_start && d.travel_end) {
    out.travel_period = travelPeriodFr(d.travel_start, d.travel_end)
    out.travel_period_en = travelPeriodEn(d.travel_start, d.travel_end)
  }
  const chap = d.chaperones.map(c => c.trim()).filter(Boolean)
  if (chap.length > 0) {
    out.chaperones_et = joinNames(chap, 'et')
    out.chaperones_ou = joinNames(chap, 'ou')
    out.chaperones_or_en = joinNames(chap, 'or')
  }
  for (const k of ['association_name', 'sending_school_name', 'receiving_school_name', 'proviseur_name', 'sending_city'] as const) {
    const v = d[k]
    if (v?.trim()) out[k] = v.trim()
  }
  const days = d.absence_dates.map(x => x.trim()).filter(Boolean)
  if (days.length > 0) out.absence_dates = joinNames(days, 'et')
  return out
}

// Which detail columns a definition still needs, in DETAIL_ORDER sequence.
export function missingDetailKeys(
  def: FillableDefinition,
  details: ProgramDetailsValues | null,
): (keyof ProgramDetailsValues)[] {
  const missing = new Set<keyof ProgramDetailsValues>()
  for (const v of def.variables) {
    for (const col of VARIABLE_REQUIREMENTS[v]) {
      const val = details?.[col]
      const empty = Array.isArray(val)
        ? val.map(x => x.trim()).filter(Boolean).length === 0
        : !(val ?? '').trim()
      if (empty) missing.add(col)
    }
  }
  return DETAIL_ORDER.filter(k => missing.has(k))
}

export function missingDetailLabels(
  def: FillableDefinition,
  details: ProgramDetailsValues | null,
): string[] {
  return missingDetailKeys(def, details).map(c => DETAIL_LABELS[c])
}

type SigBlock = { key: string; roleLabel: string; required: boolean; prefill?: 'student_name' }

export function signatureBlocks(def: FillableDefinition): SigBlock[] {
  const out: SigBlock[] = []
  for (const b of def.blocks) {
    if (b.b === 'signature') out.push({ key: b.key, roleLabel: b.roleLabel, required: b.required, prefill: b.prefill })
  }
  return out
}

// Every answerable key with its requiredness and kind ('check' needs 'true').
function answerKeys(def: FillableDefinition): { key: string; required: boolean; isCheck: boolean }[] {
  const out: { key: string; required: boolean; isCheck: boolean }[] = []
  for (const b of def.blocks) {
    if (b.b === 'heading' || b.b === 'paragraph') {
      for (const r of b.runs) {
        if (r.t === 'blank') out.push({ key: r.key, required: r.required !== false, isCheck: false })
      }
    } else if (b.b === 'field' || b.b === 'radio') {
      out.push({ key: b.key, required: b.required, isCheck: false })
    } else if (b.b === 'check') {
      out.push({ key: b.key, required: b.required, isCheck: true })
    }
  }
  return out
}

// Every key a student can answer — blanks, fields, radios, checks. Signature
// keys are not answers; see signatureBlocks(). Used by validateFillable() and
// by the client to drop stale keys from an older saved draft.
export function declaredAnswerKeys(def: FillableDefinition): Set<string> {
  return new Set(answerKeys(def).map(k => k.key))
}

const MSG_INCOMPLETE = 'Complétez tous les champs obligatoires avant d’envoyer.'
const MSG_SIGNATURES = 'Chaque signature doit comporter le nom complet et la case « Lu et approuvé » cochée.'
const MSG_TOO_LONG = `Une réponse dépasse la limite de ${MAX_ANSWER_LENGTH} caractères.`
const MSG_UNKNOWN = 'Données de formulaire invalides.'

export function validateFillable(
  def: FillableDefinition,
  input: FillableInput,
): { ok: true } | { ok: false; message: string } {
  const keys = answerKeys(def)
  const known = new Set(keys.map(k => k.key))
  for (const k of Object.keys(input.answers)) {
    if (!known.has(k)) return { ok: false, message: MSG_UNKNOWN }
  }
  for (const v of Object.values(input.answers)) {
    if (String(v ?? '').length > MAX_ANSWER_LENGTH) return { ok: false, message: MSG_TOO_LONG }
  }
  for (const k of keys) {
    const v = (input.answers[k.key] ?? '').trim()
    if (k.required && (k.isCheck ? v !== 'true' : v === '')) {
      return { ok: false, message: MSG_INCOMPLETE }
    }
  }

  const sigDefs = signatureBlocks(def)
  const sigKeys = new Set(sigDefs.map(s => s.key))
  const byKey = new Map(input.signatures.map(s => [s.key, s]))
  if (input.signatures.length !== byKey.size) return { ok: false, message: MSG_UNKNOWN }
  for (const s of input.signatures) {
    if (!sigKeys.has(s.key)) return { ok: false, message: MSG_UNKNOWN }
    if (String(s.full_name ?? '').length > MAX_ANSWER_LENGTH) return { ok: false, message: MSG_TOO_LONG }
  }
  const complete = (key: string) => {
    const s = byKey.get(key)
    return !!s && s.full_name.trim() !== '' && s.approved === true
  }
  const untouched = (key: string) => {
    const s = byKey.get(key)
    return !s || (s.full_name.trim() === '' && s.approved !== true)
  }
  // A signature that's a member of a requireOneOf group has its "required"
  // enforced by that group rule below, not individually — only one signer in
  // the group has to complete. A partially-filled signature (touched but
  // incomplete) is always invalid, grouped or not.
  const groupedSignatureKeys = new Set((def.requireOneOf ?? []).flatMap(r => r.keys))
  for (const sd of sigDefs) {
    if (complete(sd.key)) continue
    if (untouched(sd.key)) {
      if (sd.required && !groupedSignatureKeys.has(sd.key)) {
        return { ok: false, message: MSG_SIGNATURES }
      }
      continue
    }
    return { ok: false, message: MSG_SIGNATURES }
  }

  for (const rule of def.requireOneOf ?? []) {
    const satisfied = rule.keys.some(k =>
      complete(k) || (input.answers[k] ?? '').trim() !== '')
    if (!satisfied) return { ok: false, message: rule.message }
  }
  return { ok: true }
}
