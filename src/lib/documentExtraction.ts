import { sanitizeAiErrorMessage } from './aiUserFacingError'
import { edgeFunctionErrorMessage, readEdgeFunctionError } from './edgeFunctionError'
import { supabase } from './supabase'

export const EXTRACTION_RATE_LIMIT_MESSAGE =
  'Service IA momentanément saturé. Réessayez dans quelques minutes.'

export const EXTRACTION_FILE_MISSING_MESSAGE =
  "Le fichier n'est plus disponible — demandez au client de le renvoyer"

const PROCESSING_STALE_MS = 2 * 60_000

export function isExtractionFileMissingMessage(message: string | null | undefined): boolean {
  if (!message?.trim()) return false
  const lower = message.toLowerCase()
  return (
    lower.includes("n'est plus disponible") ||
    lower.includes('fichier manquant') ||
    lower.includes('file_missing') ||
    lower.includes('chemin de fichier absent')
  )
}

export function isExtractionRetryable(extraction: {
  status: string
  error_message: string | null
  checklist_item_id: string | null
}): boolean {
  if (extraction.status !== 'failed' || !extraction.checklist_item_id) return false
  return !isExtractionFileMissingMessage(extraction.error_message)
}

export type ExtractionStatus = 'processing' | 'pending_review' | 'validated' | 'rejected' | 'failed'
export type ExtractionDocumentType = 'identity' | 'kbis' | 'rib' | 'unknown'

export type ExtractionRecord = {
  id: string
  project_id: string
  checklist_item_id: string | null
  storage_path: string
  document_type: ExtractionDocumentType
  extracted_fields: Record<string, string | null> | null
  reviewed_fields: Record<string, string | null> | null
  field_confidence: Record<string, number> | null
  status: ExtractionStatus
  error_message: string | null
  created_at: string
  reviewed_at: string | null
  /** Dernier passage en processing — base du garde-fou 2 min. */
  processing_started_at?: string | null
}

export const DOCUMENT_TYPE_LABELS: Record<ExtractionDocumentType, string> = {
  identity: 'Pièce d’identité',
  kbis: 'Extrait Kbis',
  rib: 'RIB',
  unknown: 'Document non reconnu',
}

export const EXTRACTION_FIELD_LABELS: Record<string, string> = {
  document_subtype: 'Type de pièce',
  last_name: 'Nom',
  first_name: 'Prénom',
  birth_date: 'Date de naissance',
  document_number: 'Numéro de document',
  expiry_date: 'Date d’expiration',
  nationality: 'Nationalité',
  address: 'Adresse',
  company_name: 'Raison sociale',
  legal_form: 'Forme juridique',
  siren: 'SIREN',
  siret: 'SIRET',
  rcs_city: 'Ville RCS',
  registered_address: 'Siège social',
  share_capital: 'Capital social',
  main_activity: 'Activité principale',
  legal_representative_name: 'Représentant légal',
  registration_date: 'Date d’immatriculation',
  account_holder: 'Titulaire du compte',
  iban: 'IBAN',
  bic: 'BIC',
  bank_name: 'Banque',
}

export const EXTRACTION_SELECT =
  'id, project_id, checklist_item_id, storage_path, document_type, extracted_fields, reviewed_fields, field_confidence, status, error_message, created_at, reviewed_at, processing_started_at'

function processingClock(row: ExtractionRecord): number | null {
  const raw = row.processing_started_at
  if (!raw) return null
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Affichage : soft-fail local si processing_started_at > 2 min (sans toucher created_at). */
export function normalizeExtractionRows(
  rows: ExtractionRecord[],
  agencyId?: string | null,
): ExtractionRecord[] {
  const now = Date.now()
  const hasStale = rows.some((row) => {
    if (row.status !== 'processing') return false
    const started = processingClock(row)
    return started != null && now - started > PROCESSING_STALE_MS
  })
  if (hasStale && agencyId) {
    void supabase.rpc('finalize_stale_processing_extractions_for_agency', {
      p_agency_id: agencyId,
    })
  }
  return rows.map((row) => {
    if (row.status !== 'processing') return row
    const started = processingClock(row)
    if (started == null || now - started <= PROCESSING_STALE_MS) return row
    return {
      ...row,
      status: 'failed' as const,
      error_message: EXTRACTION_RATE_LIMIT_MESSAGE,
    }
  })
}

export async function fetchProjectExtractions(
  projectId: string,
  agencyId?: string | null,
): Promise<ExtractionRecord[]> {
  if (agencyId) {
    void supabase.rpc('finalize_stale_processing_extractions_for_agency', {
      p_agency_id: agencyId,
    })
  }
  const { data, error } = await supabase
    .from('extracted_document_data')
    .select(EXTRACTION_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return normalizeExtractionRows((data ?? []) as ExtractionRecord[], agencyId)
}

export async function validateExtraction(
  extractionId: string,
  reviewedFields: Record<string, string | null>,
): Promise<{ appliedToClient: boolean }> {
  const { data, error } = await supabase.functions.invoke('apply-extracted-data', {
    body: { extractionId, action: 'validate', reviewedFields },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return { appliedToClient: data?.appliedToClient === true }
}

export async function rejectExtraction(extractionId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('apply-extracted-data', {
    body: { extractionId, action: 'reject' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}

/**
 * Relance l'extraction pour une ligne failed.
 * Crédit consommé uniquement si l'extraction aboutit (côté Edge).
 * Ne passe PAS en processing côté client — l'EF valide d'abord puis finalise toujours.
 */
export async function retryDocumentExtraction(args: {
  projectId: string
  checklistItemId: string
  extractionId: string
}): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('token')
    .eq('id', args.projectId)
    .maybeSingle()
  if (projectError || !project?.token) {
    throw new Error('Projet introuvable pour relancer l’extraction.')
  }

  const { data, error } = await supabase.functions.invoke('extract-document-data', {
    body: {
      projectToken: project.token,
      checklistItemId: args.checklistItemId,
      extractionId: args.extractionId,
    },
  })
  if (error || data?.error) {
    const parsed = await readEdgeFunctionError(error, data)
    const raw = edgeFunctionErrorMessage(parsed)
    if (data?.code === 'file_missing' || isExtractionFileMissingMessage(raw)) {
      throw new Error(EXTRACTION_FILE_MISSING_MESSAGE)
    }
    throw new Error(sanitizeAiErrorMessage(raw))
  }
  if (data?.skipped && data?.reason) {
    throw new Error(sanitizeAiErrorMessage(String(data.reason)))
  }
}
