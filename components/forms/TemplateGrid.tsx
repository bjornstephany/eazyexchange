// Responsive grid for the portrait template cards: 4 columns wide desktop,
// 3 laptop, 2 tablet, 1 at 375px (spec).
export function TemplateGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  )
}
