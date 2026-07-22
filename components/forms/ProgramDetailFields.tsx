'use client'
import { useTranslations } from 'next-intl'
import {
  LIST_DETAIL_KEYS, DATE_DETAIL_KEYS,
  type DetailKey, type ProgramDetailPatch,
} from '@/lib/forms/add-requirements'

// One text/date/textarea input per program-detail column, reusing the labels
// already written for Réglages → Programme so the same field never has two
// names. Values are held as plain strings (list columns newline-separated,
// same convention as ProgramDetailsCard) and converted by detailPatch.
export type DetailState = Record<DetailKey, string>

export const EMPTY_DETAIL_STATE: DetailState = {
  destination: '', travel_start: '', travel_end: '', chaperones: '',
  association_name: '', sending_school_name: '', receiving_school_name: '',
  proviseur_name: '', sending_city: '', absence_dates: '',
}

const LABEL_KEY: Record<DetailKey, string> = {
  destination: 'settings.programDetails.destination',
  travel_start: 'settings.programDetails.travelStart',
  travel_end: 'settings.programDetails.travelEnd',
  chaperones: 'settings.programDetails.chaperones',
  association_name: 'settings.programDetails.association',
  sending_school_name: 'settings.programDetails.sendingSchool',
  receiving_school_name: 'settings.programDetails.receivingSchool',
  proviseur_name: 'settings.programDetails.proviseur',
  sending_city: 'settings.programDetails.sendingCity',
  absence_dates: 'settings.programDetails.absenceDates',
}

export function detailPatch(keys: DetailKey[], state: DetailState): ProgramDetailPatch {
  const patch: ProgramDetailPatch = {}
  for (const key of keys) {
    if (LIST_DETAIL_KEYS.includes(key)) {
      ;(patch as Record<string, unknown>)[key] =
        state[key].split('\n').map(s => s.trim()).filter(Boolean)
    } else {
      ;(patch as Record<string, unknown>)[key] = state[key]
    }
  }
  return patch
}

const inputCls = 'h-10 w-full rounded-[9px] border border-frame bg-card px-3 text-[13px] focus:border-brand focus:outline-none'
const areaCls = 'w-full rounded-[9px] border border-frame bg-card px-3 py-2 text-[13px] focus:border-brand focus:outline-none'

export function ProgramDetailFields({
  keys, state, onChange, idPrefix,
}: {
  keys: DetailKey[]
  state: DetailState
  onChange: (key: DetailKey, value: string) => void
  idPrefix: string
}) {
  const t = useTranslations('organizer')
  if (keys.length === 0) return null

  return (
    <>
      {keys.map((key) => {
        const id = `${idPrefix}-${key}`
        // LABEL_KEY[key] is a dynamic lookup (Record<DetailKey, string>), so
        // its type is the widened `string` — cast to satisfy next-intl's
        // strict per-namespace key union (global.d.ts ties Messages to
        // messages/en.json). Every value in LABEL_KEY is a real, existing key.
        const label = t(LABEL_KEY[key] as Parameters<typeof t>[0])
        return (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-[13px] font-semibold text-navy">{label}</label>
            {LIST_DETAIL_KEYS.includes(key) ? (
              <textarea id={id} rows={2} required value={state[key]}
                onChange={(e) => onChange(key, e.target.value)} className={areaCls} />
            ) : (
              <input id={id} required
                type={DATE_DETAIL_KEYS.includes(key) ? 'date' : 'text'}
                value={state[key]} onChange={(e) => onChange(key, e.target.value)}
                className={inputCls} />
            )}
          </div>
        )
      })}
    </>
  )
}
