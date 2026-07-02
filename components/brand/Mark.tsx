export function Mark({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark'
  className?: string
}) {
  const top = variant === 'dark' ? '#FFFFFF' : '#10203F'
  const bottom = variant === 'dark' ? '#3B6EF6' : '#2456E6'
  return (
    <svg
      viewBox="0 0 26 19"
      className={className}
      aria-hidden="true"
      style={{ isolation: 'isolate' }}
    >
      <circle cx="7.5" cy="7.5" r="7.5" fill={top} />
      <circle
        cx="18.5"
        cy="11.5"
        r="7.5"
        fill={bottom}
        style={variant === 'light' ? { mixBlendMode: 'multiply' } : undefined}
      />
    </svg>
  )
}
