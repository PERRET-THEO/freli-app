const pluralRules = new Intl.PluralRules('fr-FR')

export type FormatCountOptions = {
  /** Forme plurielle explicite (défaut : singular + « s »). */
  plural?: string
  /**
   * Texte pour count === 0 sur les phrases visibles (« Aucun projet »).
   * Si omis, utilise la forme « one » de PluralRules (ex. « 0 projet »).
   */
  zero?: string
}

/**
 * Compteur français : « 1 projet », « 2 projets ».
 * Note : `Intl.PluralRules('fr-FR')` classe 0 en « one » → « 0 projet ».
 * Passer `zero: 'Aucun projet'` pour les bannières / sous-titres.
 */
export function formatCount(
  count: number,
  singular: string,
  options?: FormatCountOptions,
): string {
  if (!Number.isFinite(count)) {
    return options?.zero ?? `0 ${singular}`
  }

  if (count === 0 && options?.zero != null) {
    return options.zero
  }

  const plural = options?.plural ?? `${singular}s`
  const word = pluralRules.select(Math.abs(count)) === 'one' ? singular : plural
  return `${count} ${word}`
}
