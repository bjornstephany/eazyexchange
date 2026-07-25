// Renders a completed fillable definition (+ answers + e-signatures) to a PDF
// buffer. Server-side only — imported by actions/fillable.ts at submit time.
// Layout is a clean regeneration of the document, not a pixel copy of the
// paper originals (spec § PDF generation).
import React from 'react'
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { Block, FillableDefinition, Run } from '@/lib/forms/fillable/types'
import type { ResolvedVariables } from '@/lib/forms/fillable/render'
import type { FillableData } from '@/types/db'
import { notoSansRegular, notoSansBold, notoSansItalic } from './fonts'

Font.register({
  family: 'NotoSans',
  fonts: [
    { src: notoSansRegular },
    { src: notoSansBold, fontWeight: 700 },
    { src: notoSansItalic, fontStyle: 'italic' },
  ],
})
// French words must not be hyphen-broken mid-word.
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10.5, lineHeight: 1.45, paddingTop: 48, paddingBottom: 64, paddingHorizontal: 56, color: '#111' },
  h1: { fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 10, marginTop: 6 },
  h2: { fontSize: 11, fontWeight: 700, textAlign: 'center', marginBottom: 8, marginTop: 4 },
  para: { marginBottom: 8 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  answer: { fontWeight: 700, textDecoration: 'underline' },
  fieldRow: { marginBottom: 6 },
  fieldLabel: { fontWeight: 700 },
  check: { flexDirection: 'row', marginBottom: 5 },
  // ☑/☐ have no glyph in the embedded NotoSans (verified with fontkit
  // hasGlyphForCodePoint — false for U+2610/U+2611/U+2713/U+2717/U+2612), so
  // checked vs unchecked is drawn with a bordered box + a covered "X" glyph
  // rather than a checkbox codepoint.
  checkBox: { width: 12, height: 12, borderWidth: 1, borderColor: '#111', marginRight: 6, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  checkBoxMark: { fontSize: 9, fontWeight: 700, lineHeight: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#999', borderBottomStyle: 'dashed', marginVertical: 12 },
  sigBox: { borderWidth: 1, borderColor: '#bbb', borderRadius: 4, padding: 10, marginBottom: 8 },
  sigRole: { fontSize: 9, color: '#555', marginBottom: 2 },
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#777', textAlign: 'center' },
})

// fr-FR on purpose: the signature line is part of a French document, not UI chrome.
const SIGNED_AT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
})

function runText(run: Run, values: ResolvedVariables, answers: Record<string, string>): { text: string; isAnswer: boolean } {
  if (run.t === 'text') return { text: run.text, isAnswer: false }
  if (run.t === 'var') return { text: values[run.name] ?? '—', isAnswer: false }
  const v = (answers[run.key] ?? '').trim()
  return { text: v === '' ? '……………' : v, isAnswer: v !== '' }
}

function Runs({ runs, values, answers }: {
  runs: Run[]; values: ResolvedVariables; answers: Record<string, string>
}) {
  return (
    <>
      {runs.map((r, i) => {
        const { text, isAnswer } = runText(r, values, answers)
        return <Text key={i} style={isAnswer ? styles.answer : undefined}>{text}</Text>
      })}
    </>
  )
}

export async function renderFillablePdf(input: {
  def: FillableDefinition
  values: ResolvedVariables
  data: FillableData
  meta: { exchangeName: string; associationName: string | null; submissionId: string }
}): Promise<Buffer> {
  const { def, values, data, meta } = input
  const answers = data.answers
  const sigByKey = new Map(data.signatures.map(s => [s.key, s]))

  const doc = (
    <Document title={def.title} author={meta.associationName ?? 'EazyExchange'}>
      <Page size="A4" style={styles.page}>
        {def.blocks.map((b, i) => {
          if (b.b === 'heading') {
            return (
              <Text key={i} style={b.level === 2 ? styles.h2 : styles.h1}>
                <Runs runs={b.runs} values={values} answers={answers} />
              </Text>
            )
          }
          if (b.b === 'paragraph') {
            const extra = b.style === 'bold' ? styles.bold : b.style === 'italic' ? styles.italic : undefined
            return (
              <Text key={i} style={[styles.para, ...(extra ? [extra] : [])]}>
                <Runs runs={b.runs} values={values} answers={answers} />
              </Text>
            )
          }
          if (b.b === 'field') {
            const v = (answers[b.key] ?? '').trim()
            return (
              <View key={i} style={styles.fieldRow}>
                <Text>
                  <Text style={styles.fieldLabel}>{b.label} : </Text>
                  {b.prefix ? `${b.prefix} ` : ''}
                  <Text style={styles.answer}>{v === '' ? '—' : v}</Text>
                </Text>
              </View>
            )
          }
          if (b.b === 'radio') {
            const v = (answers[b.key] ?? '').trim()
            return (
              <View key={i} style={styles.fieldRow}>
                <Text>
                  <Text style={styles.fieldLabel}>{b.label} : </Text>
                  <Text style={styles.answer}>{v === '' ? '—' : v}</Text>
                </Text>
              </View>
            )
          }
          if (b.b === 'check') {
            const checked = (answers[b.key] ?? '') === 'true'
            return (
              <View key={i} style={styles.check}>
                <View style={styles.checkBox}>
                  {checked ? <Text style={styles.checkBoxMark}>X</Text> : null}
                </View>
                <Text style={{ flex: 1 }}>
                  <Runs runs={b.runs} values={values} answers={answers} />
                </Text>
              </View>
            )
          }
          if (b.b === 'signature') {
            const s = sigByKey.get(b.key)
            if (!s || s.full_name.trim() === '') {
              // Untouched optional signatory: omit the box entirely.
              return b.required ? (
                <View key={i} style={styles.sigBox}>
                  <Text style={styles.sigRole}>{b.roleLabel}</Text>
                  <Text>—</Text>
                </View>
              ) : null
            }
            const when = s.signed_at ? SIGNED_AT.format(new Date(s.signed_at)) : '—'
            return (
              <View key={i} style={styles.sigBox} wrap={false}>
                <Text style={styles.sigRole}>{b.roleLabel}</Text>
                <Text>
                  Signé électroniquement par <Text style={styles.answer}>{s.full_name}</Text> le {when} — « Lu et approuvé »
                </Text>
              </View>
            )
          }
          if (b.b === 'divider') {
            return <View key={i} style={styles.divider} />
          }
          // Exhaustiveness guard: a new Block variant must be handled above
          // or this fails to compile instead of silently rendering nothing.
          const _exhaustive: never = b
          throw new Error(`Unhandled fillable block kind: ${(_exhaustive as Block).b}`)
        })}
        <Text style={styles.footer} fixed>
          {meta.exchangeName}{meta.associationName ? ` — ${meta.associationName}` : ''} · Signé via EazyExchange · Soumission {meta.submissionId}
        </Text>
      </Page>
    </Document>
  )

  return await renderToBuffer(doc)
}
