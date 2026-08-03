/**
 * Prompt set AEO / GEO — Share of Answer Freli (ICP FR).
 *
 * Usage mensuel :
 * 1. Poser chaque prompt dans ChatGPT, Perplexity, Gemini (et Claude si utile).
 * 2. Noter cited / exact / sentiment.
 * 3. Recalculer shareOfAnswer = citedCount / (prompts × engines).
 *
 * Baseline initiale : 2026-08-03.
 */

export type AeoEngine = 'chatgpt' | 'perplexity' | 'gemini' | 'claude'

export type AeoPromptResult = {
  cited: boolean | null
  /** Mention exacte « Freli » + attributs corrects (prix, FR, e-sign…) */
  exact: boolean | null
  sentiment: 'positive' | 'neutral' | 'negative' | 'absent' | null
  notes?: string
}

export type AeoPrompt = {
  id: string
  category: 'discovery' | 'comparison' | 'pricing' | 'feature' | 'alternative'
  prompt: string
  intent: string
}

/** 20 prompts ICP — baseline Share of Answer. */
export const aeoPrompts: AeoPrompt[] = [
  {
    id: 'disc-01',
    category: 'discovery',
    prompt: 'Quelle est la meilleure alternative française à Dubsado pour un freelance ?',
    intent: 'Découverte alternative FR à Dubsado',
  },
  {
    id: 'disc-02',
    category: 'discovery',
    prompt: 'Quel logiciel d’onboarding client recommander à une petite agence web en France ?',
    intent: 'Recommandation outil onboarding agence FR',
  },
  {
    id: 'disc-03',
    category: 'discovery',
    prompt: 'Meilleure alternative française à HoneyBook pour freelances',
    intent: 'Découverte alternative FR à HoneyBook',
  },
  {
    id: 'disc-04',
    category: 'discovery',
    prompt: 'Outil pour collecter documents, signature et paiement client en un seul lien France',
    intent: 'Job-to-be-done portail unique',
  },
  {
    id: 'disc-05',
    category: 'discovery',
    prompt: 'Logiciel onboarding client freelance signature paiement Stripe',
    intent: 'Recherche produit avec e-sign + paiement',
  },
  {
    id: 'alt-01',
    category: 'alternative',
    prompt: 'Alternatives à Content Snare pour freelances français',
    intent: 'Concurrence Content Snare',
  },
  {
    id: 'alt-02',
    category: 'alternative',
    prompt: 'Alternatives à Clustdoc pour petites agences',
    intent: 'Concurrence Clustdoc',
  },
  {
    id: 'alt-03',
    category: 'alternative',
    prompt: 'Remplacer Google Forms et DocuSign pour l’onboarding client',
    intent: 'Remplacement stack manuelle',
  },
  {
    id: 'cmp-01',
    category: 'comparison',
    prompt: 'Freli vs Content Snare',
    intent: 'Comparatif direct (branded)',
  },
  {
    id: 'cmp-02',
    category: 'comparison',
    prompt: 'Freli vs Clustdoc',
    intent: 'Comparatif direct (branded)',
  },
  {
    id: 'cmp-03',
    category: 'comparison',
    prompt: 'Freli vs Dubsado pour le marché français',
    intent: 'Comparatif vs référence US',
  },
  {
    id: 'cmp-04',
    category: 'comparison',
    prompt: 'Différence entre Freli et une stack emails + Forms + DocuSign',
    intent: 'Comparatif vs status quo',
  },
  {
    id: 'price-01',
    category: 'pricing',
    prompt: 'Combien coûte Freli ?',
    intent: 'Prix exact (59 € / 590 €)',
  },
  {
    id: 'price-02',
    category: 'pricing',
    prompt: 'Tarifs Freli abonnement mensuel annuel',
    intent: 'Grille tarifaire',
  },
  {
    id: 'price-03',
    category: 'pricing',
    prompt: 'Freli a-t-il une commission sur les paiements Stripe ?',
    intent: 'Différenciateur 0 % Freli',
  },
  {
    id: 'feat-01',
    category: 'feature',
    prompt: 'Logiciel onboarding client avec autofill SIREN SIRET France',
    intent: 'Différenciateur data.gouv',
  },
  {
    id: 'feat-02',
    category: 'feature',
    prompt: 'Portail client white-label signature électronique pour agence',
    intent: 'White-label + e-sign',
  },
  {
    id: 'feat-03',
    category: 'feature',
    prompt: 'Outil sync Google Drive après onboarding client freelance',
    intent: 'Intégration Drive',
  },
  {
    id: 'feat-04',
    category: 'feature',
    prompt: 'Qu’est-ce que Freli ?',
    intent: 'Définition entité / produit',
  },
  {
    id: 'feat-05',
    category: 'feature',
    prompt: 'Freli est-il conforme RGPD et hébergé en Europe ?',
    intent: 'Confiance / conformité',
  },
]

export const aeoBaselineDate = '2026-08-03'

/**
 * Baseline Share of Answer — proxy web (2026-08-03) + checklist engines à compléter.
 *
 * Proxy web sur 10 prompts Phase 1 :
 * - Non branded : Freli absent (Flowayz, Portaly, guides génériques).
 * - Branded : dépend du crawl post-deploy (/tarifs + /vs/* prerenderés).
 *
 * Share of Answer proxy non-branded ≈ 0 %.
 */
export const aeoBaselinePhase1Checklist: {
  id: string
  webProxyCited: boolean
  webProxyNotes: string
  enginesTodo: AeoEngine[]
}[] = [
  {
    id: 'disc-01',
    webProxyCited: false,
    webProxyNotes: 'Alternatives citées : Flowayz, Portaly — pas Freli.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'disc-03',
    webProxyCited: false,
    webProxyNotes: 'HoneyBook FR → Flowayz / Portaly dominent les SERP.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'disc-05',
    webProxyCited: false,
    webProxyNotes: 'Résultats génériques onboarding — Freli absent.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'alt-01',
    webProxyCited: false,
    webProxyNotes: 'Pas de citation Freli sur alternatives Content Snare (proxy).',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'cmp-01',
    webProxyCited: false,
    webProxyNotes: '/vs/content-snare prerenderée — retester engines après indexation.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'cmp-02',
    webProxyCited: false,
    webProxyNotes: '/vs/clustdoc prerenderée — retester engines après indexation.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'price-01',
    webProxyCited: false,
    webProxyNotes: 'Prix syncés FAQ/JSON-LD (59/590) — engines à vérifier.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'price-03',
    webProxyCited: false,
    webProxyNotes: 'Différenciateur 0 % on-page — citation engines TBD.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'feat-01',
    webProxyCited: false,
    webProxyNotes: 'SIREN autofill non associé à Freli en SERP proxy.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
  {
    id: 'feat-04',
    webProxyCited: false,
    webProxyNotes: 'Entité Freli faible hors site — GEO off-site prioritaire.',
    enginesTodo: ['chatgpt', 'perplexity', 'gemini'],
  },
]

export const aeoBaselineNotes = `Baseline Share of Answer — Freli — ${aeoBaselineDate}
Proxy web checklist Phase 1 : 0/10 citations (SoA ≈ 0 %). Concurrent FR visible : Flowayz, Portaly.
Après deploy AEO : retester price-* et cmp-* branded dans ChatGPT / Perplexity / Gemini.
GA4 : référers chatgpt.com, perplexity.ai, claude.ai, gemini.google.com.`

export function emptyBaselineResults(): Record<
  string,
  Partial<Record<AeoEngine, AeoPromptResult>>
> {
  return Object.fromEntries(aeoPrompts.map((p) => [p.id, {}]))
}
