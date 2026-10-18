/**
 * Batch one-shot : text items matching legacy label regex → credentials { legacy }.
 * Auth : CRON_SECRET / x-internal-secret uniquement.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, isInternalRequest, jsonResponse } from '../_shared/functionAuth.ts'
import {
  bytesToHex,
  encryptSecretPayload,
  LEGACY_LABEL_REGEX,
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
    if (!isInternalRequest(req)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const { data: candidates, error } = await supabase
      .from('checklist_items')
      .select('id, project_id, label, type, value, completed')
      .eq('type', 'text')
      .not('value', 'is', null)

    if (error) return jsonResponse({ error: error.message }, 500)

    const matched = (candidates ?? []).filter(
      (row) =>
        typeof row.value === 'string' &&
        row.value.trim().length > 0 &&
        LEGACY_LABEL_REGEX.test(String(row.label ?? '')),
    )

    let migrated = 0
    let skipped = 0
    let failed = 0

    for (const row of matched) {
      const { data: existing } = await supabase
        .from('checklist_item_secrets')
        .select('checklist_item_id')
        .eq('checklist_item_id', row.id)
        .maybeSingle()
      if (existing) {
        skipped += 1
        continue
      }

      try {
        const encrypted = await encryptSecretPayload(
          { legacy: String(row.value).trim() },
          row.id,
          row.project_id,
        )
        const now = new Date().toISOString()
        const { error: insertError } = await supabase.from('checklist_item_secrets').insert({
          checklist_item_id: row.id,
          project_id: row.project_id,
          ciphertext: bytesToHex(encrypted.ciphertext),
          nonce: bytesToHex(encrypted.nonce),
          key_version: encrypted.keyVersion,
          updated_at: now,
        })
        if (insertError) {
          failed += 1
          continue
        }
        const { error: updateError } = await supabase
          .from('checklist_items')
          .update({
            type: 'credentials',
            value: row.completed ? 'submitted' : null,
          })
          .eq('id', row.id)
        if (updateError) {
          await supabase.from('checklist_item_secrets').delete().eq('checklist_item_id', row.id)
          failed += 1
          continue
        }
        migrated += 1
      } catch (err) {
        if (err instanceof SecretsKeyError) {
          return jsonResponse({ error: 'Chiffrement indisponible', code: 'secrets_key' }, 503)
        }
        failed += 1
      }
    }

    return new Response(
      JSON.stringify({
        scanned: candidates?.length ?? 0,
        matched: matched.length,
        migrated,
        skipped,
        failed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('migrate-legacy-credentials error', err instanceof Error ? err.message : 'unknown')
    return jsonResponse({ error: 'Erreur serveur' }, 500)
  }
})
