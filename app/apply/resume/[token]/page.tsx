import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { getApplicationDraft } from '@/actions/apply'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages, pickNamespaces } from '@/lib/i18n/messages'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { ApplicationForm } from '@/components/ApplicationForm'
import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads the live draft (autosaved answers + submitted/expired state) via the
// cookie-less admin client — force dynamic so it is never served from cache.
export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  // Once a row exists its stored language is authoritative (it survives a device
  // change, which a cookie does not). A dead token / expired link has no usable
  // language → fall back to the anonymous resolution.
  const locale: Locale =
    draft && 'language' in draft && isLocale(draft.language)
      ? draft.language
      : await resolveLocale()
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'apply'])
  const t = await getTranslations('apply')

  const wrap = (node: React.ReactNode) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>{node}</div>
    </NextIntlClientProvider>
  )

  if (!draft) return wrap(
    <InvalidLinkState title={t('page.invalidTitle')} body={t('page.invalidBody')} />
  )
  if (draft.expired) return wrap(
    <InvalidLinkState title={t('page.expiredTitle')} body={t('page.expiredBody')} />
  )
  if (draft.submitted) return wrap(
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="mb-6 text-[15px] text-[#0F7A3D]">{t('page.submittedNotice')}</p>
      <div className="flex justify-start">
        <ApplicationRecapButton token={token} language={locale} />
      </div>
    </main>
  )
  return wrap(
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm token={token} slug={draft.slug} exchangeName={draft.exchangeName} initialData={draft.data} locale={locale} initialPhotoUrl={draft.photoUrl} />
    </main>
  )
}
