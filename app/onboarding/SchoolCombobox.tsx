'use client'
import { useEffect, useRef, useState } from 'react'
import { searchSchools } from '@/actions/onboarding'
import {
  formatSchoolOption, isSearchable, normalizeText, type SchoolOption,
} from '@/lib/schools/registry'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Where « Je ne trouve pas mon établissement » writes. Deliberately NOT a
// free-text fallback — that would reopen the door this gate closes. Schools
// abroad in the AEFE network are absent from the registry and land here.
export const SUPPORT_EMAIL = 'contact@eazyexchange.com'
const SEARCH_DEBOUNCE_MS = 250

export function SchoolCombobox({ value, onSelect, search = searchSchools }: {
  value: SchoolOption | null
  onSelect: (option: SchoolOption | null) => void
  // /signup runs before any account exists, so it passes the unauthenticated
  // twin. Defaults to the organizer-gated one used by /onboarding.
  search?: (query: string) => Promise<SchoolOption[]>
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<SchoolOption[]>([])
  const [searching, setSearching] = useState(false)
  // Monotonic ticket: a slow response for an older query must not overwrite a
  // newer one's results.
  const ticket = useRef(0)

  useEffect(() => {
    if (value) return
    const normalized = normalizeText(query)
    if (!isSearchable(normalized)) {
      setOptions([])
      setSearching(false)
      return
    }
    setSearching(true)
    const mine = ++ticket.current
    const timer = setTimeout(() => {
      void search(query)
        .then((rows) => {
          if (mine !== ticket.current) return
          setOptions(rows)
          setSearching(false)
        })
        .catch(() => {
          if (mine !== ticket.current) return
          setOptions([])
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, value, search])

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-[#42506E]">Votre établissement</span>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#C4CDE0] bg-[#F7F9FC] px-3 py-2.5">
          <span className="text-[14px] text-[#10203F]">{formatSchoolOption(value)}</span>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery('') }}
            className="flex-none text-[13px] font-semibold text-[#2456E6] hover:underline"
          >
            Changer
          </button>
        </div>
      </div>
    )
  }

  const showEmpty = !searching && isSearchable(normalizeText(query)) && options.length === 0

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="school-search" className="text-[13px] font-semibold text-[#42506E]">
        Votre établissement
      </Label>
      <Input
        id="school-search"
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls="school-options"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Commencez à taper le nom ou la ville…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 rounded-[10px] border-[#C4CDE0]"
      />
      <div id="school-options" role="listbox" aria-label="Établissements">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onSelect(option)}
            className="block w-full rounded-[8px] px-3 py-2 text-left text-[14px] text-[#10203F] hover:bg-[#EEF1F7]"
          >
            {formatSchoolOption(option)}
          </button>
        ))}
      </div>
      {searching && <p className="m-0 text-[12.5px] text-[#8A97B1]">Recherche…</p>}
      {showEmpty && <p className="m-0 text-[12.5px] text-[#8A97B1]">Aucun établissement trouvé.</p>}
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Établissement introuvable dans l’annuaire')}`}
        className="text-[12.5px] font-medium text-[#2456E6] hover:underline"
      >
        Je ne trouve pas mon établissement
      </a>
    </div>
  )
}
