/**
 * Agence : révéler ou copier un secret (journalisé).
 * Body: { itemId, action: 'reveal' | 'copy' }
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
  decryptSecretPayload,
  hexToBytes,
  isSafeLoginUrl,
  NO_STORE_HEADERS,
  REVEAL_RATE_LIMIT,
  REVEAL_RATE_WINDOW_MS,
  SecretsKeyError,
  type SecretPayload,
} from '../_shared/checklistSecrets.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

function sanitizeForClient(payload: SecretPayload): SecretPayload {
  if ('legacy' in payload) return { legacy: payload.legacy }
  const out: SecretPayload = { username: payload.username, password: payload.password }
  if (payload.loginUrl && isSafeLoginUrl(payload.loginUrl)) {
    ;(out as { username: string; password: string; loginUrl?: string }).loginUrl = payload.loginUrl
  }
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as { itemId?: string; action?: string }
    const itemId = body.itemId?.trim() ?? ''
    const action = body.action === 'copy' ? 'copy' : body.action === 'reveal' ? 'reveal' : null
    if (!itemId || !action) {
      return jsonResponse({ error: 'itemId et action (reveal|copy) requis' }, 400)
    }

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type, label, value')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item) return jsonResponse({ error: 'Item introuvable' }, 404)
    if (item.type !== 'credentials') {
      return jsonResponse({ error: 'Item non credentials' }, 400)
    }

    const ownership = await assertUserOwnsProject(supabase, user.id, item.project_id)
    if (ownership) return jsonResponse({ error: ownership.error }, ownership.status)

    if (item.value === 'cleared') {
      return new Response(
        JSON.stringify({ error: 'Secret effacé — plus rien à afficher', code: 'cleared' }),
        {
          status: 410,
          headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
        },
      )
    }

    const since = new Date(Date.now() - REVEAL_RATE_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('client_activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', item.project_id)
      .in('event_type', ['secret.reveal', 'secret.copy'])
      .gte('occurred_at', since)
      .contains('metadata', { checklist_item_id: itemId, actor_user_id: user.id })

    if ((count ?? 0) >= REVEAL_RATE_LIMIT) {
      return jsonResponse({ error: 'Trop de consultations — réessayez dans quelques minutes', code: 'rate' }, 429)
    }

    const { data: secret, error: secretError } = await supabase
      .from('checklist_item_secrets')
      .select('ciphertext, nonce, key_version')
      .eq('checklist_item_id', itemId)
      .maybeSingle()

    if (secretError) return jsonResponse({ error: secretError.message }, 500)
    if (!secret) {
      return new Response(
        JSON.stringify({ error: 'Secret effacé — plus rien à afficher', code: 'cleared' }),
        {
          status: 410,
          headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
        },
      )
    }

    let plaintext: SecretPayload
    try {
      const cipherBytes =
        typeof secret.ciphertext === 'string'
          ? hexToBytes(secret.ciphertext)
          : new Uint8Array(secret.ciphertext as ArrayBuffer)
      const nonceBytes =
        typeof secret.nonce === 'string'
          ? hexToBytes(secret.nonce)
          : new Uint8Array(secret.nonce as ArrayBuffer)
      plaintext = await decryptSecretPayload(
        cipherBytes,
        nonceBytes,
        item.id,
        item.project_id,
        secret.key_version ?? 1,
      )
    } catch (err) {
      if (err instanceof SecretsKeyError) {
        return jsonResponse({ error: 'Déchiffrement indisponible', code: 'secrets_key' }, 503)
      }
      console.error('reveal decrypt failed')
      return jsonResponse({ error: 'Déchiffrement impossible' }, 500)
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, agency_id, client_id, client_name')
      .eq('id', item.project_id)
      .single()

    if (project?.agency_id && project?.client_id) {
      const eventType = action === 'copy' ? 'secret.copy' : 'secret.reveal'
      const title =
        action === 'copy'
          ? `Secret copié — ${item.label}`
          : `Secret consulté — ${item.label}`
      await supabase.from('client_activity_events').insert({
        agency_id: project.agency_id,
        client_id: project.client_id,
        project_id: project.id,
        event_type: eventType,
        title,
        metadata: {
          checklist_item_id: item.id,
          item_label: item.label,
          actor_user_id: user.id,
        },
      })
    }

    return new Response(JSON.stringify({ action, credentials: sanitizeForClient(plaintext) }), {
      status: 200,
      headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('reveal-checklist-credentials error', err instanceof Error ? err.message : 'unknown')
    return jsonResponse({ error: 'Erreur serveur' }, 500)
  }
})
