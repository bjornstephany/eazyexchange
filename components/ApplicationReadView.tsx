import { APPLICATION_SECTIONS } from '@/lib/application-form'

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
                <dd className="text-sm text-foreground whitespace-pre-wrap">{data[f.id]?.trim() || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
