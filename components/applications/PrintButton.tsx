'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm text-muted-foreground hover:text-navy"
    >
      ⎙ Imprimer la candidature
    </button>
  )
}
