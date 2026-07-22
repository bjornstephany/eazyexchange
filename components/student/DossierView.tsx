import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { asAppTranslator, type AppTranslator } from '@/lib/i18n/messages'
import { dossierSubline, type Dossier, type DossierItem } from '@/lib/student/dossier'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function actionLabel(status: DossierItem['status'], t: AppTranslator, c: AppTranslator): string {
  if (status === 'rejected') return t('dossier.actions.fix')
  if (status === 'draft') return c('actions.continue')
  return t('dossier.actions.start')
}

function TodoCard({ item, showTag, t, c }: {
  item: DossierItem; showTag: boolean; t: AppTranslator; c: AppTranslator
}) {
  const isFix = item.status === 'rejected'
  return (
    <div className={`flex items-center gap-4 rounded-[14px] border bg-card px-5 py-4 ${isFix ? 'border-[#F0C9C3]' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-display text-[15px] font-semibold text-navy">{item.name}</span>
          {isFix && <Badge variant="danger">{t('states.rejected')}</Badge>}
          {showTag && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-placeholder">{item.exchangeName}</span>
          )}
        </div>
        {isFix && item.reviewNote ? (
          <p className="mt-1 text-[12.5px] text-danger-text">{item.reviewNote}</p>
        ) : item.deadline ? (
          <p className={`mt-1 text-[12.5px] ${item.overdue ? 'font-medium text-danger-text' : 'text-muted-foreground'}`}>
            {item.overdue
              ? t('dossier.card.overdue', { date: formatDate(item.deadline) })
              : t('dossier.card.deadline', { date: formatDate(item.deadline) })}
          </p>
        ) : null}
      </div>
      <Link
        href={`/my-forms/${item.id}`}
        className={`flex-none rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-white ${
          isFix ? 'bg-danger-text hover:opacity-90' : 'bg-brand hover:bg-brand-hover'
        }`}
      >
        {actionLabel(item.status, t, c)}
      </Link>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </div>
  )
}

export async function DossierView({ dossier, firstName }: { dossier: Dossier; firstName: string }) {
  const t = asAppTranslator(await getTranslations('student'))
  const c = asAppTranslator(await getTranslations('common'))
  const { total, todo, review, done, todoCount, reviewCount, doneCount, sentCount, pct, nextDeadline, multiExchange } = dossier
  const allApproved = total > 0 && doneCount === total
  const allSent = total > 0 && todoCount === 0 && reviewCount > 0

  return (
    <div>
      <div className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('shell.tabs.dossier')}</div>
      <h1 className="mb-1.5 font-display text-[30px] font-bold leading-[1.1] tracking-tight text-navy">{t('dossier.greeting', { name: firstName })}</h1>
      <p className="mb-6 text-[14.5px] leading-relaxed text-muted-foreground">{dossierSubline(dossier, t)}</p>

      {total === 0 && (
        <div className="flex items-center gap-4 rounded-[22px] border border-tint-border bg-tint px-[34px] py-[30px]">
          <div className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-[18px] bg-brand-hover text-2xl font-bold text-white">✓</div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[22px] font-semibold text-navy">{t('dossier.upToDate.title')}</div>
            <p className="mt-1 text-[16px] leading-relaxed text-foreground">
              {t('dossier.upToDate.body')}
            </p>
          </div>
        </div>
      )}

      {total > 0 && (
        <>
          {allApproved && (
            <div className="mb-4 flex items-center gap-4 rounded-[16px] border border-tint-border bg-tint px-6 py-5">
              <div className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-[14px] bg-brand text-2xl font-bold text-white">✓</div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-semibold text-navy">{t('dossier.complete.title')}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground">{t('dossier.complete.body')}</p>
              </div>
            </div>
          )}
          {allSent && (
            <div className="mb-4 flex items-center gap-4 rounded-[16px] border border-tint-border bg-tint px-6 py-5">
              <div className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-[14px] bg-brand text-2xl font-bold text-white">…</div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[17px] font-semibold text-navy">{t('dossier.allSent.title')}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground">{t('dossier.allSent.body')}</p>
              </div>
            </div>
          )}

          <div className="mb-7">
            <div className="flex items-center gap-3.5">
              <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-subtle">
                <div className="h-full rounded-pill bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-mono text-[12px] text-muted-foreground">{t('dossier.progress', { sent: sentCount, total })}</span>
            </div>
            {nextDeadline && (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{t('dossier.nextDeadline', { date: formatDate(nextDeadline) })}</p>
            )}
          </div>

          {todoCount > 0 && (
            <section className="mb-7">
              <SectionHeader>{t('dossier.sections.todo', { n: todoCount })}</SectionHeader>
              <div className="flex flex-col gap-2.5">
                {todo.map(item => <TodoCard key={item.id} item={item} showTag={multiExchange} t={t} c={c} />)}
              </div>
            </section>
          )}

          {reviewCount > 0 && (
            <section className="mb-7">
              <SectionHeader>{t('dossier.sections.review', { n: reviewCount })}</SectionHeader>
              <div className="flex flex-col gap-2.5">
                {review.map(item => (
                  <div key={item.id} className="flex items-center gap-3.5 rounded-[14px] border bg-card px-5 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-display text-[14px] font-semibold text-navy">{item.name}</span>
                      <span className="ml-2 text-[12.5px] text-muted-foreground">{t('dossier.card.reviewNote')}</span>
                    </span>
                    <Badge variant="info">{t('states.submitted')}</Badge>
                  </div>
                ))}
              </div>
            </section>
          )}

          {doneCount > 0 && (
            <section className="mb-7">
              <SectionHeader>{t('dossier.sections.done', { n: doneCount })}</SectionHeader>
              <div className="overflow-hidden rounded-[14px] border bg-card">
                {done.map(item => (
                  <div key={item.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
                    <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-success text-[12px] font-bold text-success-text">✓</span>
                    <span className="flex-1 text-[13.5px] text-foreground">{item.name}</span>
                    <span className="font-mono text-[11px] text-placeholder">{t('dossier.card.approved')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
