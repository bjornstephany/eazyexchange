// Thumbnail-sized derivation of a fillable document, used by the Fichiers card
// preview. Pure — no React, no Supabase, no PDF. The card is ~150px wide, so
// this deliberately takes only the document's head: kicker, title, the first
// couple of paragraphs, and one signature row.
//
// Heading rule (NOT simply "level 2 = kicker"): the four real definitions
// disagree about heading order — decharge puts a level-2 kicker BEFORE its
// level-1 title, while medical puts a level-2 subtitle AFTER it. So the title
// is the first level-1 heading and the kicker is whatever heading precedes it.
import { FILLABLE_DEFINITIONS } from '@/lib/forms/fillable'
import type { Block, FillableDefinition, Run } from '@/lib/forms/fillable/types'
import { signatureBlocks, type ResolvedVariables } from '@/lib/forms/fillable/render'

export type PreviewRun = { t: 'text'; text: string } | { t: 'blank' }

export type PreviewBlock =
  | { p: 'kicker'; text: string }
  | { p: 'title'; text: string }
  | { p: 'paragraph'; runs: PreviewRun[] }
  | { p: 'signatures'; labels: string[] }

const MAX_PARAGRAPHS = 2
const MAX_SIGNATURES = 2
// Character budget for all paragraph text combined. Sized so the longest
// definition still fits the fixed aspect-[210/260] preview zone.
const CHAR_BUDGET = 420
// A rendered blank occupies roughly this many characters of line width.
const BLANK_COST = 12

type Heading = Extract<Block, { b: 'heading' }>

const headingLevel = (b: Heading): 1 | 2 => b.level ?? 1

export function fillablePreviewBlocks(
  def: FillableDefinition,
  resolved: ResolvedVariables,
): PreviewBlock[] {
  const out: PreviewBlock[] = []

  const headings = def.blocks
    .map((b, i) => ({ b, i }))
    .filter((x): x is { b: Heading; i: number } => x.b.b === 'heading')

  const title = headings.find((h) => headingLevel(h.b) === 1) ?? headings[0]
  const kicker = title
    ? [...headings].reverse().find((h) => h.i < title.i)
    : undefined

  if (kicker) {
    const text = headingText(kicker.b.runs, resolved)
    if (text) out.push({ p: 'kicker', text })
  }
  if (title) {
    const text = headingText(title.b.runs, resolved)
    if (text) out.push({ p: 'title', text })
  }

  let budget = CHAR_BUDGET
  let taken = 0
  for (const b of def.blocks.slice(title ? title.i + 1 : 0)) {
    if (taken >= MAX_PARAGRAPHS || budget <= 0) break
    if (b.b !== 'paragraph') continue
    const runs = trimRuns(previewRuns(b.runs, resolved), budget)
    if (runs.length === 0) continue
    out.push({ p: 'paragraph', runs })
    budget -= runsLength(runs)
    taken += 1
  }

  const labels = signatureBlocks(def).slice(0, MAX_SIGNATURES).map((s) => s.roleLabel)
  if (labels.length > 0) out.push({ p: 'signatures', labels })

  return out
}

// Guarded lookup: standard_key comes from the database, so a prototype-valued
// key must not resolve to Object.prototype.constructor and crash the render.
export function fillablePreviewFor(
  standardKey: string | null,
  resolved: ResolvedVariables,
): PreviewBlock[] {
  if (!standardKey) return []
  if (!Object.prototype.hasOwnProperty.call(FILLABLE_DEFINITIONS, standardKey)) return []
  return fillablePreviewBlocks(FILLABLE_DEFINITIONS[standardKey], resolved)
}

// Headings collapse to plain text; an unresolved variable simply vanishes
// (a heading with an underline blank in it reads as a mistake, not a form).
function headingText(runs: Run[], resolved: ResolvedVariables): string {
  return runs
    .map((r) => {
      if (r.t === 'text') return r.text
      if (r.t === 'var') return resolved[r.name] ?? ''
      return ''
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

// Paragraph runs keep their blanks — those underlines are what make the
// preview read as a form. An unresolved variable becomes a blank too, so a
// draft with incomplete program details previews instead of leaking a token.
function previewRuns(runs: Run[], resolved: ResolvedVariables): PreviewRun[] {
  const out: PreviewRun[] = []
  const pushText = (text: string) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.t === 'text') last.text += text
    else out.push({ t: 'text', text })
  }
  for (const r of runs) {
    if (r.t === 'text') pushText(r.text)
    else if (r.t === 'blank') out.push({ t: 'blank' })
    else {
      const v = resolved[r.name]
      if (v) pushText(v)
      else out.push({ t: 'blank' })
    }
  }
  return out
}

function runsLength(runs: PreviewRun[]): number {
  return runs.reduce((n, r) => n + (r.t === 'text' ? r.text.length : BLANK_COST), 0)
}

function trimRuns(runs: PreviewRun[], budget: number): PreviewRun[] {
  const out: PreviewRun[] = []
  let left = budget
  for (const r of runs) {
    if (left <= 0) break
    if (r.t === 'blank') {
      out.push(r)
      left -= BLANK_COST
      continue
    }
    if (r.text.length <= left) {
      out.push(r)
      left -= r.text.length
      continue
    }
    // -1 so the appended ellipsis stays inside the budget the caller granted.
    out.push({ t: 'text', text: r.text.slice(0, Math.max(0, left - 1)).trimEnd() + '…' })
    left = 0
  }
  return out
}
