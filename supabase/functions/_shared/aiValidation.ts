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
export const REMINDER_PROMPT_VERSION = 'reminder_v1_2026_08'
export const CONTRACT_PROMPT_VERSION = 'contract_v1_2026_08'
