/**
 * Brouillons de saisie du portail client, conservés localement.
 *
 * Le client n'a pas de compte : s'il ferme l'onglet au milieu d'une réponse
 * longue, la seule façon de ne rien perdre est de garder le texte sur son
 * appareil jusqu'à validation de l'étape.
 */

const STORAGE_PREFIX = 'freli:portal-draft:'

/** Au-delà, un brouillon est trop ancien pour être proposé à la reprise. */
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type DraftEntry = {
  value: string
  savedAt: number
}

export type DraftMap = Record<string, DraftEntry>

/** Interface minimale de `localStorage`, pour pouvoir tester sans navigateur. */
export type DraftStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function defaultStorage(): DraftStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    // Safari en navigation privée peut lever sur l'accès à localStorage.
    return null
  }
}

function storageKey(token: string): string {
  return `${STORAGE_PREFIX}${token}`
}

export function pruneDrafts(drafts: DraftMap, now: number): DraftMap {
  const fresh: DraftMap = {}
  for (const [itemId, entry] of Object.entries(drafts)) {
    if (typeof entry?.value !== 'string') continue
    if (!Number.isFinite(entry.savedAt)) continue
    if (now - entry.savedAt > DRAFT_TTL_MS) continue
    if (!entry.value.trim()) continue
    fresh[itemId] = entry
  }
  return fresh
}

export function readDrafts(
  token: string,
  storage: DraftStorage | null = defaultStorage(),
  now: number = Date.now(),
): DraftMap {
  if (!storage || !token) return {}
  try {
    const raw = storage.getItem(storageKey(token))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DraftMap
    if (!parsed || typeof parsed !== 'object') return {}
    return pruneDrafts(parsed, now)
  } catch {
    return {}
  }
}

function writeDrafts(token: string, drafts: DraftMap, storage: DraftStorage | null): void {
  if (!storage || !token) return
  try {
    if (Object.keys(drafts).length === 0) {
      storage.removeItem(storageKey(token))
      return
    }
    storage.setItem(storageKey(token), JSON.stringify(drafts))
  } catch {
    // Quota dépassé ou stockage indisponible : la saisie en cours reste en mémoire.
  }
}

export function saveDraft(
  token: string,
  itemId: string,
  value: string,
  storage: DraftStorage | null = defaultStorage(),
  now: number = Date.now(),
): DraftMap {
  const drafts = readDrafts(token, storage, now)
  if (!value.trim()) {
    delete drafts[itemId]
  } else {
    drafts[itemId] = { value, savedAt: now }
  }
  writeDrafts(token, drafts, storage)
  return drafts
}

export function clearDraft(
  token: string,
  itemId: string,
  storage: DraftStorage | null = defaultStorage(),
  now: number = Date.now(),
): DraftMap {
  const drafts = readDrafts(token, storage, now)
  delete drafts[itemId]
  writeDrafts(token, drafts, storage)
  return drafts
}

export function clearAllDrafts(
  token: string,
  storage: DraftStorage | null = defaultStorage(),
): void {
  writeDrafts(token, {}, storage)
}

/**
 * Fusionne les valeurs serveur et les brouillons locaux.
 * Un brouillon ne l'emporte que sur une étape encore ouverte : une étape déjà
 * transmise affiche toujours ce que l'agence a reçu.
 */
export function mergeDraftsIntoValues(
  serverValues: Record<string, string>,
  drafts: DraftMap,
  openItemIds: Set<string>,
): Record<string, string> {
  const merged = { ...serverValues }
  for (const [itemId, entry] of Object.entries(drafts)) {
    if (!openItemIds.has(itemId)) continue
    if (entry.value.trim() === (serverValues[itemId] ?? '').trim()) continue
    merged[itemId] = entry.value
  }
  return merged
}

/** Nombre de brouillons réellement restaurables (étapes encore ouvertes). */
export function countRestorableDrafts(
  serverValues: Record<string, string>,
  drafts: DraftMap,
  openItemIds: Set<string>,
): number {
  let count = 0
  for (const [itemId, entry] of Object.entries(drafts)) {
    if (!openItemIds.has(itemId)) continue
    if (entry.value.trim() === (serverValues[itemId] ?? '').trim()) continue
    count += 1
  }
  return count
}
