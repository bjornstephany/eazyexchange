export type Lang = 'fr' | 'en'
export type MockStatus = 'complete' | 'pending' | 'review' | 'missing'

export interface MockRow {
  name: string
  app: MockStatus
  forms: MockStatus
  docs: MockStatus
  status: MockStatus
}

export interface LandingContent {
  nav: { features: string; login: string; demo: string }
  hero: {
    eyebrow: string
    title: string
    sub: string
    ctaPrimary: string
    note: string
    trust: string
    mock: {
      title: string
      countLabel: string
      cols: string[]
      rows: MockRow[]
      statusLabels: Record<MockStatus, string>
    }
  }
  features: { eyebrow: string; title: string; pillars: { tag: string; title: string; body: string }[] }
  how: {
    eyebrow: string
    title: string
    steps: { n: string; title: string; body: string }[]
    reminder: {
      eyebrow: string
      note: string
      sender: string
      subject: string
      checklist: string[]
      deadline: string
    }
  }
  testimonial: { quote: string; name: string; org: string }
  cta: { title: string; body: string; primary: string }
  footerTag: string
}

const rows: MockRow[] = [
  { name: "Camille Laurent", app: "complete", forms: "complete", docs: "complete", status: "complete" },
  { name: "Yanis Benali", app: "complete", forms: "pending", docs: "missing", status: "pending" },
  { name: "Léa Moreau", app: "complete", forms: "complete", docs: "review", status: "review" },
  { name: "Tom Rousseau", app: "complete", forms: "missing", docs: "missing", status: "missing" },
  { name: "Inès Garcia", app: "complete", forms: "complete", docs: "complete", status: "complete" },
]

export const landingContent: Record<Lang, LandingContent> = {
  fr: {
    nav: { features: "Fonctionnalités", login: "Connexion", demo: "Démarrer gratuitement" },
    hero: {
      eyebrow: "Pour les organisateurs d’échanges scolaires",
      title: "Arrêtez de courir après les dossiers.",
      sub: "Eazyexchange centralise les candidatures, les formulaires et les documents de vos lycéens — pour que chaque dossier soit complet, à temps, sans relances sans fin.",
      ctaPrimary: "Démarrer gratuitement",
      note: "Premier échange offert · sans carte bancaire",
      trust: "Adopté par les organisateurs d’échanges partout en France.",
      mock: {
        title: "Session · Automne 2026",
        countLabel: "5 élèves",
        cols: ["Élève", "Candidature", "Formulaires", "Documents", "Statut"],
        rows,
        statusLabels: { complete: "Complet", pending: "En attente", review: "À vérifier", missing: "Manquant" },
      },
    },
    features: {
      eyebrow: "Ce que vous gérez",
      title: "Tout le dossier de l’élève, au même endroit.",
      pillars: [
        { tag: "Candidatures", title: "Candidatures", body: "Collectez et suivez chaque candidature du premier contact à la sélection, sans tableur." },
        { tag: "Formulaires", title: "Formulaires", body: "Des formulaires en ligne que les familles remplissent correctement du premier coup, avec validation automatique." },
        { tag: "Documents", title: "Documents", body: "Passeports, autorisations parentales, visas : demandés, reçus, vérifiés et validés sans effort." },
      ],
    },
    how: {
      eyebrow: "Comment ça marche",
      title: "Cinq étapes, aucune relance oubliée.",
      steps: [
        { n: "01", title: "Envoyez", body: "Diffusez la candidature via un lien unique." },
        { n: "02", title: "Sélectionnez", body: "Étudiez les candidats et acceptez ou refusez." },
        { n: "03", title: "Préparez", body: "Créez vos demandes de documents et formulaires en quelques clics." },
        { n: "04", title: "Collectez", body: "Recevez formulaires et documents des élèves acceptés." },
        { n: "05", title: "Validez", body: "Vérifiez et validez le dossier complet." },
      ],
      reminder: {
        eyebrow: "Relances automatiques",
        note: "À chaque étape, les élèves sont relancés automatiquement — avec la liste précise de ce qui manque et des échéances claires.",
        sender: "EazyExchange",
        subject: "Il te manque 2 documents",
        checklist: ["Autorisation parentale", "Copie du passeport"],
        deadline: "Échéance : 15 mars",
      },
    },
    testimonial: {
      quote: "Avant, je passais mes soirées à relancer les familles. Aujourd’hui, je vois d’un coup d’œil quels dossiers sont complets.",
      name: "Coordinatrice d’échanges",
      org: "Association d’échanges scolaires",
    },
    cta: {
      title: "Prêt à simplifier votre prochain échange ?",
      body: "Votre premier échange est offert — testez Eazyexchange sur un échange complet. Sans carte bancaire, sans engagement.",
      primary: "Démarrer gratuitement",
    },
    footerTag: "La plateforme des organisateurs d’échanges scolaires.",
  },
  en: {
    nav: { features: "Features", login: "Log in", demo: "Start free" },
    hero: {
      eyebrow: "For school exchange program organizers",
      title: "Stop chasing down student files.",
      sub: "Eazyexchange centralizes your students’ applications, forms, and documents — so every file is complete, on time, without endless follow-ups.",
      ctaPrimary: "Start free",
      note: "First exchange free · no credit card",
      trust: "Trusted by exchange organizers across France.",
      mock: {
        title: "Session · Fall 2026",
        countLabel: "5 students",
        cols: ["Student", "Application", "Forms", "Documents", "Status"],
        rows,
        statusLabels: { complete: "Complete", pending: "Pending", review: "Review", missing: "Missing" },
      },
    },
    features: {
      eyebrow: "What you manage",
      title: "The entire student file, in one place.",
      pillars: [
        { tag: "Applications", title: "Applications", body: "Collect and track every application from first contact to selection — no spreadsheet." },
        { tag: "Forms", title: "Forms", body: "Online forms families fill out correctly the first time, with automatic validation." },
        { tag: "Documents", title: "Documents", body: "Passports, parental consent, visas: requested, received, checked, and approved effortlessly." },
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "Five steps, no follow-up forgotten.",
      steps: [
        { n: "01", title: "Send", body: "Share the application via a unique link." },
        { n: "02", title: "Review", body: "Review applicants and accept or decline." },
        { n: "03", title: "Prepare", body: "Create your document and form requests in a few clicks." },
        { n: "04", title: "Collect", body: "Receive forms and documents from accepted students." },
        { n: "05", title: "Approve", body: "Check and approve the completed file." },
      ],
      reminder: {
        eyebrow: "Automatic reminders",
        note: "At every step, students are reminded automatically — with the exact list of what’s missing and clear deadlines.",
        sender: "EazyExchange",
        subject: "You’re missing 2 documents",
        checklist: ["Parental authorization", "Passport copy"],
        deadline: "Deadline: March 15",
      },
    },
    testimonial: {
      quote: "I used to spend my evenings chasing families. Now I can see at a glance which files are complete.",
      name: "Exchange Coordinator",
      org: "School exchange association",
    },
    cta: {
      title: "Ready to simplify your next exchange?",
      body: "Your first exchange is on us — try Eazyexchange across a full exchange. No credit card, no commitment.",
      primary: "Start free",
    },
    footerTag: "The platform for school exchange organizers.",
  },
}
