import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getGoogleOAuthRedirectUri,
  verifyOAuthState,
} from '../_shared/googleDrive.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

function redirectToIntegrations(params: Record<string, string>): Response {
  const url = new URL(`${appUrl}/dashboard/integrations`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  })
}

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const error = url.searchParams.get('error')
  if (error) {
    return redirectToIntegrations({ google: 'error', message: error })
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return redirectToIntegrations({ google: 'error', message: 'missing_code' })
  }

  if (!googleClientId || !googleClientSecret) {
    return redirectToIntegrations({ google: 'error', message: 'not_configured' })
  }

  const userId = await verifyOAuthState(state)
  if (!userId) {
    return redirectToIntegrations({ google: 'error', message: 'invalid_state' })
  }

  try {
    const redirectUri = getGoogleOAuthRedirectUri()
    const tokenParams = new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok) {
      throw new Error(tokens.error_description ?? tokens.error ?? 'Token exchange failed')
    }

    const accessToken = tokens.access_token as string
    const refreshToken = (tokens.refresh_token as string | undefined) ?? null
    const expiresIn = Number(tokens.expires_in ?? 3600)

    let googleEmail: string | undefined
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userRes.ok) {
        const info = await userRes.json()
        googleEmail = typeof info.email === 'string' ? info.email : undefined
      }
    } catch {
      /* optional */
    }

    const { data: existing } = await supabaseAdmin
      .from('integrations')
      .select('id, refresh_token, config')
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
      .maybeSingle()

    const prevConfig = (existing?.config ?? {}) as Record<string, unknown>
    const nextConfig = {
      ...prevConfig,
      folderPrefix: typeof prevConfig.folderPrefix === 'string' ? prevConfig.folderPrefix : 'Clients',
      connected: true,
      ...(googleEmail ? { google_email: googleEmail } : {}),
      token_expires_at: Date.now() + expiresIn * 1000,
    }

    const row = {
      user_id: userId,
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken ?? existing?.refresh_token ?? null,
      config: nextConfig,
    }

    if (existing?.id) {
      const { error: upErr } = await supabaseAdmin
        .from('integrations')
        .update(row)
        .eq('id', existing.id)
      if (upErr) throw new Error(upErr.message)
    } else {
      const { error: insErr } = await supabaseAdmin.from('integrations').insert(row)
      if (insErr) throw new Error(insErr.message)
    }

    return redirectToIntegrations({ google: 'return' })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('google-drive-oauth-callback:', message)
    return redirectToIntegrations({ google: 'error', message: encodeURIComponent(message.slice(0, 120)) })
  }
})
