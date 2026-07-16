const SIZES = {
  nav: { w: 30, h: 22, c: 18 },
  sweep: { w: 34, h: 25, c: 21 },
  footer: { w: 26, h: 19, c: 15 },
} as const

export function Logo({
  size = 'nav',
  variant = 'default',
}: {
  size?: keyof typeof SIZES
  variant?: 'default' | 'inverse'
}) {
  const d = SIZES[size]
  const inverse = variant === 'inverse'
  return (
    <span className="relative inline-block" style={{ width: d.w, height: d.h }} aria-hidden>
      <span
        className={`absolute left-0 top-0 rounded-full ${inverse ? 'bg-white' : 'bg-[#10203F]'}`}
        style={{ width: d.c, height: d.c }}
      />
      <span
        className={`absolute bottom-0 right-0 rounded-full ${inverse ? 'bg-[#4D79F0]' : 'bg-[#2456E6]'}`}
        style={{ width: d.c, height: d.c, mixBlendMode: inverse ? undefined : 'multiply' }}
      />
    </span>
  )
}
