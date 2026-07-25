'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { GOOD_NEWS_FIELD_ORDER, type GoodNewsField } from '@/lib/exchange/good-news-fields'
import type { AcceptBlock } from '@/actions/applications-review'

// Shown when an accept was refused because the « Bonne nouvelle » email would
// have gone out with placeholders in it. Shared by the single review screen and
// the bulk Candidatures bar so both explain the same refusal the same way.
//
// Field names come from i18n rather than GOOD_NEWS_FIELD_LABELS: that constant
// is French-only by design (it serves non-localized surfaces), and the organizer
// UI is translated into five languages.
export function GoodNewsBlockNotice({ block, showTemplateLink = true }: {
  block: AcceptBlock
  // False inside the template editor itself, where a « edit the template » link
  // would point at the page the organizer is already on.
  showTemplateLink?: boolean
}) {
  const t = useTranslations('organizer.applications.goodNewsBlock')
  // Canonical order, not the order the guard happened to report.
  const missing = GOOD_NEWS_FIELD_ORDER.filter(f => block.missing.includes(f))
  // Literal keys, not `t(\`fields.${f}\`)`: a template-literal argument makes
  // next-intl's key union explode into TS2590 ("union type too complex").
  const FIELD_KEY: Record<GoodNewsField, string> = {
    travel_dates: t('fields.travel_dates'),
    participation_cost: t('fields.participation_cost'),
    payment_details: t('fields.payment_details'),
    confirmation_deadline: t('fields.confirmation_deadline'),
  }

  return (
    <div className="rounded-[10px] border border-danger bg-danger/40 px-4 py-3 text-[13px] text-danger-text">
      <p className="m-0 mb-1 font-semibold">{t('title')}</p>
      {missing.length > 0 && (
        <>
          <p className="m-0 mb-1">{t('missingIntro')}</p>
          <ul className="m-0 mb-2 list-disc pl-5">
            {missing.map(f => <li key={f}>{FIELD_KEY[f]}</li>)}
          </ul>
        </>
      )}
      {block.literal && <p className="m-0 mb-2">{t('literal')}</p>}
      {/* Two problems, two destinations: missing values are filled in Réglages
          → Programme, hand-typed placeholders in the template editor. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {missing.length > 0 && (
          <Link href="/settings" className="font-semibold underline underline-offset-2">
            {t('cta')}
          </Link>
        )}
        {block.literal && showTemplateLink && (
          <Link href="/communication" className="font-semibold underline underline-offset-2">
            {t('ctaTemplate')}
          </Link>
        )}
      </div>
    </div>
  )
}
