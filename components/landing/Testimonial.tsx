import type { LandingContent } from '@/lib/landing/content'

export function Testimonial({ testimonial }: { testimonial: LandingContent['testimonial'] }) {
  return (
    <section className="border-y border-[#EEF1F7] bg-[#F5F7FC]">
      <div className="mx-auto max-w-[1180px] px-6 py-16 text-center sm:px-10">
        <p className="mx-auto mb-6 max-w-[760px] font-display text-[27px] font-medium leading-[1.45] tracking-[-.01em] text-[#10203F]">
          &ldquo;{testimonial.quote}&rdquo;
        </p>
        <div className="inline-flex items-center gap-3">
          <span className="h-10 w-10 rounded-full bg-[linear-gradient(135deg,#2456E6,#10203F)]" aria-hidden />
          <div className="text-left">
            <p className="text-[14px] font-semibold text-[#10203F]">{testimonial.name}</p>
            <p className="text-[13px] text-[#8A97B2]">{testimonial.org}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
