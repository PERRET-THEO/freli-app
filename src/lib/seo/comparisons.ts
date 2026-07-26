export type ComparisonSlug = 'content-snare' | 'clustdoc' | 'emails-forms-docusign'

export type ComparisonPage = {
  slug: ComparisonSlug
  path: string
  title: string
  metaTitle: string
  metaDescription: string
  competitorName: string
  intro: string
  rows: { criterion: string; freli: string; other: string }[]
  verdict: string
}

export const comparisonPages: ComparisonPage[] = [
  {
    slug: 'content-snare',
    path: '/vs/content-snare',
    title: 'Freli vs Content Snare',
    metaTitle: 'Freli vs Content Snare — onboarding client pour freelances',
    metaDescription:
      'Comparez Freli et Content Snare : portail sans compte, signature électronique, paiement Stripe et autofill SIREN pour les freelances et agences françaises.',
    competitorName: 'Content Snare',
    intro:
      'Content Snare excelle à collecter documents et réponses. Freli va plus loin pour les freelances et agences FR : signature, paiement et Drive dans le même lien.',
    rows: [
      {
        criterion: 'Portail client sans compte',
        freli: 'Oui (magic link)',
        other: 'Oui',
      },
      {
        criterion: 'Signature électronique native',
        freli: 'Oui',
        other: 'Non (outil externe)',
      },
      {
        criterion: 'Paiement dans le parcours',
        freli: 'Oui (Stripe Connect)',
        other: 'Non',
      },
      {
        criterion: 'Approve / reject des pièces',
        freli: 'Oui',
        other: 'Oui (cœur produit)',
      },
      {
        criterion: 'Autofill entreprise FR (SIREN)',
        freli: 'Oui (data.gouv)',
        other: 'Non',
      },
      {
        criterion: 'Sync Google Drive',
        freli: 'Native',
        other: 'Export / automatisations',
      },
    ],
    verdict:
      'Choisissez Content Snare si votre seul besoin est la collecte documentaire intensive. Choisissez Freli si vous voulez clôturer l’onboarding (signé + payé + classé) sans empiler DocuSign et Stripe.',
  },
  {
    slug: 'clustdoc',
    path: '/vs/clustdoc',
    title: 'Freli vs Clustdoc',
    metaTitle: 'Freli vs Clustdoc — intake client léger pour freelances',
    metaDescription:
      'Freli vs Clustdoc : comparez un onboarding client léger FR (portail, e-sign, Stripe, SIREN) à une plateforme d’intake plus lourde et souvent tarifée entreprise.',
    competitorName: 'Clustdoc',
    intro:
      'Clustdoc cible des parcours d’intake structurés, parfois réglementés. Freli reste volontairement léger : démarrer une mission en 2 minutes, sans formation.',
    rows: [
      {
        criterion: 'Temps de mise en route',
        freli: '~5 minutes',
        other: 'Jours selon la complexité',
      },
      {
        criterion: 'Cible principale',
        freli: 'Freelances & petites agences FR',
        other: 'Équipes / secteurs régulés',
      },
      {
        criterion: 'E-sign + paiement natifs',
        freli: 'Oui',
        other: 'Oui',
      },
      {
        criterion: 'KYC / conformité avancée',
        freli: 'Hors scope',
        other: 'Oui (force Clustdoc)',
      },
      {
        criterion: 'Autofill SIREN / data.gouv',
        freli: 'Oui',
        other: 'Non natif',
      },
      {
        criterion: 'Positionnement prix',
        freli: 'Solo / Agence, pensé freelance',
        other: 'Souvent 100–190 $/mois+',
      },
    ],
    verdict:
      'Clustdoc si vous avez besoin de conformité lourde multi-parties. Freli si vous voulez un portail d’onboarding simple, français, et branché sur vos outils (Stripe, Drive, webhooks).',
  },
  {
    slug: 'emails-forms-docusign',
    path: '/vs/emails-forms-docusign',
    title: 'Freli vs emails + Forms + DocuSign',
    metaTitle: 'Freli vs emails, Google Forms et DocuSign',
    metaDescription:
      'Remplacez la stack manuelle emails + Google Forms + DocuSign + Stripe par un seul lien Freli : collecte, signature, paiement et relances automatiques.',
    competitorName: 'Stack manuelle',
    intro:
      'La plupart des freelances onboardent encore avec une mosaïque d’outils. Freli regroupe le parcours dans un seul lien brandé.',
    rows: [
      {
        criterion: 'Nombre d’outils',
        freli: '1 portail',
        other: '3 à 5 (mail, Forms, DocuSign, Stripe, Drive)',
      },
      {
        criterion: 'Relances',
        freli: 'Automatiques',
        other: 'Manuelles',
      },
      {
        criterion: 'Expérience client',
        freli: 'Un lien, sans compte',
        other: 'Plusieurs onglets et comptes',
      },
      {
        criterion: 'Temps moyen estimé',
        freli: '~4 minutes côté freelance',
        other: '~3 h par client',
      },
      {
        criterion: 'Preuves de signature',
        freli: 'Intégrées (horodatage, hash)',
        other: 'Chez DocuSign uniquement',
      },
      {
        criterion: 'Données entreprise FR',
        freli: 'Préremplies via SIREN',
        other: 'Saisie manuelle',
      },
    ],
    verdict:
      'Gardez votre stack si vous n’onboardez qu’un client par trimestre. Passez à Freli dès que les relances et les allers-retours deviennent un coût caché récurrent.',
  },
]

export function getComparisonBySlug(slug: string): ComparisonPage | undefined {
  return comparisonPages.find((page) => page.slug === slug)
}
