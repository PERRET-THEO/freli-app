/**
 * Portail client : URL d'upload signée pour un item fichier.
 * Auth par projectToken. Rate-limit 30/h/token.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  buildDocumentStoragePath,
  isAllowedMime,
  MAX_DOCUMENT_BYTES,
  parseDeclaredFileSize,
  resolveMimeType,
} from '../_shared/documentPaths.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as {
      projectToken?: string
      itemId?: string
      filename?: string
      contentType?: string
      /** Taille déclarée — front envoie `size` (et alias fileSize). */
      size?: number | string
      fileSize?: number | string
      file_size?: number | string
    }

    const projectToken = body.projectToken?.trim() ?? ''
    const itemId = body.itemId?.trim() ?? ''
    const filename = body.filename?.trim() ?? ''
    if (!projectToken || projectToken.length < 16 || !itemId || !filename) {
      return jsonResponse({ error: 'projectToken, itemId et filename requis' }, 400)
    }

    const declaredSize = parseDeclaredFileSize(body)
    if (declaredSize === null) {
      return jsonResponse({ error: 'Taille de fichier manquante ou invalide', code: 'size' }, 400)
    }
    if (declaredSize > MAX_DOCUMENT_BYTES) {
      return jsonResponse({ error: 'Fichier trop volumineux (max 10 Mo)', code: 'size' }, 400)
    }

    const mime = resolveMimeType(filename, body.contentType)
    if (!isAllowedMime(mime)) {
      return jsonResponse(
        { error: 'Type de fichier non autorisé (pdf, png, jpg, zip)', code: 'mime' },
        400,
      )
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, token')
      .eq('token', projectToken)
      .maybeSingle()
    if (projectError || !project) return jsonResponse({ error: 'Forbidden' }, 403)

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item || item.project_id !== project.id) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    if (item.type !== 'file') {
      return jsonResponse({ error: 'Item non fichier' }, 400)
    }

    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('portal_rate_events')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'document_upload')
      .eq('subject', projectToken)
      .gte('created_at', since)
    if ((count ?? 0) >= RATE_LIMIT) {
      return jsonResponse({ error: 'Trop d’uploads — réessayez plus tard', code: 'rate' }, 429)
    }

    const path = buildDocumentStoragePath(project.id, item.id, filename)
    const { data: signed, error: signError } = await supabase.storage
      .from('documents')
      .createSignedUploadUrl(path)
    if (signError || !signed) {
      return jsonResponse({ error: signError?.message ?? 'Signed upload failed' }, 500)
    }

    await supabase.from('portal_rate_events').insert({
      kind: 'document_upload',
      subject: projectToken,
    })

    return new Response(
      JSON.stringify({
        path,
        token: signed.token,
        signedUrl: signed.signedUrl,
        contentType: mime,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    console.error('portal-document-upload-url:', (error as Error).message)
    return jsonResponse({ error: 'Upload unavailable' }, 500)
  }
})
