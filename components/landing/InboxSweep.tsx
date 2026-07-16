import type { LandingContent } from '@/lib/landing/content'
import { Logo } from './Logo'
import { StatusPill, TONE } from './tones'

// Avatar chip colors per email row (presentation only, same in every locale).
const AVATAR_TONES = ['warn', 'info', 'ok'] as const
const DRIFT_DELAYS = ['0s', '1.1s', '2.2s']
const PULSE_DELAYS = ['.4s', '1.3s', '2.2s', '3.1s']

export function InboxSweep({ sweep }: { sweep: LandingContent['sweep'] }) {
  return (
    <section className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-[26px] px-6 pb-[26px] pt-12">
      <div className="flex min-w-[280px] flex-[1.2] flex-col gap-[9px]">
        <p className="mb-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#9AA6C0]">
          {sweep.beforeLabel}
        </p>
        <div className="overflow-hidden rounded-xl border border-[#E4E9F2] bg-white shadow-[0_14px_30px_-22px_rgba(16,32,63,.35)]">
          <div className="flex items-center gap-2 border-b border-[#EEF1F7] bg-[#FBFCFE] px-3.5 py-[9px]">
            <span className="text-[12px] font-semibold text-[#42506E]">{sweep.inboxTitle}</span>
            <span className="inline-flex rounded-full bg-[#FBE7E4] px-[7px] py-px font-mono text-[10px] font-semibold text-[#C0392B]">
              {sweep.unread}
            </span>
          </div>
          {sweep.emails.map((email, i) => {
            const avatar = TONE[AVATAR_TONES[i] ?? 'mut']
            return (
              <div
                key={email.sender}
                className={`flex items-center gap-[11px] px-3.5 py-2.5 motion-safe:animate-[ezDrift_7s_ease-in-out_infinite] ${
                  i < sweep.emails.length - 1 ? 'border-b border-[#F4F6FB]' : ''
                }`}
                style={{ animationDelay: DRIFT_DELAYS[i] }}
              >
                <span
                  className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ background: avatar.bg, color: avatar.fg }}
                >
                  {email.initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="flex justify-between gap-2">
                    <span className="text-[12.5px] font-bold text-[#10203F]">{email.sender}</span>
                    <span className="flex-none text-[11px] text-[#9AA6C0]">{email.time}</span>
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-[#10203F]">
                    {email.subject}
                  </span>
                  {email.attachment ? (
                    <span className="inline-flex max-w-full items-center gap-[5px] self-start overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[#E4E9F2] px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#5B6B8C]">
                      <span
                        aria-hidden
                        className="h-[9px] w-[7px] flex-none rounded-[1.5px] border-[1.3px] border-[#9AA6C0]"
                      />
                      {email.attachment}
                    </span>
                  ) : (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[#8A97B2]">
                      {email.preview}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-none items-center gap-3.5">
        <Logo size="sweep" />
        <span aria-hidden className="font-display text-[20px] font-semibold text-[#C4CCDC]">
          →
        </span>
      </div>
      <div className="flex min-w-[250px] flex-1 flex-col gap-[9px]">
        <p className="mb-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#9AA6C0]">
          {sweep.afterLabel}
        </p>
        {sweep.results.map((r, i) => (
          <div
            key={r.label}
            className="flex items-center gap-2.5 motion-safe:animate-[ezPulse_7s_ease-in-out_infinite]"
            style={{ animationDelay: PULSE_DELAYS[i] }}
          >
            <span className="w-[150px] text-[13px] font-medium text-[#42506E]">{r.label}</span>
            <StatusPill pill={r.pill} size="md" />
          </div>
        ))}
      </div>
    </section>
  )
}
