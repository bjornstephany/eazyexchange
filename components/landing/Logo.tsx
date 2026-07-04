export function Logo({ size = 'nav' }: { size?: 'nav' | 'footer' }) {
  const d = size === 'footer' ? { w: 26, h: 19, c: 15 } : { w: 30, h: 22, c: 18 }
  return (
    <span className="relative inline-block" style={{ width: d.w, height: d.h }} aria-hidden>
      <span className="absolute left-0 top-0 rounded-full bg-[#10203F]" style={{ width: d.c, height: d.c }} />
      <span
        className="absolute bottom-0 right-0 rounded-full bg-[#2456E6]"
        style={{ width: d.c, height: d.c, mixBlendMode: 'multiply' }}
      />
    </span>
  )
}
