import { supabase } from './supabase'

export type DocumentSectionOrigin = 'brief' | 'model' | 'ai_generated'

export type DocumentSection = {
  id: string
  heading: string
  content: string
  origin: DocumentSectionOrigin
  needs_legal_review: boolean
}

export type DocumentVersion = {
  title: string
  sections: DocumentSection[]
}

export type GeneratedDocumentRecord = {
  id: string
  project_id: string
  brief: string
  ai_version: DocumentVersion
  current_version: DocumentVersion
  status: 'draft' | 'finalized'
  contract_template_id: string | null
  created_at: string
  finalized_at: string | null
}

export type AgencyDocumentModel = {
  id: string
  name: string
  storage_path: string
  structure_summary: Record<string, unknown> | null
  layout_profile: Record<string, unknown> | null
  created_at: string
}

export const MAX_REFERENCE_MODELS = 3

const GENERATED_SELECT =
  'id, project_id, brief, ai_version, current_version, status, contract_template_id, created_at, finalized_at'

export async function fetchProjectGeneratedDocuments(
  projectId: string,
): Promise<GeneratedDocumentRecord[]> {
  const { data, error } = await supabase
    .from('generated_documents')
    .select(GENERATED_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as GeneratedDocumentRecord[]
}

export async function generateContractDraft(
  projectId: string,
  brief: string,
  checklistContext?: string[],
): Promise<{ documentId: string }> {
  const { data, error } = await supabase.functions.invoke('generate-contract-draft', {
    body: { projectId, brief, checklistContext },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return { documentId: String(data.documentId) }
}

export async function regenerateContractDraft(
  projectId: string,
  brief: string,
  draftDocumentIds: string[],
  checklistContext?: string[],
): Promise<{ documentId: string }> {
  for (const documentId of draftDocumentIds) {
    await deleteGeneratedDocument(documentId)
  }
  return generateContractDraft(projectId, brief, checklistContext)
}

/** Sauvegarde de la version éditée (RLS : l'agence ne modifie que ses brouillons). */
export async function saveCurrentVersion(
  documentId: string,
  version: DocumentVersion,
): Promise<void> {
  const { error } = await supabase
    .from('generated_documents')
    .update({ current_version: version })
    .eq('id', documentId)
    .eq('status', 'draft')
  if (error) throw new Error(error.message)
}

export async function finalizeGeneratedDocument(
  documentId: string,
): Promise<{ contractTemplateId: string }> {
  const { data, error } = await supabase.functions.invoke('finalize-generated-document', {
    body: { documentId },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return { contractTemplateId: String(data.contractTemplateId) }
}

/** Aperçu HTML du contrat avant finalisation PDF. */
export async function previewGeneratedDocument(
  documentId: string,
  version?: DocumentVersion,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('preview-generated-document', {
    body: { documentId, version },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  if (!data?.html || typeof data.html !== 'string') {
    throw new Error('Aperçu indisponible')
  }
  return data.html
}

export async function deleteGeneratedDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('generated_documents').delete().eq('id', documentId)
  if (error) throw new Error(error.message)
}

// --- Modèles de référence ---

export async function fetchAgencyDocumentModels(agencyId: string): Promise<AgencyDocumentModel[]> {
  const { data, error } = await supabase
    .from('agency_document_models')
    .select('id, name, storage_path, structure_summary, layout_profile, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as AgencyDocumentModel[]
}

/** Upload d'un modèle de référence + analyse de sa structure par l'IA. */
export async function uploadAgencyDocumentModel(
  agencyId: string,
  file: File,
): Promise<AgencyDocumentModel> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `models/${agencyId}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(`Upload échoué : ${uploadError.message}`)

  const { data: inserted, error: insertError } = await supabase
    .from('agency_document_models')
    .insert({
      agency_id: agencyId,
      name: file.name.replace(/\.pdf$/i, ''),
      storage_path: storagePath,
    })
    .select('id, name, storage_path, structure_summary, layout_profile, created_at')
    .single()
  if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insertion échouée')

  const { data, error } = await supabase.functions.invoke('analyze-contract-model', {
    body: { modelId: inserted.id },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))

  return {
    ...(inserted as AgencyDocumentModel),
    structure_summary: (data?.structureSummary as Record<string, unknown>) ?? null,
    layout_profile: (data?.layoutProfile as Record<string, unknown>) ?? null,
  }
}

export async function deleteAgencyDocumentModel(model: AgencyDocumentModel): Promise<void> {
  await supabase.storage.from('contracts').remove([model.storage_path])
  const { error } = await supabase.from('agency_document_models').delete().eq('id', model.id)
  if (error) throw new Error(error.message)
}
