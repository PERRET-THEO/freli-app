/**
 * Synchronise les Products/Prices SaaS Freli (HT, tax exclusive) avec la grille ci-dessous.
 *
 * Pour chaque lookup_key :
 *  - price actif au bon montant → réutilisé (idempotent) ;
 *  - price actif à un autre montant → nouveau price créé sur le même product avec
 *    transfer_lookup_key=true, puis l'ancien est archivé (active=false).
 *    Les abonnements existants restent sur leur ancien price ; seuls les nouveaux Checkout
 *    utilisent le nouveau tarif.
 *  - aucun price → product trouvé/créé puis price créé.
 * Met aussi à jour public.billing_stripe_prices (fallback DB).
 *
 * POST /functions/v1/bootstrap-saas-prices            → applique
 * POST /functions/v1/bootstrap-saas-prices?dry_run=1  → affiche le plan sans rien écrire
 * Header obligatoire : x-freli-bootstrap: <SAAS_BOOTSTRAP_TOKEN>
 * (secret Supabase requis — sans lui la fonction refuse tout appel).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_API_VERSION = '2025-04-30.basil'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-freli-bootstrap',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type PriceSpec = {
  secretName: string
  lookupKey: string
  productName: string
  productKey: string
  amountCents: number
  interval: 'month' | 'year'
}

/** Doit rester aligné avec src/lib/billing/entitlements.ts */
const SPECS: PriceSpec[] = [
  {
    secretName: 'STRIPE_PRICE_MONTHLY',
    lookupKey: 'freli_subscription_month',
    productName: 'Abonnement Freli',
    productKey: 'freli_subscription',
    amountCents: 2900,
    interval: 'month',
  },
  {
    secretName: 'STRIPE_PRICE_YEARLY',
    lookupKey: 'freli_subscription_year',
    productName: 'Abonnement Freli',
    productKey: 'freli_subscription',
    amountCents: 29000,
    interval: 'year',
  },
  {
    secretName: 'STRIPE_PRICE_AI_MONTHLY',
    lookupKey: 'freli_ai_month',
    productName: 'Modules IA Freli',
    productKey: 'freli_ai',
    amountCents: 1200,
    interval: 'month',
  },
  {
    secretName: 'STRIPE_PRICE_AI_YEARLY',
    lookupKey: 'freli_ai_year',
    productName: 'Modules IA Freli',
    productKey: 'freli_ai',
    amountCents: 12000,
    interval: 'year',
  },
]

type StripePrice = {
  id: string
  product: string
  unit_amount: number | null
  currency: string
  tax_behavior: string | null
  recurring: { interval?: string; interval_count?: number } | null
}

function getStripeSecret(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') ?? ''
}

function bootstrapTokenOk(req: Request): boolean {
  // Pas de valeur par défaut : la fonction est publique (verify_jwt=false).
  const expected = (Deno.env.get('SAAS_BOOTSTRAP_TOKEN') ?? '').trim()
  const got = (req.headers.get('x-freli-bootstrap') ?? '').trim()
  return expected.length >= 16 && got === expected
}

async function stripeRequest(
  method: 'GET' | 'POST',
  path: string,
  params?: URLSearchParams,
): Promise<Record<string, unknown>> {
  const secret = getStripeSecret()
  if (!secret) throw new Error('STRIPE_SECRET_KEY is not configured')
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? (params ?? new URLSearchParams()).toString() : undefined,
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined
    throw new Error(`${method} ${path}: ${errObj?.message ?? 'Stripe request failed'}`)
  }
  return json
}

async function findActivePriceByLookupKey(lookupKey: string): Promise<StripePrice | null> {
  const json = await stripeRequest(
    'GET',
    `prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
  )
  const data = (json.data as StripePrice[] | undefined) ?? []
  return data[0] ?? null
}

function priceMatches(price: StripePrice, spec: PriceSpec): boolean {
  return (
    price.unit_amount === spec.amountCents &&
    price.currency === 'eur' &&
    price.tax_behavior === 'exclusive' &&
    price.recurring?.interval === spec.interval &&
    (price.recurring?.interval_count ?? 1) === 1
  )
}

async function findOrCreateProduct(name: string, productKey: string): Promise<string> {
  const listed = await stripeRequest('GET', 'products?active=true&limit=100')
  const products = (listed.data as Array<Record<string, unknown>> | undefined) ?? []
  const match = products.find((p) => {
    const meta = (p.metadata as Record<string, string> | undefined) ?? {}
    return meta.freli_product === productKey
  })
  if (match && typeof match.id === 'string') return match.id

  const created = await stripeRequest(
    'POST',
    'products',
    new URLSearchParams({
      name,
      'metadata[freli_product]': productKey,
      'metadata[freli_saas]': '1',
      tax_code: 'txcd_10000000',
    }),
  )
  const id = created.id
  if (typeof id !== 'string' || !id) throw new Error('Stripe product create returned no id')
  return id
}

async function createPrice(
  spec: PriceSpec,
  productId: string,
  transferLookupKey: boolean,
): Promise<string> {
  const params = new URLSearchParams({
    product: productId,
    currency: 'eur',
    unit_amount: String(spec.amountCents),
    'recurring[interval]': spec.interval,
    lookup_key: spec.lookupKey,
    tax_behavior: 'exclusive',
    'metadata[freli_saas]': '1',
    'metadata[freli_lookup]': spec.lookupKey,
    'metadata[freli_secret]': spec.secretName,
  })
  if (transferLookupKey) params.set('transfer_lookup_key', 'true')
  const created = await stripeRequest('POST', 'prices', params)
  const id = created.id
  if (typeof id !== 'string' || !id) throw new Error(`No price id for ${spec.lookupKey}`)
  return id
}

async function archivePrice(priceId: string): Promise<void> {
  await stripeRequest('POST', `prices/${priceId}`, new URLSearchParams({ active: 'false' }))
}

async function upsertDbPrices(prices: Record<string, string>): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !key) return 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'
  const supabase = createClient(url, key)
  const rows = SPECS.map((spec) => ({
    key: spec.secretName,
    price_id: prices[spec.secretName],
    lookup_key: spec.lookupKey,
    amount_cents: spec.amountCents,
    interval: spec.interval,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('billing_stripe_prices').upsert(rows, { onConflict: 'key' })
  return error ? error.message : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!bootstrapTokenOk(req)) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'

  try {
    if (!getStripeSecret()) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)
    }

    const productIds = new Map<string, string>()
    const prices: Record<string, string> = {}
    const plan: Array<Record<string, unknown>> = []

    for (const spec of SPECS) {
      const existing = await findActivePriceByLookupKey(spec.lookupKey)

      if (existing && priceMatches(existing, spec)) {
        prices[spec.secretName] = existing.id
        plan.push({ lookupKey: spec.lookupKey, action: 'reuse', priceId: existing.id })
        continue
      }

      if (existing) {
        plan.push({
          lookupKey: spec.lookupKey,
          action: 'replace',
          oldPriceId: existing.id,
          oldAmountCents: existing.unit_amount,
          newAmountCents: spec.amountCents,
        })
        if (dryRun) continue
        const newId = await createPrice(spec, existing.product, true)
        await archivePrice(existing.id)
        prices[spec.secretName] = newId
        plan[plan.length - 1].newPriceId = newId
        continue
      }

      plan.push({ lookupKey: spec.lookupKey, action: 'create', newAmountCents: spec.amountCents })
      if (dryRun) continue
      let productId = productIds.get(spec.productKey)
      if (!productId) {
        productId = await findOrCreateProduct(spec.productName, spec.productKey)
        productIds.set(spec.productKey, productId)
      }
      const newId = await createPrice(spec, productId, false)
      prices[spec.secretName] = newId
      plan[plan.length - 1].newPriceId = newId
    }

    if (dryRun) {
      return jsonResponse({ ok: true, dryRun: true, plan })
    }

    const dbError = await upsertDbPrices(prices)

    const secretsCli = [
      'supabase secrets set \\',
      `  STRIPE_PRICE_MONTHLY=${prices.STRIPE_PRICE_MONTHLY} \\`,
      `  STRIPE_PRICE_YEARLY=${prices.STRIPE_PRICE_YEARLY} \\`,
      `  STRIPE_PRICE_AI_MONTHLY=${prices.STRIPE_PRICE_AI_MONTHLY} \\`,
      `  STRIPE_PRICE_AI_YEARLY=${prices.STRIPE_PRICE_AI_YEARLY} \\`,
      '  --project-ref xxghfeshnihagvahmmpr',
    ].join('\n')

    return jsonResponse({
      ok: true,
      plan,
      prices,
      dbUpdated: dbError === null,
      dbError,
      secretsCli,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'bootstrap failed'
    return jsonResponse({ error: message }, 500)
  }
})
