import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages, pickNamespaces } from '@/lib/i18n/messages'
import { ApplyEntry } from '@/components/ApplyEntry'
import { Logo } from '@/components/brand/Logo'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live exchange state (application_open/deadline) via the cookie-less anon
// client through a narrowly-granted RPC, which is otherwise eligible for Next's
// Data Cache — force dynamic so the open/closed state is never served stale.
export const dynamic = 'force-dynamic'

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const anon = createAnonClient()
  const { data: exchange } = await anon
    .rpc('get_apply_page_exchange', { p_slug: slug })
    .maybeSingle()

  const closed = !exchange || !exchange.application_open ||
    (exchange.application_deadline != null && new Date().toISOString().slice(0, 10) > exchange.application_deadline)

  // Anonymous locale: cookie → Accept-Language → en. Both trees below are
  // already force-dynamic, so the provider mount never touches the static
  // landing. The funnel ships only common + apply — no organizer copy.
  const locale = await resolveLocale()
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'apply'])
  const t = await getTranslations('apply')

  if (!exchange) return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>
        <InvalidLinkState title={t('page.invalidTitle')} body={t('page.invalidBody')} />
      </div>
    </NextIntlClientProvider>
  )
  if (closed) return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main lang={locale} className="mx-auto max-w-[720px] px-4 pt-[52px]">
        <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
        <p className="text-[15px] text-[#5B6B8C]">{t('page.closed')}</p>
      </main>
    </NextIntlClientProvider>
  )
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main lang={locale} className="mx-auto max-w-[720px] px-4 pt-[52px]">
        <div className="mb-[26px]"><Logo href={null} /></div>
        <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{t('page.badge')}</span>
        <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchange.name}</h1>
        <ApplyEntry slug={slug} locale={locale} />
      </main>
    </NextIntlClientProvider>
  )
}
