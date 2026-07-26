import type { ChecklistItemType } from './checklist'
import type { StoredCondition } from './checklistConditions'

/** Étapes dont la réponse est une valeur saisie par le client (stockée dans `value`). */
const INPUT_TYPES = new Set<ChecklistItemType>(['text', 'email', 'phone', 'url', 'choice'])

/** Étapes où le client saisit une seule ligne (vs zone de texte libre). */
const SINGLE_LINE_TYPES = new Set<ChecklistItemType>(['email', 'phone', 'url'])

export function isInputType(type: ChecklistItemType): boolean {
  return INPUT_TYPES.has(type)
}

export function isSingleLineType(type: ChecklistItemType): boolean {
  return SINGLE_LINE_TYPES.has(type)
}

/**
 * Configuration optionnelle portée par une étape (colonne `config` JSONB).
 * `visibleWhen` est la forme persistée (`sourceIndex`) — la forme builder
 * (`itemId`) vit sur `DraftChecklistItem.visibleWhen`.
 */
export type ChecklistItemConfig = {
  choiceOptions?: string[]
  scheduleUrl?: string
  visibleWhen?: StoredCondition | null
}

export const FIELD_PLACEHOLDERS: Partial<Record<ChecklistItemType, string>> = {
  text: 'Décrivez votre projet, vos objectifs...',
  email: 'prenom@entreprise.fr',
  phone: '06 12 34 56 78',
  url: 'https://exemple.fr',
}

export const FIELD_INPUT_MODES: Partial<Record<ChecklistItemType, 'email' | 'tel' | 'url'>> = {
  email: 'email',
  phone: 'tel',
  url: 'url',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

/** Numéros FR et internationaux : chiffres, espaces, points, tirets, parenthèses, +. */
const PHONE_PATTERN = /^\+?[0-9][0-9\s.\-()]{7,19}$/

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isValidHttpUrl(raw: string): boolean {
  const candidate = normalizeUrl(raw)
  if (!candidate) return false
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    // Un hôte crédible contient au moins un point (exclut "https://abc").
    return url.hostname.includes('.') && !url.hostname.endsWith('.')
  } catch {
    return false
  }
}

export function parseChoiceOptions(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function formatChoiceOptions(options: string[] | undefined): string {
  return (options ?? []).join('\n')
}

/**
 * Valide la réponse du client pour une étape de saisie.
 * Renvoie un message d'erreur, ou null si la valeur est acceptable.
 */
export function validateClientAnswer(
  type: ChecklistItemType,
  rawValue: string,
  config?: ChecklistItemConfig | null,
): string | null {
  const value = rawValue.trim()

  if (!isInputType(type)) return null
  if (!value) return 'Cette information est requise.'

  switch (type) {
    case 'email':
      return EMAIL_PATTERN.test(value) ? null : 'Adresse email invalide.'
    case 'phone':
      return PHONE_PATTERN.test(value) ? null : 'Numéro de téléphone invalide.'
    case 'url':
      return isValidHttpUrl(value) ? null : 'Lien invalide (ex. https://exemple.fr).'
    case 'choice': {
      const options = config?.choiceOptions ?? []
      if (options.length === 0) return 'Aucune option disponible.'
      return options.includes(value) ? null : 'Sélectionnez une option proposée.'
    }
    default:
      return null
  }
}

/** Valeur normalisée à enregistrer (les URLs reçoivent leur schéma). */
export function normalizeClientAnswer(type: ChecklistItemType, rawValue: string): string {
  if (type === 'url') return normalizeUrl(rawValue)
  return rawValue.trim()
}
