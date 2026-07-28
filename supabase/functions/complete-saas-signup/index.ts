import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  createServiceClient,
  findAuthUserIdByEmail,
  isSaasCheckoutSession,
  linkBillingToAgency,
  parseInterval,
  sessionCustomerEmail,
  sessionIsPaid,
  stripeGet,
  upsertLeadPaid,
  type BillingInterval,
} from '../_shared/saasBilling.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = (await req.json()) as {
      sessionId?: string
      password?: string
      agencyName?: string
      linkOnly?: boolean
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const linkOnly = body.linkOnly === true
    const agencyName =
      typeof body.agencyName === 'string' && body.agencyName.trim()
        ? body.agencyName.trim()
        : 'Mon Agence'

    if (!sessionId.startsWith('cs_')) {
      return jsonResponse({ error: 'Invalid session id' }, 400)
    }
    if (!linkOnly && password.length < 6) {
      return jsonResponse({ error: 'Le mot de passe doit contenir au moins 6 caractères.' }, 400)
    }

    const fetched = await stripeGet(
      `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    )
    if (!fetched.ok) {
      return jsonResponse({ error: fetched.error }, fetched.status >= 400 ? fetched.status : 500)
    }

    const session = fetched.json
    if (!isSaasCheckoutSession(session)) {
      return jsonResponse({ error: 'Not a Freli subscription checkout' }, 400)
    }
    if (!sessionIsPaid(session)) {
      return jsonResponse({ error: 'Payment not completed' }, 402)
    }

    const email = sessionCustomerEmail(session)
    if (!email) {
      return jsonResponse({ error: 'Checkout email missing' }, 400)
    }

    const meta = (session.metadata ?? {}) as Record<string, unknown>
    const interval = parseInterval(meta.freli_interval) ?? ('month' as BillingInterval)
    const source = meta.freli_source === 'admin' ? 'admin' : 'pricing'
    const aiAddonActive = meta.freli_ai === '1' || meta.freli_ai === 1

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer && typeof session.customer === 'object' &&
            typeof (session.customer as { id?: string }).id === 'string'
          ? (session.customer as { id: string }).id
          : null

    let subscriptionId: string | null =
      typeof session.subscription === 'string' ? session.subscription : null
    let periodEnd: string | null = null
    if (
      session.subscription &&
      typeof session.subscription === 'object'
    ) {
      const sub = session.subscription as {
        id?: string
        current_period_end?: number
        status?: string
      }
      if (typeof sub.id === 'string') subscriptionId = sub.id
      if (typeof sub.current_period_end === 'number') {
        periodEnd = new Date(sub.current_period_end * 1000).toISOString()
      }
    }

    const supabase = createServiceClient()
    await upsertLeadPaid(supabase, {
      email,
      sessionId,
      customerId,
      subscriptionId,
      interval,
      source,
    })

    // Existing user: attach billing, tell client to sign in
    const existingUserId = await findAuthUserIdByEmail(supabase, email)

    if (existingUserId) {
      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', existingUserId)
        .maybeSingle()

      let agencyId = agency?.id as string | undefined
      if (!agencyId) {
        const { data: createdAgency, error: agencyErr } = await supabase
          .from('agencies')
          .insert({ user_id: existingUserId, name: agencyName, plan: 'freli' })
          .select('id')
          .single()
        if (agencyErr) return jsonResponse({ error: agencyErr.message }, 500)
        agencyId = createdAgency.id
      }

      await linkBillingToAgency(supabase, {
        agencyId,
        email,
        customerId,
        subscriptionId,
        interval,
        status: 'active',
        currentPeriodEnd: periodEnd,
        checkoutSessionId: sessionId,
        aiAddonActive,
      })

      return jsonResponse({
        ok: true,
        alreadyRegistered: true,
        email,
      })
    }

    if (linkOnly) {
      return jsonResponse({ error: 'No existing account to link' }, 404)
    }

    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { freli_saas_signup: true },
    })
    if (createErr || !createdUser.user) {
      const msg = createErr?.message ?? 'Unable to create user'
      if (msg.toLowerCase().includes('already')) {
        return jsonResponse({ ok: true, alreadyRegistered: true, email })
      }
      return jsonResponse({ error: msg }, 400)
    }

    const userId = createdUser.user.id
    const { data: agencyRow, error: agencyErr } = await supabase
      .from('agencies')
      .insert({ user_id: userId, name: agencyName, plan: 'freli' })
      .select('id')
      .single()
    if (agencyErr || !agencyRow) {
      return jsonResponse({ error: agencyErr?.message ?? 'Agency creation failed' }, 500)
    }

    await linkBillingToAgency(supabase, {
      agencyId: agencyRow.id,
      email,
      customerId,
      subscriptionId,
      interval,
      status: 'active',
      currentPeriodEnd: periodEnd,
      checkoutSessionId: sessionId,
      aiAddonActive,
    })

    return jsonResponse({
      ok: true,
      alreadyRegistered: false,
      email,
      userId,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('complete-saas-signup:', message)
    return jsonResponse({ error: message }, 500)
  }
})
