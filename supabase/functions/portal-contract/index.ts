import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertProjectToken, corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type Body =
  | { action: 'getTemplatePdfUrl'; projectToken: string; templateId: string }
  | { action: 'getGeneratedDocumentPdfUrl'; projectToken: string; generatedDocumentId: string }
  | {
      action: 'uploadSigned'
      projectToken: string
      pdfBase64: string
      checklistItemId?: string
      signerName?: string
      signerEmail?: string
    }

type GeneratedDocumentRow = {
  id: string
  project_id: string
  agency_id: string
  status: string
  pdf_storage_path: string | null
  current_version: { title?: string } | null
  signature_page: number | null
  signature_x: number | null
  signature_y: number | null
  signature_width: number | null
  signature_height: number | null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Première IP de la chaîne de proxies, la seule non falsifiable côté edge. */
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first || null
}

function storagePathFromPdfUrl(pdfUrl: string): string | null {
  if (!pdfUrl.startsWith('http')) return pdfUrl
  const marker = '/storage/v1/object/public/contracts/'
  const idx = pdfUrl.indexOf(marker)
  if (idx === -1) {
    const signedMarker = '/storage/v1/object/sign/contracts/'
    const signedIdx = pdfUrl.indexOf(signedMarker)
    if (signedIdx === -1) return null
    return pdfUrl.slice(signedIdx + signedMarker.length).split('?')[0] ?? null
  }
  return pdfUrl.slice(idx + marker.length)
}

function parseGeneratedDocumentIdFromValue(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { generated_document_id?: string }
    return parsed.generated_document_id ?? null
  } catch {
    return null
  }
}

async function resolveProjectByToken(projectToken: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, agency_id, token')
    .eq('token', projectToken)
    .single()
  if (error || !data) return null
  return data
}

async function assertTemplateAccess(
  templateId: string,
  agencyId: string,
): Promise<{ pdf_url: string | null } | null> {
  const { data: template, error } = await supabase
    .from('contract_templates')
    .select('id, pdf_url, agency_id, is_default')
    .eq('id', templateId)
    .single()
  if (error || !template || template.agency_id !== agencyId) return null

  const { count: linkedCount } = await supabase
    .from('checklist_items')
    .select('id', { count: 'exact', head: true })
    .eq('contract_template_id', templateId)

  if ((linkedCount ?? 0) === 0 && !template.is_default) return null
  return template
}

async function assertGeneratedDocumentAccess(
  generatedDocumentId: string,
  projectId: string,
): Promise<GeneratedDocumentRow | null> {
  const { data: document, error } = await supabase
    .from('generated_documents')
    .select(
      'id, project_id, agency_id, status, pdf_storage_path, current_version, signature_page, signature_x, signature_y, signature_width, signature_height',
    )
    .eq('id', generatedDocumentId)
    .single()
  if (error || !document) return null
  if (document.project_id !== projectId) return null
  if (document.status !== 'finalized' || !document.pdf_storage_path) return null

  const { data: checklistItems, error: checklistError } = await supabase
    .from('checklist_items')
    .select('id, value')
    .eq('project_id', projectId)
    .eq('type', 'signature')

  if (checklistError || !checklistItems?.length) return null

  const linked = checklistItems.some(
    (item) => parseGeneratedDocumentIdFromValue(item.value as string | null) === generatedDocumentId,
  )
  if (!linked) return null

  return document as GeneratedDocumentRow
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()
    if (!rawBody?.trim()) return jsonResponse({ error: 'Body vide' }, 400)

    const body = JSON.parse(rawBody) as Body
    if (!body.projectToken?.trim()) {
      return jsonResponse({ error: 'Missing projectToken' }, 400)
    }

    const project = await resolveProjectByToken(body.projectToken.trim())
    if (!project) return jsonResponse({ error: 'Invalid project' }, 403)

    if (body.action === 'getTemplatePdfUrl') {
      if (!body.templateId) return jsonResponse({ error: 'Missing templateId' }, 400)

      const template = await assertTemplateAccess(body.templateId, project.agency_id)
      if (!template?.pdf_url) return jsonResponse({ error: 'Template not found' }, 404)

      const storagePath = storagePathFromPdfUrl(template.pdf_url)
      if (!storagePath) return jsonResponse({ error: 'Invalid template file' }, 400)

      const { data, error } = await supabase.storage
        .from('contracts')
        .createSignedUrl(storagePath, 3600)
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Signed URL failed')

      return jsonResponse({ signedUrl: data.signedUrl })
    }

    if (body.action === 'getGeneratedDocumentPdfUrl') {
      if (!body.generatedDocumentId) {
        return jsonResponse({ error: 'Missing generatedDocumentId' }, 400)
      }

      const document = await assertGeneratedDocumentAccess(body.generatedDocumentId, project.id)
      if (!document?.pdf_storage_path) {
        return jsonResponse({ error: 'Document not found' }, 404)
      }

      const { data, error } = await supabase.storage
        .from('contracts')
        .createSignedUrl(document.pdf_storage_path, 3600)
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Signed URL failed')

      const version = document.current_version as { title?: string } | null
      return jsonResponse({
        signedUrl: data.signedUrl,
        name: version?.title?.slice(0, 120) ?? 'Contrat',
        signature_page: document.signature_page ?? -1,
        signature_x: document.signature_x ?? 0.7,
        signature_y: document.signature_y ?? 0.85,
        signature_width: document.signature_width ?? 0.25,
        signature_height: document.signature_height ?? 0.08,
      })
    }

    if (body.action === 'uploadSigned') {
      if (!body.pdfBase64) return jsonResponse({ error: 'Missing pdfBase64' }, 400)

      const denied = await assertProjectToken(supabase, project.id, body.projectToken.trim())
      if (denied) return jsonResponse({ error: denied.error }, denied.status)

      const binary = Uint8Array.from(atob(body.pdfBase64), (c) => c.charCodeAt(0))
      const filePath = `documents/${body.projectToken.trim()}/signed_contract_${Date.now()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('contracts')
        .upload(filePath, binary, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error: signError } = await supabase.storage
        .from('contracts')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7)
      if (signError || !data?.signedUrl) throw new Error(signError?.message ?? 'Signed URL failed')

      // Preuve côté serveur : le client ne peut ni l'écrire ni la modifier.
      const { error: proofError } = await supabase.from('contract_signature_events').insert({
        project_id: project.id,
        checklist_item_id: body.checklistItemId ?? null,
        signer_name: body.signerName ?? null,
        signer_email: body.signerEmail ?? null,
        ip_address: clientIp(req),
        user_agent: req.headers.get('user-agent'),
        document_sha256: await sha256Hex(binary),
        storage_path: filePath,
      })
      if (proofError) console.error('signature proof insert failed:', proofError.message)

      return jsonResponse({ signedUrl: data.signedUrl, storagePath: filePath })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('portal-contract error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
