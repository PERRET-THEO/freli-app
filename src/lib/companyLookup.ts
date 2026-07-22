import { supabase } from './supabase'

/** Résultat normalisé retourné par l'Edge Function search-companies. */
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

export type CompanySearchOutcome = {
  results: CompanyLookupResult[]
  /** true si l'API gouvernementale est indisponible : basculer en saisie manuelle. */
  unavailable: boolean
}

export type LegalDataSource = 'api_gouv' | 'saisie_manuelle'

export async function searchCompanies(
  q: string,
  opts?: { refresh?: boolean; codePostal?: string },
): Promise<CompanySearchOutcome> {
  const { data, error } = await supabase.functions.invoke('search-companies', {
    body: { q, refresh: opts?.refresh, code_postal: opts?.codePostal },
  })
  if (error) return { results: [], unavailable: true }
  if (data?.error) return { results: [], unavailable: true }
  return {
    results: Array.isArray(data?.results) ? (data.results as CompanyLookupResult[]) : [],
    unavailable: false,
  }
}

/** Détecte si la saisie est un SIREN (9 chiffres) ou SIRET (14 chiffres). */
export function isSirenOrSiret(q: string): boolean {
  const digits = q.replace(/\s+/g, '')
  return /^\d{9}$/.test(digits) || /^\d{14}$/.test(digits)
}
