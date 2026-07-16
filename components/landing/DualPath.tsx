import Link from 'next/link'
import type { LandingContent } from '@/lib/landing/content'

// Not wired to a booking tool yet (handoff: « à brancher — calendly / contact »).
const EXPERT_CONTACT_HREF = 'mailto:contact@eazyexchange.com'

export function DualPath({ paths }: { paths: LandingContent['paths'] }) {
  return (
    <section id="demarrer" className="mx-auto max-w-[1160px] px-6 pb-[76px] pt-[72px]">
      <h2 className="mb-2 text-balance font-display text-[length:clamp(26px,3vw,34px)] font-bold leading-[1.12] tracking-[-.02em] text-[#10203F]">
        {paths.title}
      </h2>
      <p className="mb-[30px] text-[15.5px] leading-[1.6] text-[#5B6B8C]">{paths.intro}</p>
      <div className="flex flex-wrap gap-[22px]">
        <div className="flex min-w-[290px] flex-[1.2] flex-col items-start gap-3 rounded-2xl border-2 border-[#2456E6] bg-white px-[30px] py-7">
          <span className="inline-flex rounded-full bg-[#E6ECFD] px-[11px] py-1 font-mono text-[11px] font-semibold text-[#1D48C7]">
            {paths.trial.badge}
          </span>
          <p className="font-display text-[22px] font-bold tracking-[-.015em] text-[#10203F]">{paths.trial.title}</p>
          <p className="text-[14.5px] leading-[1.55] text-[#5B6B8C]">{paths.trial.body}</p>
          <Link
            href="/signup"
            className="mt-1.5 inline-flex items-center rounded-[11px] bg-[#2456E6] px-6 py-3.5 text-[15.5px] font-semibold text-white transition hover:bg-[#1D48C7]"
          >
            {paths.trial.cta}
          </Link>
        </div>
        <div className="flex min-w-[270px] flex-1 flex-col items-start gap-3 rounded-2xl border border-[#E4E9F2] bg-[#FBFCFE] px-[30px] py-7">
          <span className="inline-flex rounded-full bg-[#EEF1F7] px-[11px] py-1 font-mono text-[11px] font-semibold text-[#5B6B8C]">
            {paths.expert.badge}
          </span>
          <p className="font-display text-[22px] font-bold tracking-[-.015em] text-[#10203F]">{paths.expert.title}</p>
          <p className="text-[14.5px] leading-[1.55] text-[#5B6B8C]">{paths.expert.body}</p>
          <a
            href={EXPERT_CONTACT_HREF}
            className="mt-1.5 inline-flex items-center rounded-[11px] border border-[#D6DCEA] bg-white px-[22px] py-[13px] text-[14.5px] font-semibold text-[#10203F] transition hover:border-[#8A97B2]"
          >
            {paths.expert.cta}
          </a>
        </div>
      </div>
    </section>
  )
}
