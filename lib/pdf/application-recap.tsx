// Renders an applicant's own submitted answers to a PDF buffer, offered as a
// keepsake at the end of the funnel. Server-side only — imported by
// actions/apply.ts (downloadApplicationRecap).
//
// Layout is driven by iterating APPLICATION_SECTIONS: a question added to the
// funnel later shows up here automatically, with no second list to maintain.
// Separate module from fillable-pdf.tsx on purpose — that renderer walks a
// FillableDefinition block tree, which has nothing in common with a flat
// answers map.
import React from 'react'
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { APPLICATION_SECTIONS, type AppField } from '@/lib/application-form'
import { notoSansRegular, notoSansBold, notoSansItalic } from './fonts'

// Same family/sources as fillable-pdf.tsx. Font.register is idempotent per
// family, so both modules loading in one process is harmless.
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

const T = {
  en: {
    title: 'Application summary',
    submitted: 'Submitted on',
    yes: 'Yes',
    no: 'No',
    footer: 'Your answers, as submitted via EazyExchange.',
  },
  fr: {
    title: 'Récapitulatif de ma candidature',
    submitted: 'Envoyée le',
    yes: 'Oui',
    no: 'Non',
    footer: 'Tes réponses, telles qu’envoyées via EazyExchange.',
  },
}

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 10.5, lineHeight: 1.45, paddingTop: 48, paddingBottom: 64, paddingHorizontal: 56, color: '#111' },
  header: { marginBottom: 18 },
  title: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#444' },
  meta: { fontSize: 9.5, color: '#777', marginTop: 2 },
  photo: { width: 96, height: 120, objectFit: 'cover', marginBottom: 18, borderWidth: 1, borderColor: '#ddd' },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  row: { marginBottom: 5 },
  label: { fontSize: 9, color: '#666', marginBottom: 1 },
  value: { fontSize: 10.5 },
  footer: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#777', textAlign: 'center' },
})

export type RecapRow = { label: string; value: string }
export type RecapSection = { title: string; rows: RecapRow[] }

// Resolves one field's stored value into display text. Empty (or
// whitespace-only) answers return '' and are dropped by the caller.
function answerText(field: AppField, raw: string | undefined, language: 'en' | 'fr'): string {
  const v = (raw ?? '').trim()
  if (v === '') return ''
  if (field.type === 'yesno') {
    if (v === 'yes') return T[language].yes
    if (v === 'no') return T[language].no
    return v
  }
  if (field.type === 'radio') {
    return field.options?.find(o => o.value === v)?.label[language] ?? v
  }
  return v
}

// Pure content model of the recap: the sections and rows the PDF will draw.
// Exported so the label/option/empty-answer rules are unit-testable without
// parsing PDF bytes. Keys in `data` that are not in APPLICATION_SECTIONS are
// ignored — the sections are the single source of truth for what a recap shows.
export function recapSections(
  data: Record<string, string>,
  language: 'en' | 'fr',
): RecapSection[] {
  return APPLICATION_SECTIONS
    .map(section => ({
      title: section.title[language],
      rows: section.fields
        .map(f => ({ label: f.label[language], value: answerText(f, data[f.id], language) }))
        .filter(r => r.value !== ''),
    }))
    .filter(s => s.rows.length > 0)
}

// @react-pdf embeds PNG and JPEG only. Sniff the magic bytes rather than trust
// an extension; anything else (e.g. WebP, which the photo bucket accepts) is
// dropped so a picky upload never costs the applicant their whole recap.
function imageFormat(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

function formatSubmittedAt(iso: string, language: 'en' | 'fr'): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
  }).format(new Date(iso))
}

export async function renderApplicationRecapPdf(input: {
  exchangeName: string
  applicantName: string
  submittedAt: string | null
  data: Record<string, string>
  photoBytes: Uint8Array | null
  language: 'en' | 'fr'
}): Promise<Buffer> {
  const { exchangeName, applicantName, submittedAt, data, photoBytes, language } = input
  const t = T[language]
  const sections = recapSections(data, language)
  const format = photoBytes ? imageFormat(photoBytes) : null

  const doc = (
    <Document title={t.title} author="EazyExchange">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{exchangeName}{applicantName ? ` — ${applicantName}` : ''}</Text>
          {submittedAt ? (
            <Text style={styles.meta}>{t.submitted} {formatSubmittedAt(submittedAt, language)}</Text>
          ) : null}
        </View>

        {photoBytes && format ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is not a DOM img
          <Image style={styles.photo} src={{ data: Buffer.from(photoBytes), format }} />
        ) : null}

        {sections.map((section, i) => (
          <View key={i}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row, j) => (
              <View key={j} style={styles.row} wrap={false}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer} fixed>{t.footer}</Text>
      </Page>
    </Document>
  )

  return await renderToBuffer(doc)
}
