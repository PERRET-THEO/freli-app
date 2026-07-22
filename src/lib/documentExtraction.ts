import { supabase } from './supabase'

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
  status: ExtractionStatus
  error_message: string | null
  created_at: string
  reviewed_at: string | null
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
  'id, project_id, checklist_item_id, storage_path, document_type, extracted_fields, reviewed_fields, status, error_message, created_at, reviewed_at'

export async function fetchProjectExtractions(projectId: string): Promise<ExtractionRecord[]> {
  const { data, error } = await supabase
    .from('extracted_document_data')
    .select(EXTRACTION_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as ExtractionRecord[]
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
