/**
 * Processes stripe_checkout_expire_queue: expires Checkout Sessions on Connect accounts.
 *
 * Auth (any one):
 * - x-cron-secret / x-internal-secret = CRON_SECRET env
 * - x-cron-secret = app_internal_secrets.cron_shared (used by pg_cron / pg_net)
 * - Authorization: Bearer SERVICE_ROLE_KEY
 *
 * Retries: attempts < 5, row kept until Stripe success (or already expired/complete).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  expireCheckoutSessionOnConnect,
  stripeConnectReady,
  stripeSecretMode,
} from '../_shared/stripeCheckout.ts'
import { corsHeaders, isInternalRequest, jsonResponse } from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const MAX_ATTEMPTS = 5

async function isAuthorized(req: Request): Promise<boolean> {
  if (isInternalRequest(req)) return true
  const auth = req.headers.get('Authorization') ?? ''
  if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) return true

  const headerSecret = req.headers.get('x-cron-secret') ?? ''
  if (!headerSecret) return false

  const { data } = await supabase
    .from('app_internal_secrets')
    .select('value')
    .eq('key', 'cron_shared')
    .maybeSingle()

  return Boolean(data?.value && data.value === headerSecret)
}

async function resolveStripeAccountId(
  projectId: string,
  queuedAccountId: string | null,
): Promise<string | null> {
  if (queuedAccountId?.startsWith('acct_')) return queuedAccountId

  const { data: project } = await supabase
    .from('projects')
    .select('agency_id, agencies(user_id)')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return null

  const agenciesRel = project.agencies as { user_id?: string } | { user_id?: string }[] | null
  const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
  const userId = agencyRow?.user_id
  if (!userId) return null

  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .maybeSingle()

  return stripeConnectReady((integration?.config ?? {}) as Record<string, unknown>)?.accountId ?? null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!(await isAuthorized(req))) {
    console.error('expire-stale-checkouts unauthorized')
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  console.log('expire-stale-checkouts start, stripe_mode=', stripeSecretMode())

  try {
    const { data: rows, error } = await supabase
      .from('stripe_checkout_expire_queue')
      .select('id, project_id, session_id, stripe_account_id, attempts')
      .is('processed_at', null)
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw new Error(error.message)

    let expired = 0
    let failed = 0
    let skipped = 0

    for (const row of rows ?? []) {
      const attempts = Number(row.attempts ?? 0) + 1
      const now = new Date().toISOString()

      try {
        const accountId = await resolveStripeAccountId(
          row.project_id,
          row.stripe_account_id as string | null,
        )
        if (!accountId) {
          throw new Error('missing stripe_account_id for Connect expire')
        }

        // Persist account id if it was missing at enqueue time.
        if (!row.stripe_account_id) {
          await supabase
            .from('stripe_checkout_expire_queue')
            .update({ stripe_account_id: accountId })
            .eq('id', row.id)
        }

        const result = await expireCheckoutSessionOnConnect(row.session_id, accountId)
        if (!result.ok) {
          throw new Error(result.error)
        }

        await supabase
          .from('stripe_checkout_expire_queue')
          .update({
            processed_at: now,
            attempts,
            last_attempt_at: now,
            last_error: null,
            error: null,
            stripe_account_id: accountId,
          })
          .eq('id', row.id)

        console.log(
          'expire-stale-checkouts ok',
          row.session_id,
          'status=',
          result.status,
          'account=',
          accountId,
        )
        if (result.status === 'expired') expired += 1
        else skipped += 1
      } catch (e) {
        failed += 1
        const message = e instanceof Error ? e.message : String(e)
        console.error(
          'expire-stale-checkouts row failed:',
          row.id,
          row.session_id,
          'attempt=',
          attempts,
          message,
        )

        const giveUp = attempts >= MAX_ATTEMPTS
        await supabase
          .from('stripe_checkout_expire_queue')
          .update({
            attempts,
            last_attempt_at: now,
            last_error: message.slice(0, 500),
            error: message.slice(0, 500),
            // Only mark processed after max attempts so cron keeps retrying before that.
            ...(giveUp ? { processed_at: now } : {}),
          })
          .eq('id', row.id)
      }
    }

    return jsonResponse({
      success: true,
      stripe_mode: stripeSecretMode(),
      pending: (rows ?? []).length,
      expired,
      skipped,
      failed,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('expire-stale-checkouts:', message)
    return jsonResponse({ error: message }, 500)
  }
})
