import { APPLICATION_SECTIONS, type AppField } from '@/lib/application-form'

// Stored tokens → display labels. Radio answers fall back to the raw string so
// legacy free-text values (pre-choice sex/pronoun answers) keep rendering.
function displayValue(f: AppField, raw: string | undefined, lang: 'en' | 'fr'): string {
  const v = raw?.trim() ?? ''
  if (!v) return '—'
  if (f.type === 'radio') return f.options?.find(o => o.value === v)?.label[lang] ?? v
  if (f.type === 'yesno') {
    if (v === 'yes') return lang === 'fr' ? 'Oui' : 'Yes'
    if (v === 'no') return lang === 'fr' ? 'Non' : 'No'
  }
  return v
}

export function ApplicationReadView({
  data,
  photoUrl,
  lang = 'en',
}: {
  data: Record<string, string>
  photoUrl: string | null
  lang?: 'en' | 'fr'
}) {
  return (
    <div className="space-y-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Applicant photo" className="h-40 w-40 rounded-lg object-cover border" />
      )}
      {APPLICATION_SECTIONS.map(section => (
        <section key={section.id}>
          <h2 className="font-display text-[17px] font-bold tracking-tight border-b pb-2 mb-4">{section.title[lang]}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map(f => (
              <div key={f.id}>
                <dt className="text-xs text-muted-foreground">{f.label[lang]}</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">{displayValue(f, data[f.id], lang)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
