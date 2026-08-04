/**
 * Corpus d'évaluation extraction (fixtures textuelles OCR).
 * Utilisé pour mesurer field-accuracy hors CI Mistral (pas d'appel API).
 */
export type ExtractionEvalCase = {
  id: string
  documentType: 'identity' | 'kbis' | 'rib'
  ocrMarkdown: string
  expected: Record<string, string | null>
}

export const EXTRACTION_EVAL_CORPUS: ExtractionEvalCase[] = [
  {
    id: 'kbis_acme',
    documentType: 'kbis',
    ocrMarkdown: `Extrait Kbis
Dénomination : ACME STUDIO
Forme juridique : SAS
SIREN : 732 829 320
SIRET : 732 829 320 00074
RCS Paris
Siège : 10 rue de la Paix 75002 Paris
Capital : 10 000 euros`,
    expected: {
      company_name: 'ACME STUDIO',
      legal_form: 'SAS',
      siren: '732829320',
      siret: '73282932000074',
    },
  },
  {
    id: 'rib_fr',
    documentType: 'rib',
    ocrMarkdown: `Relevé d'identité bancaire
IBAN : FR76 3000 6000 0112 3456 7890 189
BIC : AGRIFRPP`,
    expected: {
      iban: 'FR7630006000011234567890189',
      bic: 'AGRIFRPP',
    },
  },
  {
    id: 'identity_fr',
    documentType: 'identity',
    ocrMarkdown: `CARTE NATIONALE D'IDENTITÉ
Nom : DUPONT
Prénoms : Marie
Né(e) le : 12/03/1990
Nationalité : Française`,
    expected: {
      last_name: 'DUPONT',
      first_name: 'Marie',
      birth_date: '12/03/1990',
      nationality: 'Française',
    },
  },
]

/** Score exact-match sur les clés attendues non-null. */
export function scoreFieldAccuracy(
  expected: Record<string, string | null>,
  actual: Record<string, string | null>,
): { matched: number; total: number; ratio: number } {
  const keys = Object.keys(expected).filter((k) => expected[k] != null)
  let matched = 0
  for (const key of keys) {
    const exp = (expected[key] ?? '').replace(/\s+/g, '').toUpperCase()
    const act = (actual[key] ?? '').replace(/\s+/g, '').toUpperCase()
    if (exp && act === exp) matched += 1
  }
  const total = keys.length || 1
  return { matched, total, ratio: matched / total }
}
