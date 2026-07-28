import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'
import { createServiceClient, isInviteAdminEmail } from '../_shared/saasBilling.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const user = await getAuthenticatedUser(req)
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
  if (!isInviteAdminEmail(user.email)) return jsonResponse({ error: 'Forbidden' }, 403)

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('subscription_leads')
      .select(
        'id, email, source, billing_interval, checkout_session_id, status, agency_id, created_at, updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return jsonResponse({ error: error.message }, 500)
    return jsonResponse({ ok: true, leads: data ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: message }, 500)
  }
})
