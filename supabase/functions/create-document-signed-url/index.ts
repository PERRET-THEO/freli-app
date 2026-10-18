/**
 * Agence : signed GET URL courte pour un fichier documents.
 * Résout project via path (nouveau ou legacy token/) puis membership.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import {
  assertSafeStoragePath,
  normalizeDocumentValueToPath,
  SIGNED_URL_TTL_SECONDS,
} from '../_shared/documentPaths.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function resolveProjectIdFromPath(path: string): Promise<string | null> {
  const first = path.split('/')[0] ?? ''
  if (UUID_RE.test(first)) {
    const { data } = await supabase.from('projects').select('id').eq('id', first).maybeSingle()
    if (data?.id) return data.id
  }
  // Legacy : premier segment = token portail
  const { data: byToken } = await supabase
    .from('projects')
    .select('id')
    .eq('token', first)
    .maybeSingle()
  return byToken?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as { path?: string }
    const raw = body.path?.trim() ?? ''
    if (!raw) return jsonResponse({ error: 'path requis' }, 400)

    const path = normalizeDocumentValueToPath(raw) ?? raw
    if (path.startsWith('http') || !assertSafeStoragePath(path)) {
      return jsonResponse({ error: 'Chemin invalide' }, 400)
    }

    const projectId = await resolveProjectIdFromPath(path)
    if (!projectId) return jsonResponse({ error: 'Forbidden' }, 403)

    const denied = await assertUserOwnsProject(supabase, user.id, projectId)
    if (denied) return jsonResponse({ error: denied.error }, denied.status)

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      return jsonResponse({ error: error?.message ?? 'Signed URL failed' }, 404)
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('create-document-signed-url:', (error as Error).message)
    return jsonResponse({ error: 'Unavailable' }, 500)
  }
})
