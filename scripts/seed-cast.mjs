// The cast the demo seed builds. Pure data, no side effects — `seed-demo.mjs`
// executes on import, so anything that wants to inspect the world without
// building it (tests, the /dev page's expectations) reads this instead.

// Forms the exchange asks for. Deadlines are spread on purpose: one already
// past (so "overdue" is reachable), one in three days (so the final-week
// reminder pacing is reachable), the rest comfortably ahead.
export const TEMPLATES = [
  { key: 'medical', name: 'Autorisation médicale', kind: 'fillable', deadline: 14 },
  { key: 'decharge', name: 'Décharge de responsabilité', kind: 'fillable', deadline: 14 },
  { key: 'absence', name: "Demande d'absence", kind: 'fillable', deadline: 3 },
  { key: 'famille', name: "Engagement de famille d'accueil", kind: 'fillable', deadline: 21 },
  { key: 'passeport', name: 'Copie du passeport', kind: 'pdf', deadline: -4 },
  { key: 'esta', name: 'Autorisation ESTA', kind: 'pdf', deadline: 30 },
]

// Which submission status each shape gives the Nth form, in TEMPLATES order.
// `null` = the student never opened it, so no submission row exists at all —
// which is also what makes the past-deadline form (index 4) read as overdue.
export const SHAPES = {
  untouched: [null, null, null, null, null, null],
  'all-approved': ['approved', 'approved', 'approved', 'approved', 'approved', 'approved'],
  'all-submitted': ['submitted', 'submitted', 'submitted', 'submitted', 'submitted', 'submitted'],
  mixed: ['approved', 'submitted', 'draft', null, 'approved', null],
  'one-rejected': ['approved', 'rejected', 'submitted', 'approved', null, null],
  'half-done': ['approved', 'approved', 'draft', null, null, null],
  overdue: [null, null, null, null, null, 'draft'],
  // Opened the first form once and stopped — what the reminder pacing targets.
  'just-started': ['draft', null, null, null, null, null],
  // Five approved, the sixth never opened. The organizer's most common real
  // state: chasing one last document. No other shape produces it.
  'one-missing': ['approved', 'approved', 'approved', 'approved', 'approved', null],
  // Real progress everywhere except the form whose deadline has passed.
  'overdue-partial': ['approved', 'submitted', null, null, null, 'draft'],
}

// Enrolled students, each pinned to one completion shape so every state the
// organizer dashboard can render is on screen at once.
//
// Two names are deliberate layout landmines: eleve-13 is long enough to overflow
// a table cell or a sidebar, and eleve-14 carries accents. Encoding and
// truncation bugs should surface here, not from a real family's name.
export const STUDENTS = [
  { slug: 'eleve-01', name: 'Camille Bernard', shape: 'untouched' },
  { slug: 'eleve-02', name: 'Louis Moreau', shape: 'untouched' },
  { slug: 'eleve-03', name: 'Emma Petit', shape: 'all-approved' },
  { slug: 'eleve-04', name: 'Hugo Lefebvre', shape: 'all-submitted' },
  { slug: 'eleve-05', name: 'Léa Roux', shape: 'mixed' },
  { slug: 'eleve-06', name: 'Gabriel Fournier', shape: 'mixed' },
  { slug: 'eleve-07', name: 'Chloé Girard', shape: 'one-rejected' },
  { slug: 'eleve-08', name: 'Raphaël Bonnet', shape: 'half-done' },
  { slug: 'eleve-09', name: 'Alice Dupont', shape: 'half-done' },
  { slug: 'eleve-10', name: 'Noah Lambert', shape: 'overdue' },
  { slug: 'eleve-11', name: 'Jade Mercier', shape: 'overdue' },
  { slug: 'eleve-12', name: 'Arthur Vincent', shape: 'all-approved' },
  { slug: 'eleve-13', name: 'Marie-Ambre de La Rochefoucauld-Montmorency', shape: 'just-started' },
  { slug: 'eleve-14', name: 'Loïc Nguyên-Öztürk', shape: 'all-submitted' },
  { slug: 'eleve-15', name: 'Sarah Benali', shape: 'one-missing' },
  { slug: 'eleve-16', name: 'Tom Rousseau', shape: 'overdue-partial' },
  { slug: 'eleve-17', name: 'Anaïs Leclerc', shape: 'overdue-partial' },
  { slug: 'eleve-18', name: 'Yanis Barbier', shape: 'just-started' },
  { slug: 'eleve-19', name: 'Clara Renaud', shape: 'one-missing' },
  { slug: 'eleve-20', name: 'Malo Guérin', shape: 'one-rejected' },
]

// Surfaced first on /dev — one student per interesting extreme, so the common
// cases are one click away without scrolling the roster.
export const HIGHLIGHTS = ['eleve-01', 'eleve-05', 'eleve-10', 'eleve-15']

// Applicants who have NOT been enrolled — the funnel side of the app.
export const APPLICANTS = [
  { slug: 'cand-invite', name: 'Sacha Blanc', status: 'invited' },
  { slug: 'cand-draft-1', name: 'Manon Faure', status: 'draft' },
  { slug: 'cand-draft-2', name: 'Théo Garnier', status: 'draft' },
  { slug: 'cand-soumis-1', name: 'Inès Chevalier', status: 'submitted' },
  { slug: 'cand-soumis-2', name: 'Nathan Robin', status: 'submitted' },
  { slug: 'cand-soumis-3', name: 'Lina Marchand', status: 'submitted' },
  { slug: 'cand-refuse', name: 'Enzo Perrin', status: 'rejected' },
  { slug: 'cand-accepte', name: 'Zoé Dumont', status: 'accepted' },
  { slug: 'cand-decline', name: 'Adam Leroy', status: 'declined' },
]

// One short French label per shape — used by the /dev roster and the seed's
// closing report so the two never drift.
export const SHAPE_LABELS = {
  untouched: 'rien commencé',
  'all-approved': 'tout validé',
  'all-submitted': 'tout soumis, rien relu',
  mixed: 'états mélangés',
  'one-rejected': 'un formulaire refusé',
  'half-done': 'à moitié fait',
  overdue: 'en retard',
  'just-started': 'un brouillon commencé',
  'one-missing': 'il manque un formulaire',
  'overdue-partial': 'en retard, mais avancé',
}
