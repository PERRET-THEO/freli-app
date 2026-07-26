/**
 * Visibilité conditionnelle des étapes, côté serveur.
 *
 * Miroir de `src/lib/checklistConditions.ts` : une relance ne doit jamais
 * réclamer une étape que le client ne voit pas. La condition référence la
 * position (`order_index`) de l'étape source, car la synchronisation d'une
 * checklist recrée les lignes avec de nouveaux identifiants.
 */

export type StoredCondition = {
  sourceIndex: number
  equals: string
}

export type VisibilityItem = {
  completed: boolean
  value: string | null
  config: { visibleWhen?: StoredCondition | null } | null
}

function storedCondition(item: VisibilityItem): StoredCondition | null {
  const condition = item.config?.visibleWhen
  if (!condition || typeof condition !== 'object') return null
  if (typeof condition.sourceIndex !== 'number' || !Number.isInteger(condition.sourceIndex)) {
    return null
  }
  if (condition.sourceIndex < 0 || typeof condition.equals !== 'string') return null
  return condition
}

/** `orderedItems` doit être trié par `order_index`. */
export function isItemVisible<T extends VisibilityItem>(item: T, orderedItems: T[]): boolean {
  let current: T | undefined = item

  for (let hop = 0; hop <= orderedItems.length; hop += 1) {
    if (!current) return true

    const condition = storedCondition(current)
    if (!condition) return true

    const source = orderedItems[condition.sourceIndex]
    // Donnée incohérente : ne jamais masquer, pour ne rien perdre d'une relance.
    if (!source || source === current) return true

    if (!source.completed) return false
    if ((source.value ?? '') !== condition.equals) return false

    current = source
  }

  return true
}

/** Étapes encore attendues du client : visibles et non complétées. */
export function getPendingVisibleItems<T extends VisibilityItem>(orderedItems: T[]): T[] {
  return orderedItems.filter((item) => !item.completed && isItemVisible(item, orderedItems))
}
