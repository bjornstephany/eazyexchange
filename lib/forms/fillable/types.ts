// Code-defined fillable documents: fixed French legal text with variable
// tokens (resolved from exchange_program_details + the exchange name), input
// blanks, and e-signature blocks. One definition renders both the student web
// form (components/FillableForm.tsx) and the signed PDF (lib/pdf/fillable-pdf.tsx).

export type ProgramVariable =
  | 'exchange_name' | 'today'
  | 'destination' | 'travel_period' | 'travel_period_en'
  | 'chaperones_et' | 'chaperones_ou' | 'chaperones_or_en'
  | 'association_name' | 'sending_school_name' | 'receiving_school_name'
  | 'proviseur_name' | 'sending_city' | 'absence_dates'

// Plain shape of an exchange_program_details row (structurally satisfied by
// the generated Row type — kept separate so the pure helpers stay DB-free).
export type ProgramDetailsValues = {
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

export type Run =
  | { t: 'text'; text: string }
  | { t: 'var'; name: ProgramVariable }
  | { t: 'blank'; key: string; label: string; required?: boolean; prefill?: 'student_name' }

export type Block =
  | { b: 'heading'; runs: Run[]; level?: 1 | 2 }
  | { b: 'paragraph'; runs: Run[]; style?: 'normal' | 'bold' | 'italic' }
  | { b: 'field'; key: string; label: string; input: 'text' | 'textarea' | 'phone'; required: boolean; prefix?: string }
  | { b: 'radio'; key: string; label: string; options: string[]; required: boolean }
  | { b: 'check'; key: string; runs: Run[]; required: boolean }
  | { b: 'signature'; key: string; roleLabel: string; required: boolean; prefill?: 'student_name' }
  | { b: 'divider' }

// « at least one of these keys must be provided » — a key counts as provided
// when it is a completed signature or a non-empty answer.
export type RequireOneOf = { keys: string[]; message: string }

export type FillableDefinition = {
  key: string // = form_templates.standard_key
  title: string
  variables: ProgramVariable[]
  blocks: Block[]
  requireOneOf?: RequireOneOf[]
}

// Which detail columns a variable needs before a template can activate.
// exchange_name/today derive from the exchange row / the clock — never missing.
export const VARIABLE_REQUIREMENTS: Record<ProgramVariable, (keyof ProgramDetailsValues)[]> = {
  exchange_name: [], today: [],
  destination: ['destination'],
  travel_period: ['travel_start', 'travel_end'],
  travel_period_en: ['travel_start', 'travel_end'],
  chaperones_et: ['chaperones'], chaperones_ou: ['chaperones'], chaperones_or_en: ['chaperones'],
  association_name: ['association_name'],
  sending_school_name: ['sending_school_name'],
  receiving_school_name: ['receiving_school_name'],
  proviseur_name: ['proviseur_name'],
  sending_city: ['sending_city'],
  absence_dates: ['absence_dates'],
}

// French labels for missing-detail messages (activation gate + hints). NOT
// localized — same convention as the MSG_* activation messages.
export const DETAIL_LABELS: Record<keyof ProgramDetailsValues, string> = {
  destination: 'Destination',
  travel_start: 'Date de départ',
  travel_end: 'Date de retour',
  chaperones: 'Accompagnateurs',
  association_name: 'Nom de l’association',
  sending_school_name: 'Lycée d’origine',
  receiving_school_name: 'Établissement d’accueil',
  proviseur_name: 'Nom du proviseur',
  sending_city: 'Ville du lycée',
  absence_dates: 'Jours d’absence',
}

// What the client sends; the server stamps signed_at (never trusted from client).
export type SignatureInput = { key: string; full_name: string; approved: boolean }
export type FillableInput = { answers: Record<string, string>; signatures: SignatureInput[] }
