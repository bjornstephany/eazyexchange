import Link from 'next/link'
import type { LandingContent } from '@/lib/landing/content'

export function CtaBand({ closing }: { closing: LandingContent['closing'] }) {
  return (
    <section className="bg-[#0E1B38]">
      <div className="mx-auto max-w-[1160px] px-6 pb-[30px] pt-[76px] text-center">
        <h2 className="mb-6 text-balance font-display text-[length:clamp(30px,4vw,46px)] font-extrabold leading-[1.08] tracking-[-.025em] text-white">
          {closing.title}
        </h2>
        <Link
          href="/signup"
          className="inline-flex items-center rounded-[11px] bg-[#2456E6] px-7 py-4 text-[16.5px] font-semibold text-white transition hover:bg-[#3B6EF6]"
        >
          {closing.cta}
        </Link>
        <p className="mt-4 font-mono text-[12px] font-medium text-[#7FA0F0]">{closing.note}</p>
      </div>
    </section>
  )
}
