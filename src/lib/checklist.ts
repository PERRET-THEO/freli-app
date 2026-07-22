export type ChecklistItemType = 'text' | 'file' | 'signature'

export type ContractSource = 'existing' | 'ai_generate' | 'default'

export type DraftChecklistItem = {
  id: string
  label: string
  type: ChecklistItemType
  contractTemplateId?: string | null
  contractSource?: ContractSource
  contractBrief?: string
}

export const CHECKLIST_TYPE_LABELS: Record<ChecklistItemType, string> = {
  text: 'Texte',
  file: 'Fichier',
  signature: 'Contrat à signer',
}

export const CHECKLIST_TYPE_OPTIONS: { value: ChecklistItemType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'file', label: 'Fichier' },
  { value: 'signature', label: 'Contrat à signer' },
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
  overrides?: Partial<Pick<DraftChecklistItem, 'contractSource' | 'contractTemplateId' | 'contractBrief'>>,
): DraftChecklistItem {
  const base: DraftChecklistItem = {
    id: crypto.randomUUID(),
    label,
    type,
    contractTemplateId: null,
  }
  if (type === 'signature') {
    base.contractSource = overrides?.contractSource ?? 'default'
    base.contractTemplateId = overrides?.contractTemplateId ?? null
    base.contractBrief = overrides?.contractBrief ?? ''
  }
  return { ...base, ...overrides }
}

export function buildItemsFromSeeds(seeds: TemplateItemSeed[]): DraftChecklistItem[] {
  return seeds.map((seed) =>
    seed.type === 'signature'
      ? createDraftItem(seed.label, seed.type, { contractSource: 'default' })
      : createDraftItem(seed.label, seed.type),
  )
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

export function hasAiGenerateItems(items: DraftChecklistItem[]): boolean {
  return items.some((item) => item.type === 'signature' && item.contractSource === 'ai_generate')
}

export function countAiGenerateItems(items: DraftChecklistItem[]): number {
  return items.filter((item) => item.type === 'signature' && item.contractSource === 'ai_generate').length
}

export function buildDefaultContractBrief(clientName: string, priceEur?: number | null): string {
  const parts: string[] = []
  if (clientName.trim()) {
    parts.push(`Prestation pour ${clientName.trim()}.`)
  }
  if (priceEur && priceEur > 0) {
    parts.push(`Montant : ${priceEur} € HT.`)
  }
  parts.push('Modalités de paiement à 30 jours. Clause de confidentialité standard.')
  return parts.join(' ')
}

const ONBOARDING_TYPE_HINTS: Record<Exclude<ChecklistItemType, 'signature'>, string> = {
  text: 'texte à fournir',
  file: 'fichier à fournir',
}

export function getChecklistContextLines(items: DraftChecklistItem[]): string[] {
  return items
    .filter((item) => item.type !== 'signature')
    .map(
      (item) =>
        `- ${item.label.trim()} (${ONBOARDING_TYPE_HINTS[item.type as Exclude<ChecklistItemType, 'signature'>]})`,
    )
}

export function buildContractBriefFromProject(
  items: DraftChecklistItem[],
  clientName: string,
  priceEur: number | null | undefined,
  manualBrief: string,
): string {
  const parts: string[] = []
  if (clientName.trim()) {
    parts.push(`Prestation pour ${clientName.trim()}.`)
  }
  if (priceEur && priceEur > 0) {
    parts.push(`Montant : ${priceEur} € HT.`)
  }
  if (manualBrief.trim()) {
    parts.push('')
    parts.push("Brief de l'agence :")
    parts.push(manualBrief.trim())
  }
  const contextLines = getChecklistContextLines(items)
  if (contextLines.length > 0) {
    parts.push('')
    parts.push('Éléments couverts par l\u2019onboarding client :')
    parts.push(...contextLines)
  }
  return parts.join('\n')
}

export type ContractGenerationContext = {
  brief: string
  checklistHash: string
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0
  }
  return String(hash)
}

/** Empreinte stable : items onboarding + prix + brief manuel. */
export function hashChecklistContext(
  items: DraftChecklistItem[],
  priceEur: number | null | undefined,
  manualBrief: string,
): string {
  const onboarding = items
    .filter((item) => item.type !== 'signature')
    .map((item) => `${item.type}:${item.label.trim()}`)
    .join('|')
  return simpleHash(`${onboarding}::${priceEur ?? ''}::${manualBrief.trim()}`)
}

export function buildContractGenerationContext(
  items: DraftChecklistItem[],
  clientName: string,
  priceEur: number | null | undefined,
  manualBrief: string,
): ContractGenerationContext {
  return {
    brief: buildContractBriefFromProject(items, clientName, priceEur, manualBrief),
    checklistHash: hashChecklistContext(items, priceEur, manualBrief),
  }
}

export function isGenerationContextStale(
  current: ContractGenerationContext,
  last: ContractGenerationContext | null,
): boolean {
  if (!last) return false
  return current.checklistHash !== last.checklistHash || current.brief !== last.brief
}

export function getAiSignatureItem(items: DraftChecklistItem[]): DraftChecklistItem | null {
  return items.find((item) => item.type === 'signature' && item.contractSource === 'ai_generate') ?? null
}

export function updateAiSignatureBrief(
  items: DraftChecklistItem[],
  brief: string,
): DraftChecklistItem[] {
  return items.map((item) =>
    item.type === 'signature' && item.contractSource === 'ai_generate'
      ? { ...item, contractBrief: brief }
      : item,
  )
}

type ValidateChecklistOptions = {
  hasDefaultContract?: boolean
  aiContractsEnabled?: boolean
}

/** Returns an error message if the checklist is invalid, otherwise null. */
export function validateChecklist(
  items: DraftChecklistItem[],
  options: ValidateChecklistOptions = {},
): string | null {
  const { hasDefaultContract = false, aiContractsEnabled = false } = options

  if (!items.length) return 'Ajoute au moins un item de checklist.'
  if (items.some((item) => !item.label.trim())) {
    return 'Chaque item doit avoir un libellé.'
  }

  const aiCount = countAiGenerateItems(items)
  if (aiCount > 1) {
    return 'Un seul contrat généré par IA est autorisé par projet pour le moment.'
  }

  for (const item of items) {
    if (item.type !== 'signature') continue

    const source = item.contractSource ?? 'default'

    if (source === 'existing' && !item.contractTemplateId) {
      return `L'item « ${item.label.trim()} » nécessite un modèle de contrat.`
    }

    if (source === 'ai_generate') {
      if (!aiContractsEnabled) {
        return 'Active la génération de contrats dans Paramètres → Intelligence artificielle.'
      }
      if (!item.contractBrief?.trim() || item.contractBrief.trim().length < 20) {
        return `Le brief du contrat pour « ${item.label.trim()} » doit contenir au moins 20 caractères.`
      }
    }

    if (source === 'default' && !hasDefaultContract && !item.contractTemplateId) {
      return 'Aucun modèle par défaut défini. Choisis un modèle existant ou génère un contrat avec l\u2019IA.'
    }
  }

  return null
}

export function buildChecklistItemValue(item: DraftChecklistItem): string | null {
  if (item.type !== 'signature') return null
  if (item.contractSource === 'ai_generate') {
    return JSON.stringify({ status: 'pending_generation' })
  }
  if (item.contractTemplateId) {
    return JSON.stringify({ template_id: item.contractTemplateId, status: 'pending' })
  }
  return null
}
