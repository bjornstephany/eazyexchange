export function GlobeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="17" stroke="#3FA277" strokeWidth="3" />
      <ellipse cx="24" cy="24" rx="7.5" ry="17" stroke="#3FA277" strokeWidth="2.2" />
      <path d="M7.5 24h33M11 16h26M11 32h26" stroke="#3FA277" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
      <path d="M13 28C20 12 28 12 35 20" stroke="#7CCBA6" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 6.5" />
      <circle cx="13" cy="28" r="4" fill="#3FA277" />
      <circle cx="35" cy="20" r="4" fill="#7CCBA6" />
    </svg>
  )
}
