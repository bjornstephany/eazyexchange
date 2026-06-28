import { landingContent } from '@/lib/landing/content'

export function ProblemSolution() {
  const { problemTitle, problemBody, solutionTitle, solutionBody } =
    landingContent.problemSolution
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{problemTitle}</h2>
          <p className="mt-4 text-muted-foreground">{problemBody}</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{solutionTitle}</h2>
          <p className="mt-4 text-muted-foreground">{solutionBody}</p>
        </div>
      </div>
    </section>
  )
}
