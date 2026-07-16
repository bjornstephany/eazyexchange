import type { Locale } from '@/lib/i18n/config'

export type Lang = Locale
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

const baseContent: Record<'fr' | 'en', LandingContent> = {
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

const es: LandingContent = {
  nav: { features: "Funcionalidades", login: "Iniciar sesión", demo: "Empezar gratis" },
  hero: {
    eyebrow: "Para organizadores de intercambios escolares",
    title: "Deja de perseguir los expedientes.",
    sub: "Eazyexchange centraliza las candidaturas, los formularios y los documentos de tus estudiantes — para que cada expediente esté completo, a tiempo, sin recordatorios interminables.",
    ctaPrimary: "Empezar gratis",
    note: "Primer intercambio gratis · sin tarjeta de crédito",
    trust: "Adoptado por organizadores de intercambios en toda Francia.",
    mock: {
      title: "Sesión · Otoño 2026",
      countLabel: "5 estudiantes",
      cols: ["Estudiante", "Candidatura", "Formularios", "Documentos", "Estado"],
      rows,
      statusLabels: { complete: "Completo", pending: "Pendiente", review: "Por revisar", missing: "Falta" },
    },
  },
  features: {
    eyebrow: "Lo que gestionas",
    title: "Todo el expediente del estudiante, en un solo lugar.",
    pillars: [
      { tag: "Candidaturas", title: "Candidaturas", body: "Recoge y haz seguimiento de cada candidatura, desde el primer contacto hasta la selección, sin hojas de cálculo." },
      { tag: "Formularios", title: "Formularios", body: "Formularios en línea que las familias completan bien a la primera, con validación automática." },
      { tag: "Documentos", title: "Documentos", body: "Pasaportes, autorizaciones parentales, visados: solicitados, recibidos, verificados y aprobados sin esfuerzo." },
    ],
  },
  how: {
    eyebrow: "Cómo funciona",
    title: "Cinco pasos, ni un recordatorio olvidado.",
    steps: [
      { n: "01", title: "Envía", body: "Comparte la candidatura mediante un enlace único." },
      { n: "02", title: "Selecciona", body: "Revisa a los candidatos y acepta o rechaza." },
      { n: "03", title: "Prepara", body: "Crea tus solicitudes de documentos y formularios en unos clics." },
      { n: "04", title: "Recoge", body: "Recibe formularios y documentos de los estudiantes aceptados." },
      { n: "05", title: "Aprueba", body: "Verifica y aprueba el expediente completo." },
    ],
    reminder: {
      eyebrow: "Recordatorios automáticos",
      note: "En cada paso, se recuerda automáticamente a los estudiantes — con la lista exacta de lo que falta y plazos claros.",
      sender: "EazyExchange",
      subject: "Te faltan 2 documentos",
      checklist: ["Autorización parental", "Copia del pasaporte"],
      deadline: "Fecha límite: 15 de marzo",
    },
  },
  testimonial: {
    quote: "Antes pasaba las tardes persiguiendo a las familias. Ahora veo de un vistazo qué expedientes están completos.",
    name: "Coordinadora de intercambios",
    org: "Asociación de intercambios escolares",
  },
  cta: {
    title: "¿Listo para simplificar tu próximo intercambio?",
    body: "Tu primer intercambio corre por nuestra cuenta — prueba Eazyexchange en un intercambio completo. Sin tarjeta de crédito, sin compromiso.",
    primary: "Empezar gratis",
  },
  footerTag: "La plataforma para organizadores de intercambios escolares.",
}

const it: LandingContent = {
  nav: { features: "Funzionalità", login: "Accedi", demo: "Inizia gratis" },
  hero: {
    eyebrow: "Per gli organizzatori di scambi scolastici",
    title: "Smetti di rincorrere le pratiche.",
    sub: "Eazyexchange centralizza le candidature, i moduli e i documenti dei tuoi studenti — così ogni pratica è completa, puntuale e senza solleciti infiniti.",
    ctaPrimary: "Inizia gratis",
    note: "Primo scambio offerto · senza carta di credito",
    trust: "Scelto dagli organizzatori di scambi in tutta la Francia.",
    mock: {
      title: "Sessione · Autunno 2026",
      countLabel: "5 studenti",
      cols: ["Studente", "Candidatura", "Moduli", "Documenti", "Stato"],
      rows,
      statusLabels: { complete: "Completo", pending: "In attesa", review: "Da verificare", missing: "Mancante" },
    },
  },
  features: {
    eyebrow: "Ciò che gestisci",
    title: "Tutta la pratica dello studente, in un unico posto.",
    pillars: [
      { tag: "Candidature", title: "Candidature", body: "Raccogli e monitora ogni candidatura, dal primo contatto alla selezione, senza fogli di calcolo." },
      { tag: "Moduli", title: "Moduli", body: "Moduli online che le famiglie compilano correttamente al primo tentativo, con validazione automatica." },
      { tag: "Documenti", title: "Documenti", body: "Passaporti, autorizzazioni dei genitori, visti: richiesti, ricevuti, verificati e approvati senza sforzo." },
    ],
  },
  how: {
    eyebrow: "Come funziona",
    title: "Cinque passaggi, nessun sollecito dimenticato.",
    steps: [
      { n: "01", title: "Invia", body: "Condividi la candidatura tramite un link unico." },
      { n: "02", title: "Seleziona", body: "Esamina i candidati e accetta o rifiuta." },
      { n: "03", title: "Prepara", body: "Crea le tue richieste di documenti e moduli in pochi clic." },
      { n: "04", title: "Raccogli", body: "Ricevi moduli e documenti dagli studenti accettati." },
      { n: "05", title: "Approva", body: "Verifica e approva la pratica completa." },
    ],
    reminder: {
      eyebrow: "Solleciti automatici",
      note: "A ogni passaggio, gli studenti ricevono un sollecito automatico — con l’elenco preciso di ciò che manca e scadenze chiare.",
      sender: "EazyExchange",
      subject: "Ti mancano 2 documenti",
      checklist: ["Autorizzazione dei genitori", "Copia del passaporto"],
      deadline: "Scadenza: 15 marzo",
    },
  },
  testimonial: {
    quote: "Prima passavo le serate a sollecitare le famiglie. Oggi vedo a colpo d’occhio quali pratiche sono complete.",
    name: "Coordinatrice degli scambi",
    org: "Associazione di scambi scolastici",
  },
  cta: {
    title: "Pronto a semplificare il tuo prossimo scambio?",
    body: "Il tuo primo scambio è offerto — prova Eazyexchange su uno scambio completo. Senza carta di credito, senza impegno.",
    primary: "Inizia gratis",
  },
  footerTag: "La piattaforma per gli organizzatori di scambi scolastici.",
}

const de: LandingContent = {
  nav: { features: "Funktionen", login: "Anmelden", demo: "Kostenlos starten" },
  hero: {
    eyebrow: "Für Organisatoren von Schüleraustauschen",
    title: "Schluss mit dem Hinterherlaufen nach Unterlagen.",
    sub: "Eazyexchange bündelt die Bewerbungen, Formulare und Dokumente Ihrer Schülerinnen und Schüler — damit jede Akte vollständig und pünktlich ist, ohne endloses Nachhaken.",
    ctaPrimary: "Kostenlos starten",
    note: "Erster Austausch gratis · keine Kreditkarte",
    trust: "Genutzt von Austauschorganisatoren in ganz Frankreich.",
    mock: {
      title: "Session · Herbst 2026",
      countLabel: "5 Schüler",
      cols: ["Schüler", "Bewerbung", "Formulare", "Dokumente", "Status"],
      rows,
      statusLabels: { complete: "Vollständig", pending: "Ausstehend", review: "Zu prüfen", missing: "Fehlt" },
    },
  },
  features: {
    eyebrow: "Was Sie verwalten",
    title: "Die gesamte Schülerakte, an einem Ort.",
    pillars: [
      { tag: "Bewerbungen", title: "Bewerbungen", body: "Erfassen und verfolgen Sie jede Bewerbung, vom ersten Kontakt bis zur Auswahl, ohne Tabellen." },
      { tag: "Formulare", title: "Formulare", body: "Online-Formulare, die Familien gleich beim ersten Mal korrekt ausfüllen, mit automatischer Prüfung." },
      { tag: "Dokumente", title: "Dokumente", body: "Reisepässe, Einverständniserklärungen der Eltern, Visa: angefordert, erhalten, geprüft und mühelos freigegeben." },
    ],
  },
  how: {
    eyebrow: "So funktioniert’s",
    title: "Fünf Schritte, kein vergessenes Nachhaken.",
    steps: [
      { n: "01", title: "Senden", body: "Teilen Sie die Bewerbung über einen einzigartigen Link." },
      { n: "02", title: "Prüfen", body: "Prüfen Sie die Bewerber und nehmen Sie an oder lehnen Sie ab." },
      { n: "03", title: "Vorbereiten", body: "Erstellen Sie Ihre Dokument- und Formularanfragen mit wenigen Klicks." },
      { n: "04", title: "Einsammeln", body: "Erhalten Sie Formulare und Dokumente der angenommenen Schüler." },
      { n: "05", title: "Freigeben", body: "Prüfen und geben Sie die vollständige Akte frei." },
    ],
    reminder: {
      eyebrow: "Automatische Erinnerungen",
      note: "Bei jedem Schritt werden die Schüler automatisch erinnert — mit der genauen Liste des Fehlenden und klaren Fristen.",
      sender: "EazyExchange",
      subject: "Dir fehlen 2 Dokumente",
      checklist: ["Einverständniserklärung der Eltern", "Kopie des Reisepasses"],
      deadline: "Frist: 15. März",
    },
  },
  testimonial: {
    quote: "Früher verbrachte ich meine Abende damit, Familien zu erinnern. Heute sehe ich auf einen Blick, welche Akten vollständig sind.",
    name: "Austauschkoordinatorin",
    org: "Verein für Schüleraustausch",
  },
  cta: {
    title: "Bereit, Ihren nächsten Austausch zu vereinfachen?",
    body: "Ihr erster Austausch geht auf uns — testen Sie Eazyexchange bei einem kompletten Austausch. Keine Kreditkarte, keine Verpflichtung.",
    primary: "Kostenlos starten",
  },
  footerTag: "Die Plattform für Organisatoren von Schüleraustauschen.",
}

export const landingContent: Record<Locale, LandingContent> = {
  fr: baseContent.fr,
  en: baseContent.en,
  es,
  it,
  de,
}
