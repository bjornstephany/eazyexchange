import Link from 'next/link'
import type { LandingContent } from '@/lib/landing/content'

export function CtaBand({ cta }: { cta: LandingContent['cta'] }) {
  return (
    <section className="bg-[#10203F]">
      <div className="mx-auto max-w-[1180px] px-6 py-20 text-center sm:px-10">
        <h2 className="mb-3.5 font-display text-[38px] font-bold leading-[1.1] tracking-[-.02em] text-white">
          {cta.title}
        </h2>
        <p className="mx-auto mb-[30px] max-w-[520px] text-[17px] leading-[1.6] text-[#9FB0D6]">{cta.body}</p>
        <Link
          href="/signup"
          className="inline-block rounded-[9px] bg-[#2456E6] px-8 py-4 text-[16px] font-semibold text-white transition hover:brightness-110"
        >
          {cta.primary}
        </Link>
      </div>
    </section>
  )
}
