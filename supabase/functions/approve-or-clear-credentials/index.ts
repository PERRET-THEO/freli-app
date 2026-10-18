/**
 * Agence : approve et/ou clear secret (transaction SQL).
 * Body: { itemId, action: 'approve' | 'clear' }
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { NO_STORE_HEADERS } from '../_shared/checklistSecrets.ts'

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

    const body = (await req.json()) as { itemId?: string; action?: string }
    const itemId = body.itemId?.trim() ?? ''
    const action = body.action === 'approve' || body.action === 'clear' ? body.action : null
    if (!itemId || !action) {
      return jsonResponse({ error: 'itemId et action (approve|clear) requis' }, 400)
    }

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type, label, value, config')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError || !item) return jsonResponse({ error: 'Item introuvable' }, 404)
    if (item.type !== 'credentials') {
      return jsonResponse({ error: 'Item non credentials' }, 400)
    }

    const ownership = await assertUserOwnsProject(supabase, user.id, item.project_id)
    if (ownership) return jsonResponse({ error: ownership.error }, ownership.status)

    const config = (item.config ?? {}) as { eraseSecretOnApprove?: boolean }
    const erase =
      action === 'clear' ? true : Boolean(config.eraseSecretOnApprove)

    // Idempotent clear : déjà cleared + pas de secret → 200 no-op
    if (action === 'clear' && item.value === 'cleared') {
      const { data: existing } = await supabase
        .from('checklist_item_secrets')
        .select('checklist_item_id')
        .eq('checklist_item_id', itemId)
        .maybeSingle()
      if (!existing) {
        return new Response(JSON.stringify({ ok: true, cleared: true, noop: true, value: 'cleared' }), {
          status: 200,
          headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: result, error: rpcError } = await supabase.rpc('approve_or_clear_credentials', {
      p_item_id: itemId,
      p_action: action,
      p_erase: erase,
    })
    if (rpcError) {
      return jsonResponse({ error: rpcError.message }, 500)
    }

    const cleared = Boolean((result as { cleared?: boolean })?.cleared)
    if (cleared) {
      const { data: project } = await supabase
        .from('projects')
        .select('id, agency_id, client_id')
        .eq('id', item.project_id)
        .single()
      if (project?.agency_id && project?.client_id) {
        await supabase.from('client_activity_events').insert({
          agency_id: project.agency_id,
          client_id: project.client_id,
          project_id: project.id,
          event_type: 'secret.cleared',
          title: `Secret effacé — ${item.label}`,
          metadata: {
            checklist_item_id: item.id,
            item_label: item.label,
            actor_user_id: user.id,
          },
        })
      }
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...corsHeaders, ...NO_STORE_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('approve-or-clear-credentials error', err instanceof Error ? err.message : 'unknown')
    return jsonResponse({ error: 'Erreur serveur' }, 500)
  }
})
