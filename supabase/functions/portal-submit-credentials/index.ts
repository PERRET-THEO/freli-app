/**
 * Portail : soumission / remplacement d'identifiants chiffrés.
 * Auth par projectToken. Jamais via portal_update_checklist_item.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  bytesToHex,
  encryptSecretPayload,
  NO_STORE_HEADERS,
  SecretsKeyError,
  validateCredentialsBody,
} from '../_shared/checklistSecrets.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as {
      projectToken?: string
      itemId?: string
      username?: string
      password?: string
      loginUrl?: string
    }

    const projectToken = body.projectToken?.trim() ?? ''
    const itemId = body.itemId?.trim() ?? ''
    if (!projectToken || projectToken.length < 16 || !itemId) {
      return jsonResponse({ error: 'projectToken et itemId requis' }, 400)
    }

    let payload
    try {
      payload = validateCredentialsBody(body)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid'
      if (msg === 'invalid_login_url') {
        return jsonResponse({ error: 'URL de connexion invalide (http/https uniquement)', code: 'login_url' }, 400)
      }
      if (msg === 'username_required') {
        return jsonResponse({ error: 'Identifiant requis', code: 'username' }, 400)
      }
      if (msg === 'password_required') {
        return jsonResponse({ error: 'Mot de passe requis', code: 'password' }, 400)
      }
      return jsonResponse({ error: 'Payload invalide' }, 400)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, token, status, client_id, agency_id')
      .eq('token', projectToken)
      .maybeSingle()
    if (projectError || !project) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type, label')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item || item.project_id !== project.id) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    if (item.type !== 'credentials') {
      return jsonResponse({ error: 'Item non credentials' }, 400)
    }

    let encrypted
    try {
      encrypted = await encryptSecretPayload(payload, item.id, project.id)
    } catch (err) {
      if (err instanceof SecretsKeyError) {
        return jsonResponse({ error: 'Chiffrement indisponible', code: 'secrets_key' }, 503)
      }
      throw err
    }

    const now = new Date().toISOString()
    const { error: upsertError } = await supabase.from('checklist_item_secrets').upsert(
      {
        checklist_item_id: item.id,
        project_id: project.id,
        ciphertext: bytesToHex(encrypted.ciphertext),
        nonce: bytesToHex(encrypted.nonce),
        key_version: encrypted.keyVersion,
        updated_at: now,
      },
      { onConflict: 'checklist_item_id' },
    )
    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500)
    }

    const { data: updated, error: updateError } = await supabase
      .from('checklist_items')
      .update({
        value: 'submitted',
        completed: true,
        review_status: 'pending',
        review_note: null,
        submitted_at: now,
        reviewed_at: null,
      })
      .eq('id', item.id)
      .select('id, label, type, completed, value, order_index, review_status, review_note, config')
      .single()
    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500)
    }

    if (item.label?.trim()) {
      await supabase
        .from('smart_reminders')
        .update({ status: 'dismissed' })
        .eq('project_id', project.id)
        .eq('status', 'draft')
        .ilike('blocking_step_label', item.label.trim())
    }

    const { data: siblings } = await supabase
      .from('checklist_items')
      .select('completed, review_status')
      .eq('project_id', project.id)

    const allDone =
      (siblings?.length ?? 0) > 0 &&
      (siblings ?? []).every(
        (row) => row.completed && (row.review_status ?? 'pending') !== 'rejected',
      )
    const anyDone = (siblings ?? []).some((row) => row.completed)

    let projectStatus = project.status as string
    let projectJustCompleted = false
    if (allDone && project.status !== 'completed') {
      await supabase.from('projects').update({ status: 'completed' }).eq('id', project.id)
      await supabase.from('project_completion_jobs').upsert(
        { project_id: project.id, token: projectToken },
        { onConflict: 'project_id', ignoreDuplicates: true },
      )
      projectStatus = 'completed'
      projectJustCompleted = true
    } else if (anyDone && project.status !== 'completed') {
      await supabase.from('projects').update({ status: 'in_progress' }).eq('id', project.id)
      projectStatus = 'in_progress'
    }

    return new Response(
      JSON.stringify({
        item: updated,
        projectStatus,
        projectJustCompleted,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...NO_STORE_HEADERS,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (err) {
    console.error('portal-submit-credentials error', err instanceof Error ? err.message : 'unknown')
    return jsonResponse({ error: 'Erreur serveur' }, 500)
  }
})
