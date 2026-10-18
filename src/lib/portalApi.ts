import { supabase } from './supabase'
import type { ChecklistItemConfig } from './checklistFields'
import type { ChecklistItemType } from './checklist'
import type { ReviewStatus } from './checklistReview'

export type PortalLoadedItem = {
  id: string
  label: string
  type: ChecklistItemType
  completed: boolean
  value: string | null
  order_index: number
  review_status: ReviewStatus | null
  review_note: string | null
  config: ChecklistItemConfig | null
}

export type PortalLoadedProject = {
  id: string
  client_name: string
  client_email?: string | null
  status: 'pending' | 'in_progress' | 'completed'
  agency_id?: string | null
  price?: number | null
  payment_status?: string | null
  stripe_checkout_url?: string | null
}

export type PortalBranding = {
  logo_url: string | null
  name?: string | null
  brand_color?: string | null
  portal_welcome_message?: string | null
  tagline?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  portal_help_title?: string | null
  portal_help_text?: string | null
  portal_availability?: string | null
  portfolio_url?: string | null
  portfolio_label?: string | null
}

export type PortalLoadResult = {
  project: PortalLoadedProject
  items: PortalLoadedItem[]
  branding: PortalBranding | null
}

export async function portalLoadByToken(token: string): Promise<PortalLoadResult> {
  const { data, error } = await supabase.rpc('portal_load_by_token', { p_token: token })
  if (error) throw new Error(error.message)
  const payload = data as {
    project: PortalLoadedProject
    items: PortalLoadedItem[]
    branding: PortalBranding | null
  }
  if (!payload?.project?.id) throw new Error('Projet introuvable pour ce lien.')
  return {
    project: payload.project,
    items: payload.items ?? [],
    branding: payload.branding ?? null,
  }
}

export async function portalTouchVisit(token: string): Promise<void> {
  await supabase.rpc('portal_touch_visit', { p_token: token })
}

/** Portail : uniquement in_progress (jamais completed). */
export async function portalSetProjectStatus(
  token: string,
  status: 'in_progress',
): Promise<void> {
  const { error } = await supabase.rpc('portal_set_project_status', {
    p_token: token,
    p_status: status,
  })
  if (error) throw new Error(error.message)
}

export type PortalUpdateResult = {
  item: PortalLoadedItem
  projectStatus: PortalLoadedProject['status']
  projectJustCompleted: boolean
}

export async function portalUpdateChecklistItem(
  token: string,
  itemId: string,
  payload: {
    value?: string | null
    completed?: boolean
    submitted_at?: string
  },
): Promise<PortalUpdateResult> {
  const { data, error } = await supabase.rpc('portal_update_checklist_item', {
    p_token: token,
    p_item_id: itemId,
    p_payload: payload,
  })
  if (error) throw new Error(error.message)
  const payloadOut = data as {
    item: PortalLoadedItem
    project_status: PortalLoadedProject['status']
    project_just_completed: boolean
  }
  return {
    item: payloadOut.item,
    projectStatus: payloadOut.project_status,
    projectJustCompleted: Boolean(payloadOut.project_just_completed),
  }
}

/** Déclenche email + intégrations côté serveur (status doit déjà être completed). */
export async function processPortalProjectCompletion(params: {
  projectId: string
  projectToken: string
}): Promise<{ results?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('process-project-completion', {
    body: params,
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return { results: (data?.results as Record<string, unknown> | undefined) ?? {} }
}

export class PortalUploadError extends Error {
  readonly code: 'mime' | 'size' | 'rate' | 'server'
  constructor(code: PortalUploadError['code'], message: string) {
    super(message)
    this.code = code
  }
}

function uploadErrorFromPayload(payload: { code?: string; error?: string } | null): PortalUploadError {
  const code = payload?.code
  if (code === 'mime') {
    return new PortalUploadError('mime', 'Type de fichier non accepté (PDF, PNG, JPG ou ZIP).')
  }
  if (code === 'size') {
    return new PortalUploadError('size', 'Fichier trop volumineux (maximum 10 Mo).')
  }
  if (code === 'rate') {
    return new PortalUploadError('rate', 'Trop d’envois — réessayez dans un moment.')
  }
  return new PortalUploadError(
    'server',
    payload?.error ? String(payload.error) : 'Upload indisponible pour le moment.',
  )
}

async function readInvokeErrorBody(error: unknown): Promise<{ code?: string; error?: string } | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    return (await ctx.json()) as { code?: string; error?: string }
  } catch {
    return null
  }
}

export async function requestPortalDocumentUpload(params: {
  projectToken: string
  itemId: string
  file: File
}): Promise<{ path: string; signedUrl: string; token: string }> {
  if (params.file.size > 10 * 1024 * 1024) {
    throw new PortalUploadError('size', 'Fichier trop volumineux (maximum 10 Mo).')
  }

  const { data, error } = await supabase.functions.invoke('portal-document-upload-url', {
    body: {
      projectToken: params.projectToken,
      itemId: params.itemId,
      filename: params.file.name,
      contentType: params.file.type,
      // Nom canonique attendu par l'EF (+ alias fileSize pour compat).
      size: params.file.size,
      fileSize: params.file.size,
    },
  })

  if (error) {
    const body = (await readInvokeErrorBody(error)) ?? (data as { code?: string; error?: string } | null)
    throw uploadErrorFromPayload(body)
  }

  const payload = data as { code?: string; error?: string; path?: string; token?: string; signedUrl?: string }
  if (payload?.error || payload?.code) {
    throw uploadErrorFromPayload(payload)
  }
  if (!payload?.path || !payload?.token) {
    throw new PortalUploadError('server', 'Upload indisponible pour le moment.')
  }
  return {
    path: String(payload.path),
    signedUrl: String(payload.signedUrl ?? ''),
    token: String(payload.token),
  }
}

export async function uploadPortalDocumentFile(file: File, uploadToken: string, path: string) {
  const { error } = await supabase.storage.from('documents').uploadToSignedUrl(path, uploadToken, file, {
    contentType: file.type || undefined,
    upsert: true,
  })
  if (error) throw new Error(error.message)
}
