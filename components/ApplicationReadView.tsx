import { APPLICATION_SECTIONS } from '@/lib/application-form'

export function ApplicationReadView({ data, photoUrl }: { data: Record<string, string>; photoUrl: string | null }) {
  return (
    <div className="space-y-8">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="Applicant photo" className="h-40 w-40 rounded-lg object-cover border" />
      )}
      {APPLICATION_SECTIONS.map(section => (
        <section key={section.id}>
          <h2 className="text-sm font-semibold text-slate-700 border-b pb-1 mb-3">{section.title.en}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.fields.map(f => (
              <div key={f.id}>
                <dt className="text-xs text-slate-500">{f.label.en}</dt>
                <dd className="text-sm text-slate-900 whitespace-pre-wrap">{data[f.id]?.trim() || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
