import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ensureCheckoutSession,
  stripeConnectReady,
} from '../_shared/stripeCheckout.ts'
import {
  evaluatePaymentUnlock,
  stampPaymentUnlockedAt,
} from '../_shared/paymentUnlock.ts'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'

/**
 * Génère le lien Stripe Checkout pour une étape « Paiement » du parcours.
 * Refuse si le paiement n'est pas débloqué (prérequis completed / sticky unlock).
 * Authentifié par le token de portail.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!stripeSecretKey) {
    return jsonResponse({ error: 'Stripe non configuré' }, 500)
  }

  try {
    const rawBody = await req.text()
    const body = (rawBody ? JSON.parse(rawBody) : {}) as { projectToken?: string }
    const projectToken = (body.projectToken ?? '').trim()
    if (!projectToken) {
      return jsonResponse({ error: 'Missing projectToken' }, 400)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, client_name, client_email, token, price, payment_status, agency_id, stripe_checkout_url, stripe_checkout_session_id, payment_unlock_mode, payment_unlocked_at, agencies(user_id)',
      )
      .eq('token', projectToken)
      .maybeSingle()

    if (projectError || !project) {
      return jsonResponse({ error: 'Projet introuvable' }, 404)
    }

    if (project.payment_status === 'paid') {
      return jsonResponse({ success: true, alreadyPaid: true, checkoutUrl: null })
    }
    if (!project.price || project.price <= 0) {
      return jsonResponse({ error: 'Aucun montant à régler' }, 400)
    }

    const { data: checklistItems } = await supabase
      .from('checklist_items')
      .select('type, completed, required, order_index')
      .eq('project_id', project.id)
      .order('order_index', { ascending: true })

    const unlock = evaluatePaymentUnlock({
      unlockMode: project.payment_unlock_mode,
      paymentUnlockedAt: project.payment_unlocked_at,
      items: checklistItems ?? [],
    })
    if (!unlock.unlocked) {
      return jsonResponse(
        {
          error: unlock.lockMessage ?? 'Paiement pas encore disponible',
          code: 'payment_locked',
        },
        403,
      )
    }

    await stampPaymentUnlockedAt(supabase, project.id, project.payment_unlocked_at)

    const agenciesRel = project.agencies as { user_id?: string } | { user_id?: string }[] | null
    const agencyRow = Array.isArray(agenciesRel) ? agenciesRel[0] : agenciesRel
    const agencyUserId = agencyRow?.user_id
    if (!agencyUserId) {
      return jsonResponse({ error: 'Agence introuvable' }, 404)
    }

    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', agencyUserId)
      .eq('provider', 'stripe')
      .maybeSingle()

    const connect = stripeConnectReady((integration?.config ?? {}) as Record<string, unknown>)
    if (!connect) {
      return jsonResponse({ error: 'Paiement en ligne indisponible' }, 400)
    }

    // ensureCheckoutSession reuses an open session only if amount_total === price×100;
    // otherwise it expires the stale session and creates a new one.
    const session = await ensureCheckoutSession(project, connect)
    if (!session) {
      return jsonResponse({ error: 'Impossible de créer la session de paiement' }, 400)
    }

    return jsonResponse({ success: true, checkoutUrl: session.checkoutUrl })
  } catch (error) {
    console.error('portal-payment-link error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
