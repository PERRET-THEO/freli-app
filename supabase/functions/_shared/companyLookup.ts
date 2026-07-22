/**
 * Mapping des résultats de l'API Recherche d'Entreprises (api.gouv.fr)
 * vers le format normalisé Frely.
 *
 * Structure validée par appel réel : GET /search?q=130025265
 */

export type CompanyLookupResult = {
  siren: string
  siret: string
  raison_sociale: string
  forme_juridique: string
  forme_juridique_code: string
  adresse: string
  code_postal: string
  ville: string
  code_naf: string
  vat_number: string | null
  date_creation: string | null
  etat_administratif: string | null
}

type ApiEtablissement = {
  siret?: string
  adresse?: string
  code_postal?: string
  libelle_commune?: string
  numero_voie?: string
  type_voie?: string
  libelle_voie?: string
}

type ApiResult = {
  siren?: string
  nom_complet?: string
  nom_raison_sociale?: string
  siege?: ApiEtablissement
  activite_principale?: string
  nature_juridique?: string
  date_creation?: string
  etat_administratif?: string
  tva?: string[]
  complements?: {
    est_entrepreneur_individuel?: boolean
    est_association?: boolean
  }
}

export type ApiSearchResponse = {
  results?: ApiResult[]
  total_results?: number
}

/**
 * Codes INSEE "nature juridique" courants → libellés utilisés dans Frely
 * (mêmes valeurs que LEGAL_FORM_OPTIONS / COMPANY_TYPES côté frontend).
 */
const NATURE_JURIDIQUE_LABELS: Record<string, string> = {
  '1000': 'Auto-entrepreneur', // Entrepreneur individuel
  '5202': 'Autre', // Société en nom collectif
  '5498': 'EURL',
  '5499': 'SARL',
  '5505': 'SA',
  '5510': 'SA',
  '5599': 'SA',
  '5710': 'SAS',
  '5720': 'SASU',
  '6540': 'Autre', // SCI
  '9210': 'Association',
  '9220': 'Association',
  '9230': 'Association',
}

export function mapNatureJuridique(result: ApiResult): string {
  const code = result.nature_juridique ?? ''
  if (NATURE_JURIDIQUE_LABELS[code]) return NATURE_JURIDIQUE_LABELS[code]
  if (result.complements?.est_entrepreneur_individuel) return 'Auto-entrepreneur'
  if (result.complements?.est_association) return 'Association'
  return 'Autre'
}

/** L'adresse du siège inclut CP + ville en suffixe : on extrait la partie rue. */
function extractStreet(siege: ApiEtablissement): string {
  const full = (siege.adresse ?? '').trim()
  const cp = siege.code_postal ?? ''
  const ville = siege.libelle_commune ?? ''
  if (cp && ville) {
    const suffix = `${cp} ${ville}`
    if (full.toUpperCase().endsWith(suffix.toUpperCase())) {
      return full.slice(0, full.length - suffix.length).trim().replace(/,$/, '')
    }
  }
  const parts = [siege.numero_voie, siege.type_voie, siege.libelle_voie]
    .map((v) => v?.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : full
}

export function mapApiResults(response: ApiSearchResponse): CompanyLookupResult[] {
  const results = Array.isArray(response.results) ? response.results : []
  return results
    .filter((r) => Boolean(r.siren))
    .map((r) => {
      const siege = r.siege ?? {}
      return {
        siren: r.siren ?? '',
        siret: siege.siret ?? '',
        raison_sociale: (r.nom_complet ?? r.nom_raison_sociale ?? '').trim(),
        forme_juridique: mapNatureJuridique(r),
        forme_juridique_code: r.nature_juridique ?? '',
        adresse: extractStreet(siege),
        code_postal: siege.code_postal ?? '',
        ville: siege.libelle_commune ?? '',
        code_naf: r.activite_principale ?? '',
        vat_number: Array.isArray(r.tva) && r.tva.length > 0 ? r.tva[0] : null,
        date_creation: r.date_creation ?? null,
        etat_administratif: r.etat_administratif ?? null,
      }
    })
}
