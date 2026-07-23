import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { getInvitation } from '@/actions/invitations'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages, pickNamespaces } from '@/lib/i18n/messages'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { InviteResponseForm } from '@/components/InviteResponseForm'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads live invitation state via the cookie-less admin client — force dynamic
// so the parent response page is never served stale.
export const dynamic = 'force-dynamic'

export default async function InvitePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const { token } = await params
  const { r } = await searchParams
  const preselect = r === 'yes' || r === 'no' || r === 'maybe' ? r : null
  const invite = await getInvitation(token)

  // This page is reached from an emailed token, so there is no cookie guarantee:
  // the application row's stored language is authoritative, falling back to the
  // anonymous resolution when there is no row. Funnel bundle only (common+apply).
  const locale: Locale =
    invite && isLocale(invite.language) ? invite.language : await resolveLocale()
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'apply'])
  const t = await getTranslations('apply')

  const wrap = (node: React.ReactNode) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>{node}</div>
    </NextIntlClientProvider>
  )

  if (!invite) return wrap(
    <InvalidLinkState title={t('invite.invalidTitle')} body={t('invite.invalidBody')} />
  )
  if (invite.expired) return wrap(
    <InvalidLinkState title={t('invite.expiredTitle')} body={t('invite.expiredBody')} />
  )

  // Already confirmed (by a prior click or the other parent): parent-facing
  // success — the student has (or will shortly) receive their own setup link.
  // No session is minted here (this page is parent-facing).
  if (invite.status === 'enrolling' || invite.status === 'enrolled') return wrap(
    <CenteredCard maxWidth={520}>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">{t('invite.alreadyConfirmedTitle')}</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">{t('invite.alreadyConfirmedBody', { exchange: invite.exchangeName })}</p>
      </div>
    </CenteredCard>
  )

  const closed = !['accepted', 'maybe'].includes(invite.status)
  if (closed) return wrap(
    <InvalidLinkState title={t('invite.answeredTitle')} body={t('invite.answeredBody')} />
  )
  return wrap(
    <CenteredCard maxWidth={520}>
      <InviteResponseForm token={token} studentName={(invite.applicantName ?? '').trim()} exchangeName={invite.exchangeName} preselect={preselect} />
    </CenteredCard>
  )
}
