/**
 * Agence : convertir un item texte (valeur en clair) en credentials chiffré { legacy }.
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
  bytesToHex,
  encryptSecretPayload,
  NO_STORE_HEADERS,
  SecretsKeyError,
} from '../_shared/checklistSecrets.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as { itemId?: string }
    const itemId = body.itemId?.trim() ?? ''
    if (!itemId) return jsonResponse({ error: 'itemId requis' }, 400)

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type, label, value, completed')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item) return jsonResponse({ error: 'Item introuvable' }, 404)
    if (item.type !== 'text') {
      return jsonResponse({ error: 'Seuls les items texte peuvent être convertis' }, 400)
    }
    const plaintext = (item.value ?? '').trim()
    if (!plaintext) {
      return jsonResponse({ error: 'Aucune valeur à convertir' }, 400)
    }

    const ownership = await assertUserOwnsProject(supabase, user.id, item.project_id)
    if (ownership) return jsonResponse({ error: ownership.error }, ownership.status)

    const { data: existing } = await supabase
      .from('checklist_item_secrets')
      .select('checklist_item_id')
      .eq('checklist_item_id', itemId)
      .maybeSingle()
    if (existing) {
      return jsonResponse({ error: 'Secret déjà présent pour cet item' }, 409)
    }

    let encrypted
    try {
      encrypted = await encryptSecretPayload(
        { legacy: plaintext },
        item.id,
        item.project_id,
      )
    } catch (err) {
      if (err instanceof SecretsKeyError) {
        return jsonResponse({ error: 'Chiffrement indisponible', code: 'secrets_key' }, 503)
      }
      throw err
    }

    const now = new Date().toISOString()
    const { error: upsertError } = await supabase.from('checklist_item_secrets').insert({
      checklist_item_id: item.id,
      project_id: item.project_id,
      ciphertext: bytesToHex(encrypted.ciphertext),
      nonce: bytesToHex(encrypted.nonce),
      key_version: encrypted.keyVersion,
      updated_at: now,
    })
    if (upsertError) return jsonResponse({ error: upsertError.message }, 500)

    const sentinel = item.completed ? 'submitted' : null
    const { data: updated, error: updateError } = await supabase
      .from('checklist_items')
      .update({ type: 'credentials', value: sentinel })
      .eq('id', item.id)
      .select('id, label, type, completed, value, review_status, review_note, config')
      .single()
    if (updateError) {
      // rollback secret if type update fails
      await supabase.from('checklist_item_secrets').delete().eq('checklist_item_id', item.id)
      return jsonResponse({ error: updateError.message }, 500)
    }

    return new Response(JSON.stringify({ item: updated }), {
      status: 200,
      headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('convert-checklist-text-to-credentials error', err instanceof Error ? err.message : 'unknown')
    return jsonResponse({ error: 'Erreur serveur' }, 500)
  }
})
