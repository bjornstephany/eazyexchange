import { getTranslations } from 'next-intl/server'
import { isSafeExternalUrl } from '@/lib/forms/template-result'

// Prominent external-step button for templates carrying a lien externe (e.g.
// the ESTA application). The raw URL is printed alongside the button so
// families can verify where it leads before clicking.
export async function ExternalLinkCard({ name, url }: { name: string; url: string }) {
  if (!isSafeExternalUrl(url)) return null
  const t = await getTranslations('student')
  return (
    <div className="mb-6 rounded-[12px] border bg-card p-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
      >
        {t('forms.external.cta', { name })} <span aria-hidden="true">↗</span>
      </a>
      <p className="mt-2 break-all font-mono text-[11.5px] text-muted-foreground">{url}</p>
    </div>
  )
}
