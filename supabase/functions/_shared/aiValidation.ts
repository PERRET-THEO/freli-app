/**
 * Validation Zod-compatible des payloads IA (sans dépendance npm Zod en Deno).
 * Schémas légers alignés sur documentSchemas.ts.
 */

export type ExtractionFields = Record<string, string | null>

const IDENTITY_KEYS = [
  'first_name',
  'last_name',
  'birth_date',
  'birth_place',
  'nationality',
  'address',
  'document_number',
  'expiry_date',
] as const

const KBIS_KEYS = [
  'company_name',
  'legal_form',
  'siren',
  'siret',
  'rcs_city',
  'registered_address',
  'creation_date',
  'share_capital',
] as const

const RIB_KEYS = ['iban', 'bic', 'bank_name', 'account_holder'] as const

const KEYS_BY_TYPE: Record<string, readonly string[]> = {
  identity: IDENTITY_KEYS,
  kbis: KBIS_KEYS,
  rib: RIB_KEYS,
}

export function parseExtractionFields(
  documentType: string,
  raw: unknown,
): { ok: true; fields: ExtractionFields } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'fields must be an object' }
  }
  const allowed = KEYS_BY_TYPE[documentType]
  if (!allowed) return { ok: false, error: `unknown document type: ${documentType}` }

  const out: ExtractionFields = {}
  for (const key of allowed) {
    const value = (raw as Record<string, unknown>)[key]
    if (value === null || value === undefined || value === '') {
      out[key] = null
      continue
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `field ${key} must be string or null` }
    }
    const trimmed = value.trim()
    out[key] = trimmed.length > 0 ? trimmed : null
  }
  return { ok: true, fields: out }
}

export function parseReminderPayload(
  raw: unknown,
): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid reminder payload' }
  const subject = typeof (raw as { subject?: unknown }).subject === 'string'
    ? (raw as { subject: string }).subject.trim()
    : ''
  const body = typeof (raw as { body?: unknown }).body === 'string'
    ? (raw as { body: string }).body.trim()
    : ''
  if (!subject || subject.length > 120) return { ok: false, error: 'subject invalide' }
  if (!body || body.length < 20 || body.length > 2000) return { ok: false, error: 'body invalide' }
  return { ok: true, subject, body }
}

export type ReminderFacts = {
  clientActionCount: number
  clientActionLabels: string[]
  completedVisible: number
  totalVisible: number
  percent: number
  /** Notes brutes à ne jamais retrouver mot pour mot dans le mail. */
  forbiddenVerbatimNotes?: string[]
}

const ALMOST_DONE_RE =
  /presque\s+termin[ée]|plus\s+qu['’]une\s+(seule\s+)?(action|étape)|une\s+seule\s+(action|étape)|il\s+ne\s+vous\s+reste\s+plus\s+qu['’]une|il\s+ne\s+vous\s+reste\s+que\s+cette\s+action/i

/** Termes FR grossiers / injurieux — notes internes à exclure du prompt et du mail. */
export const INAPPROPRIATE_TERMS_FR = [
  'fdp',
  'pd',
  'pute',
  'putain',
  'salope',
  'connard',
  'connasse',
  'enculé',
  'encule',
  'enfoiré',
  'enfoire',
  'bordel',
  'merde',
  'chier',
  'nique',
  'ntm',
  'tg',
  'ta gueule',
  'batard',
  'bâtard',
  'fuck',
  'shit',
  'asshole',
] as const

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function containsInappropriateTerms(text: string): boolean {
  const normalized = normalizeForMatch(text)
  if (!normalized) return false
  return INAPPROPRIATE_TERMS_FR.some((term) => {
    const t = normalizeForMatch(term)
    if (t.includes(' ')) return normalized.includes(t)
    // Mot entier (évite faux positifs sur « pd » dans « pdf » via bornes).
    return new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`).test(
      normalized,
    )
  })
}

export type SanitizedCorrection = {
  label: string
  /** Motif sûr à reformuler ; null = ne citer que le libellé. */
  noteForPrompt: string | null
  rawNote: string
  omittedAsInappropriate: boolean
}

/** Prépare les corrections pour le prompt : jamais de note injurieuse brute. */
export function sanitizeCorrectionNotes(
  corrections: Array<{ label: string; note: string }>,
): SanitizedCorrection[] {
  return corrections.map((row) => {
    const rawNote = String(row.note ?? '').trim()
    const inappropriate = containsInappropriateTerms(rawNote)
    return {
      label: row.label,
      rawNote,
      omittedAsInappropriate: inappropriate,
      noteForPrompt: inappropriate || !rawNote ? null : rawNote,
    }
  })
}

export function noteAppearsVerbatim(text: string, notes: string[]): boolean {
  const hay = normalizeForMatch(text)
  for (const note of notes) {
    const needle = normalizeForMatch(note)
    if (needle.length < 4) continue
    if (hay.includes(needle)) return true
  }
  return false
}

/**
 * Refuse les affirmations non vérifiables / notes brutes / termes inappropriés.
 */
export function validateReminderFacts(
  subject: string,
  body: string,
  facts: ReminderFacts,
): { ok: true } | { ok: false; error: string } {
  const text = `${subject}\n${body}`

  if (containsInappropriateTerms(text)) {
    return { ok: false, error: 'Contenu inapproprié détecté dans la relance' }
  }

  const forbidden = (facts.forbiddenVerbatimNotes ?? []).filter((n) => n.trim().length >= 4)
  if (forbidden.length > 0 && noteAppearsVerbatim(text, forbidden)) {
    return { ok: false, error: 'Note de correction reprise mot pour mot' }
  }

  if (ALMOST_DONE_RE.test(text) && facts.clientActionCount !== 1) {
    return {
      ok: false,
      error: `Affirmation « une seule action / presque terminé » alors qu'il reste ${facts.clientActionCount} action(s) client`,
    }
  }

  // Chiffres d'étapes du type « 3/5 » ou « 60 % » doivent coller aux faits.
  const slashMatch = text.match(/(\d+)\s*\/\s*(\d+)/)
  if (slashMatch) {
    const a = Number(slashMatch[1])
    const b = Number(slashMatch[2])
    if (a !== facts.completedVisible || b !== facts.totalVisible) {
      return {
        ok: false,
        error: `Avancement cité ${a}/${b} ≠ réel ${facts.completedVisible}/${facts.totalVisible}`,
      }
    }
  }

  const percentMatch = text.match(/(\d+)\s*%/)
  if (percentMatch) {
    const p = Number(percentMatch[1])
    if (p !== facts.percent) {
      return { ok: false, error: `Pourcentage cité ${p} % ≠ réel ${facts.percent} %` }
    }
  }

  return { ok: true }
}

/** Fallback déterministe si l'IA échoue après régénération. */
export function buildFallbackReminder(input: {
  firstName: string
  agencyName: string
  clientActionLabels: string[]
  correctionLabels: string[]
}): { subject: string; body: string } {
  const actions =
    input.clientActionLabels.length > 0
      ? input.clientActionLabels.map((l) => `« ${l} »`).join(', ')
      : 'les éléments en attente'
  const correctionBit =
    input.correctionLabels.length > 0
      ? ` Merci d'ajuster notamment : ${input.correctionLabels
          .map((l) => `« ${l} »`)
          .join(', ')}.`
      : ''
  const subject =
    input.correctionLabels.length > 0
      ? `${input.agencyName} — éléments à ajuster`
      : `${input.agencyName} — suite de votre onboarding`
  const body = `Bonjour ${input.firstName},\n\nNous revenons vers vous concernant votre dossier. Il reste à compléter : ${actions}.${correctionBit}\n\nLe bouton ci-dessous ouvre directement votre espace sécurisé.\n\nBien cordialement,\n${input.agencyName}`
  return { subject: subject.slice(0, 60), body }
}

export type ContractSection = {
  id: string
  heading: string
  content: string
  origin: 'brief' | 'model' | 'ai_generated' | 'library'
  needs_legal_review: boolean
}

export function parseContractDraft(
  raw: unknown,
): { ok: true; title: string; sections: ContractSection[] } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid draft' }
  const title = typeof (raw as { title?: unknown }).title === 'string'
    ? (raw as { title: string }).title.trim()
    : ''
  const sectionsRaw = (raw as { sections?: unknown }).sections
  if (!title) return { ok: false, error: 'title manquant' }
  if (!Array.isArray(sectionsRaw) || sectionsRaw.length === 0) {
    return { ok: false, error: 'sections manquantes' }
  }

  const origins = new Set(['brief', 'model', 'ai_generated', 'library'])
  const sections: ContractSection[] = []
  for (let i = 0; i < sectionsRaw.length; i++) {
    const s = sectionsRaw[i]
    if (!s || typeof s !== 'object') return { ok: false, error: `section ${i} invalide` }
    const heading = typeof (s as { heading?: unknown }).heading === 'string'
      ? (s as { heading: string }).heading.trim()
      : ''
    const content = typeof (s as { content?: unknown }).content === 'string'
      ? (s as { content: string }).content.trim()
      : ''
    const originRaw = (s as { origin?: unknown }).origin
    const origin = typeof originRaw === 'string' && origins.has(originRaw)
      ? (originRaw as ContractSection['origin'])
      : 'ai_generated'
    const needs =
      (s as { needs_legal_review?: unknown }).needs_legal_review === true ||
      origin === 'ai_generated'
    if (!heading || !content) return { ok: false, error: `section ${i} incomplète` }
    sections.push({
      id: typeof (s as { id?: unknown }).id === 'string' && (s as { id: string }).id
        ? (s as { id: string }).id
        : `section_${i + 1}`,
      heading,
      content,
      origin,
      needs_legal_review: needs,
    })
  }
  return { ok: true, title, sections }
}

/** Confidence heuristique : champ non-null = 0.85, null = 0 */
export function heuristicFieldConfidence(fields: ExtractionFields): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value ? 0.85 : 0
  }
  return out
}

export const EXTRACTION_PROMPT_VERSION = 'extract_v1_2026_08'
export const REMINDER_PROMPT_VERSION = 'reminder_v3_2026_10'
export const CONTRACT_PROMPT_VERSION = 'contract_v1_2026_08'
