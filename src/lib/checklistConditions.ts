/**
 * Logique conditionnelle simple : « afficher cette étape si telle réponse ».
 *
 * Volontairement limitée à l'égalité sur une étape « Choix dans une liste »
 * placée plus haut dans la checklist. Un moteur de règles complet rendrait le
 * builder illisible pour une agence de deux personnes.
 *
 * Deux représentations coexistent :
 * - `VisibilityCondition` (édition) pointe vers l'`id` du brouillon, qui survit
 *   aux réordonnancements dans le builder ;
 * - `StoredCondition` (base) pointe vers l'`order_index` de l'étape source, car
 *   la synchronisation recrée les lignes avec de nouveaux identifiants.
 */

/** Condition côté builder : référence l'identifiant du brouillon source. */
export type VisibilityCondition = {
  itemId: string
  /** Option de l'étape source qui déclenche l'affichage. */
  equals: string
}

/** Condition côté base : référence la position de l'étape source. */
export type StoredCondition = {
  sourceIndex: number
  equals: string
}

export function isStoredCondition(value: unknown): value is StoredCondition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredCondition>
  return (
    typeof candidate.sourceIndex === 'number' &&
    Number.isInteger(candidate.sourceIndex) &&
    candidate.sourceIndex >= 0 &&
    typeof candidate.equals === 'string'
  )
}

type RuntimeItem = {
  completed: boolean
  value: string | null
  config?: { visibleWhen?: StoredCondition | null } | null
}

function storedCondition(item: RuntimeItem): StoredCondition | null {
  const condition = item.config?.visibleWhen
  return isStoredCondition(condition) ? condition : null
}

/**
 * Une étape conditionnée reste masquée tant que sa condition n'est pas
 * satisfaite, y compris quand l'étape source n'a pas encore de réponse.
 *
 * `orderedItems` doit être trié par `order_index`, comme en base.
 */
export function isItemVisible<T extends RuntimeItem>(item: T, orderedItems: T[]): boolean {
  let current: T | undefined = item

  // La condition ne peut viser qu'une étape antérieure : la chaîne est donc
  // strictement décroissante et termine en au plus `length` sauts.
  for (let hop = 0; hop <= orderedItems.length; hop += 1) {
    if (!current) return true

    const condition = storedCondition(current)
    if (!condition) return true

    const source = orderedItems[condition.sourceIndex]
    // Donnée incohérente : ne pas masquer, pour ne jamais bloquer un onboarding.
    if (!source || source === current) return true

    if (!source.completed) return false
    if ((source.value ?? '') !== condition.equals) return false

    current = source
  }

  return true
}

/** Étapes réellement présentées au client. */
export function getVisibleItems<T extends RuntimeItem>(orderedItems: T[]): T[] {
  return orderedItems.filter((item) => isItemVisible(item, orderedItems))
}

export function hasStoredCondition(item: RuntimeItem): boolean {
  return storedCondition(item) !== null
}

type DraftLike = {
  id: string
  label: string
  type: string
  choiceOptions?: string[]
  visibleWhen?: VisibilityCondition | null
}

/** Étapes pouvant conditionner celle en position `targetIndex` : les « Choix » au-dessus. */
export function getEligibleConditionSources<T extends DraftLike>(
  items: T[],
  targetIndex: number,
): T[] {
  return items
    .slice(0, targetIndex)
    .filter((item) => item.type === 'choice' && (item.choiceOptions ?? []).some((o) => o.trim()))
}

/**
 * Valide les conditions d'une checklist en cours d'édition.
 * Renvoie un message d'erreur, ou null si tout est cohérent.
 */
export function validateConditions(items: DraftLike[]): string | null {
  for (const [index, item] of items.entries()) {
    const condition = item.visibleWhen
    if (!condition?.itemId) continue

    const label = item.label.trim()

    if (condition.itemId === item.id) {
      return `L'item « ${label} » ne peut pas dépendre de lui-même.`
    }

    const sourceIndex = items.findIndex((entry) => entry.id === condition.itemId)
    if (sourceIndex === -1) {
      return `L'item « ${label} » dépend d'une étape supprimée.`
    }
    if (sourceIndex >= index) {
      return `L'item « ${label} » doit dépendre d'une étape située avant lui.`
    }

    const source = items[sourceIndex]
    if (source.type !== 'choice') {
      return `L'item « ${label} » ne peut dépendre que d'une étape « Choix dans une liste ».`
    }
    if (!condition.equals.trim()) {
      return `Choisis l'option qui déclenche l'item « ${label} ».`
    }
    if (!(source.choiceOptions ?? []).includes(condition.equals)) {
      return `L'option « ${condition.equals} » n'existe plus dans « ${source.label.trim()} ».`
    }
  }

  return null
}

/**
 * Retire les conditions devenues invalides après un déplacement, une
 * suppression ou un changement de type, pour ne jamais bloquer l'édition.
 */
export function pruneInvalidConditions<T extends DraftLike>(items: T[]): T[] {
  let changed = false

  const next = items.map((item, index) => {
    const condition = item.visibleWhen
    if (!condition?.itemId) return item

    const sourceIndex = items.findIndex((entry) => entry.id === condition.itemId)
    const source = sourceIndex === -1 ? null : items[sourceIndex]
    const stillValid =
      source !== null &&
      sourceIndex < index &&
      source.type === 'choice' &&
      (source.choiceOptions ?? []).includes(condition.equals)

    if (stillValid) return item
    changed = true
    return { ...item, visibleWhen: null }
  })

  return changed ? next : items
}

/** Convertit une condition d'édition vers sa forme stockable. */
export function toStoredCondition(
  item: DraftLike,
  items: DraftLike[],
): StoredCondition | null {
  const condition = item.visibleWhen
  if (!condition?.itemId || !condition.equals) return null

  const sourceIndex = items.findIndex((entry) => entry.id === condition.itemId)
  if (sourceIndex === -1) return null

  return { sourceIndex, equals: condition.equals }
}

/** Convertit une condition stockée vers sa forme d'édition. */
export function fromStoredCondition(
  condition: StoredCondition | null | undefined,
  orderedItems: { id: string }[],
): VisibilityCondition | null {
  if (!isStoredCondition(condition)) return null

  const source = orderedItems[condition.sourceIndex]
  if (!source) return null

  return { itemId: source.id, equals: condition.equals }
}

/**
 * Résout les conditions de brouillons fraîchement chargés depuis la base.
 * `configs` doit être aligné sur `drafts` (même ordre que `order_index`).
 */
export function resolveDraftConditions<T extends { id: string }>(
  drafts: T[],
  configs: ({ visibleWhen?: StoredCondition | null } | null | undefined)[],
): (T & { visibleWhen: VisibilityCondition | null })[] {
  return drafts.map((draft, index) => ({
    ...draft,
    visibleWhen: fromStoredCondition(configs[index]?.visibleWhen, drafts),
  }))
}
