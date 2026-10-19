/**
 * Échappe une saisie utilisateur pour un filtre PostgREST `.or(...ilike.%q%)`.
 * Caractères réservés de la grammaire filter : `,` `(` `)` et jokers ILIKE `%` `_`,
 * plus le backslash.
 */
export function escapePostgrestSearch(raw: string): string {
  return raw.replace(/[%_\\,()]/g, (ch) => `\\${ch}`)
}

/** Retire les espaces (SIRET saisi « 123 456 789 00012 »). */
export function normalizeSiretQuery(raw: string): string {
  return raw.replace(/\s+/g, '')
}
