import { getTranslations } from 'next-intl/server'
import { localizedApplicationSections, type LocalizedField } from '@/lib/application-form.labels'
import type { AppSection } from '@/lib/application-form'
import { asAppTranslator, type AppTranslator } from '@/lib/i18n/messages'

// Stored tokens → display labels. Radio answers fall back to the raw string so
// legacy free-text values (pre-choice sex/pronoun answers) keep rendering.
function displayValue(f: LocalizedField, raw: string | undefined, t: AppTranslator): string {
  const v = raw?.trim() ?? ''
  if (!v) return '—'
  if (f.type === 'radio') return f.options?.find(o => o.value === v)?.label ?? v
  if (f.type === 'yesno') {
    if (v === 'yes') return t('form.yes')
    if (v === 'no') return t('form.no')
  }
  return v
}

// The organizer's read-only view of a submitted application. Labels follow the
// READER's locale (the reviewing organizer), not the applicant's — the stored
// answers are data and render verbatim either way.
export async function ApplicationReadView({ data, photoUrl, sections }: {
  data: Record<string, string>
  photoUrl: string | null
  // The reviewed application's exchange questionnaire, resolved. Undefined
  // falls back to the built-in catalog.
  sections?: AppSection[]
}) {
  const t = asAppTranslator(await getTranslations('apply'))
  // An emptied section is not rendered — same rule as the funnel and the recap.
  const localized = localizedApplicationSections(t, sections).filter(s => s.fields.length > 0)

  return (
    <div className="space-y-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={t('recap.photoAlt')} className="h-40 w-40 rounded-lg object-cover border" />
      )}
      {localized.map(section => (
        <section key={section.id}>
          <h2 className="font-display text-[17px] font-bold tracking-tight border-b pb-2 mb-4">{section.title}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map(f => (
              <div key={f.id}>
                <dt className="text-xs text-foreground">{f.label}</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{displayValue(f, data[f.id], t)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
