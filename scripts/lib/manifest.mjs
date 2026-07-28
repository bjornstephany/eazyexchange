// The contract between the seed and everything that wants to log in as one of
// its accounts. Written to .seed-manifest.json (gitignored) so the /dev page can
// list accounts without querying the database — which keeps it clear of the
// service-role client and the admin import allowlist entirely.
//
// The two organizer display names are copied from the createAuthUser calls in
// seed-demo.mjs. If those change, this follows them.

export function buildManifest({ password, domain, school, exchange, students, highlights, labels }) {
  const highlighted = new Set(highlights)
  const at = (slug) => `${slug}@${domain}`

  return {
    version: 1,
    password,
    school,
    exchange,
    accounts: [
      { email: at('orga'), name: 'Claire Organisatrice', role: 'organizer', note: 'owner', highlight: true },
      { email: at('orga-2'), name: 'Marc Collaborateur', role: 'organizer', note: 'admin', highlight: false },
      ...students.map((s) => ({
        email: at(s.slug),
        name: s.name,
        role: 'student',
        note: labels[s.shape] ?? s.shape,
        highlight: highlighted.has(s.slug),
      })),
    ],
  }
}
