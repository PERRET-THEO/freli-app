import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { createAuthAdminClient, sendUserInviteEmail } from '../_shared/authInviteEmail.ts'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'

/**
 * Invite un collaborateur dans l'agence du caller (owner uniquement).
 * - Nouvel email : invitation Auth + siège member.
 * - Compte déjà existant : ajout direct du siège member.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabaseAdmin = createAuthAdminClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error) return null
  return data?.user?.id ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const body = (await req.json()) as { email?: string }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return jsonResponse({ error: 'Email invalide' }, 400)
    }
    if ((user.email ?? '').trim().toLowerCase() === email) {
      return jsonResponse({ error: 'Vous êtes déjà membre de cette agence.' }, 400)
    }

    const { data: ownership } = await supabaseAdmin
      .from('agencies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    let agencyId = ownership?.id as string | undefined
    if (!agencyId) {
      const { data: membership } = await supabaseAdmin
        .from('agency_members')
        .select('agency_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()
      agencyId = membership?.agency_id
    }

    if (!agencyId) {
      return jsonResponse({ error: 'Seul le propriétaire peut inviter des membres.' }, 403)
    }

    let targetUserId = await resolveUserIdByEmail(email)
    let invited = false

    if (!targetUserId) {
      const invite = await sendUserInviteEmail(supabaseAdmin, resend, email, appUrl)
      if (!invite.ok) {
        // Compte déjà enregistré : on récupère l'id via magiclink.
        if (invite.status === 409) {
          targetUserId = await resolveUserIdByEmail(email)
        } else {
          return jsonResponse({ error: invite.error }, invite.status)
        }
      } else {
        invited = true
        targetUserId = await resolveUserIdByEmail(email)
      }
    }

    if (!targetUserId) {
      return jsonResponse({ error: 'Impossible de rattacher ce collaborateur.' }, 500)
    }

    const { error: memberError } = await supabaseAdmin.from('agency_members').upsert(
      {
        agency_id: agencyId,
        user_id: targetUserId,
        role: 'member',
        email,
      },
      { onConflict: 'agency_id,user_id' },
    )

    if (memberError) {
      return jsonResponse({ error: memberError.message }, 400)
    }

    return jsonResponse({ ok: true, email, agencyId, invited })
  } catch (error) {
    console.error('invite-agency-member error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
