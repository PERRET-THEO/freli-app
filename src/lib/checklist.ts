export type ChecklistItemType = 'text' | 'file' | 'signature'

export type DraftChecklistItem = {
  id: string
  label: string
  type: ChecklistItemType
  contractTemplateId?: string | null
}

export const CHECKLIST_TYPE_LABELS: Record<ChecklistItemType, string> = {
  text: 'Texte',
  file: 'Fichier',
  signature: 'Signature',
}

export const CHECKLIST_TYPE_OPTIONS: { value: ChecklistItemType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'file', label: 'Fichier' },
  { value: 'signature', label: 'Signature' },
]

export type BuiltinTemplateKey =
  | 'website'
  | 'mobile'
  | 'branding'
  | 'ecommerce'
  | 'consulting'
  | 'photoVideo'
  | 'general'

type TemplateItemSeed = { label: string; type: ChecklistItemType }

export const BUILTIN_TEMPLATES: Record<
  BuiltinTemplateKey,
  { label: string; items: TemplateItemSeed[] }
> = {
  website: {
    label: 'Site web',
    items: [
      { label: 'Brief', type: 'text' },
      { label: 'Logo', type: 'file' },
      { label: 'Accès hébergeur', type: 'text' },
      { label: 'Contrat', type: 'signature' },
      { label: 'Contenu pages', type: 'text' },
    ],
  },
  mobile: {
    label: 'Application mobile',
    items: [
      { label: 'Brief technique', type: 'text' },
      { label: 'Charte UI', type: 'file' },
      { label: 'Comptes stores', type: 'text' },
      { label: 'Contrat', type: 'signature' },
      { label: 'Spécifications', type: 'text' },
    ],
  },
  branding: {
    label: 'Identité visuelle',
    items: [
      { label: 'Brief créatif', type: 'text' },
      { label: 'Références visuelles', type: 'file' },
      { label: 'Contrat', type: 'signature' },
      { label: 'Formats souhaités', type: 'text' },
    ],
  },
  ecommerce: {
    label: 'E-commerce',
    items: [
      { label: 'Catalogue produits', type: 'file' },
      { label: 'Logo & charte', type: 'file' },
      { label: 'Accès plateforme (Shopify, etc.)', type: 'text' },
      { label: 'Moyens de paiement souhaités', type: 'text' },
      { label: 'Contrat', type: 'signature' },
    ],
  },
  consulting: {
    label: 'Conseil / Prestation',
    items: [
      { label: 'Cahier des charges', type: 'file' },
      { label: 'Objectifs de la mission', type: 'text' },
      { label: 'Devis validé', type: 'signature' },
      { label: 'Interlocuteur principal', type: 'text' },
    ],
  },
  photoVideo: {
    label: 'Photo / Vidéo',
    items: [
      { label: 'Brief créatif', type: 'text' },
      { label: 'Références / moodboard', type: 'file' },
      { label: 'Lieu & date de tournage', type: 'text' },
      { label: 'Autorisation de droit à l\u2019image', type: 'signature' },
    ],
  },
  general: {
    label: 'Général',
    items: [
      { label: 'Formulaire de brief rempli', type: 'text' },
      { label: 'Logo & charte graphique', type: 'file' },
      { label: 'Contrat signé', type: 'signature' },
      { label: 'Brief détaillé', type: 'text' },
    ],
  },
}

export function createDraftItem(
  label: string,
  type: ChecklistItemType = 'text',
): DraftChecklistItem {
  return { id: crypto.randomUUID(), label, type, contractTemplateId: null }
}

export function buildItemsFromSeeds(seeds: TemplateItemSeed[]): DraftChecklistItem[] {
  return seeds.map((seed) => createDraftItem(seed.label, seed.type))
}

export function duplicateItem(item: DraftChecklistItem): DraftChecklistItem {
  return { ...item, id: crypto.randomUUID() }
}

export function moveItem(
  items: DraftChecklistItem[],
  id: string,
  direction: 'up' | 'down',
): DraftChecklistItem[] {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return items
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Returns an error message if the checklist is invalid, otherwise null. */
export function validateChecklist(items: DraftChecklistItem[]): string | null {
  if (!items.length) return 'Ajoute au moins un item de checklist.'
  if (items.some((item) => !item.label.trim())) {
    return 'Chaque item doit avoir un libellé.'
  }
  return null
}
