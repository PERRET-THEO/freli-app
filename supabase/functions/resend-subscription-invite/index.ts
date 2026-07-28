import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { Resend } from 'npm:resend'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'
import { createAuthAdminClient, sendUserInviteEmail } from '../_shared/authInviteEmail.ts'
import {
  createServiceClient,
  getAppUrl,
  isInviteAdminEmail,
} from '../_shared/saasBilling.ts'

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
    const body = (await req.json()) as { leadId?: string; email?: string }
    const leadId = typeof body.leadId === 'string' ? body.leadId : ''
    let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    const supabase = createServiceClient()
    if (leadId) {
      const { data: lead, error } = await supabase
        .from('subscription_leads')
        .select('id, email, status')
        .eq('id', leadId)
        .maybeSingle()
      if (error || !lead) return jsonResponse({ error: 'Lead not found' }, 404)
      email = String(lead.email).trim().toLowerCase()
      if (email.endsWith('@freli.local')) {
        return jsonResponse({ error: 'Lead email not yet known (checkout incomplete)' }, 400)
      }
    }

    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Invalid email' }, 400)
    }

    const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')
    const authAdmin = createAuthAdminClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const result = await sendUserInviteEmail(authAdmin, resend, email, getAppUrl())
    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status)
    }

    if (leadId) {
      await supabase
        .from('subscription_leads')
        .update({ status: 'invite_sent', updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .neq('status', 'account_linked')
    }

    return jsonResponse({ ok: true, email })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: message }, 500)
  }
})
