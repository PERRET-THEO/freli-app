import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function isInternalRequest(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (!secret) return false
  return (
    req.headers.get('x-cron-secret') === secret ||
    req.headers.get('x-internal-secret') === secret
  )
}

export async function getAuthenticatedUser(
  req: Request,
): Promise<{ id: string; email?: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return null

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser()
  if (error || !user) return null
  return { id: user.id, email: user.email }
}

export async function assertUserOwnsProject(
  supabaseAdmin: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<{ error: string; status: number } | null> {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('id, agencies(user_id)')
    .eq('id', projectId)
    .single()
  if (error || !project) return { error: 'Project not found', status: 404 }

  const agenciesRel = project.agencies as { user_id?: string } | { user_id?: string }[] | null
  const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
  if (agencyRow?.user_id !== userId) return { error: 'Forbidden', status: 403 }
  return null
}

export async function assertProjectToken(
  supabaseAdmin: SupabaseClient,
  projectId: string,
  projectToken: string,
): Promise<{ error: string; status: number } | null> {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('token')
    .eq('id', projectId)
    .single()
  if (error || !project) return { error: 'Project not found', status: 404 }
  if (project.token !== projectToken) return { error: 'Forbidden', status: 403 }
  return null
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function internalSecretHeaders(): Record<string, string> {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  return secret ? { 'x-internal-secret': secret } : {}
}
