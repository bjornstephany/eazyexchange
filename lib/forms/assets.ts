// PDFs that ship with the app because they are national forms, identical for
// every school. Read server-side with fs (deliberately NOT public/, which
// would expose them as static routes for no reason) and uploaded into the
// school's own form-templates path on add, so there is one storage read path
// and one RLS story for every template PDF.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// standard_key → repo-relative path.
export const BUNDLED_PDF_PATHS: Record<string, string> = {
  ast: 'lib/forms/assets/ast-cerfa-15646.pdf',
}

export async function readBundledPdf(standardKey: string): Promise<Buffer | null> {
  if (!Object.hasOwn(BUNDLED_PDF_PATHS, standardKey)) return null
  return readFile(path.join(process.cwd(), BUNDLED_PDF_PATHS[standardKey]))
}
