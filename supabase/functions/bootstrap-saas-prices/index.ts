/**
 * One-shot: crée les Products/Prices SaaS Freli (HT, tax exclusive) avec lookup_keys.
 * Idempotent — réutilise les prices existants si lookup_key déjà présent.
 *
 * POST /functions/v1/bootstrap-saas-prices
 * Header: x-freli-bootstrap: <SAAS_BOOTSTRAP_TOKEN ou "freli-setup">
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

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

const SPECS: PriceSpec[] = [
  {
    secretName: 'STRIPE_PRICE_MONTHLY',
    lookupKey: 'freli_subscription_month',
    productName: 'Abonnement Freli',
    productKey: 'freli_subscription',
    amountCents: 5900,
    interval: 'month',
  },
  {
    secretName: 'STRIPE_PRICE_YEARLY',
    lookupKey: 'freli_subscription_year',
    productName: 'Abonnement Freli',
    productKey: 'freli_subscription',
    amountCents: 59000,
    interval: 'year',
  },
  {
    secretName: 'STRIPE_PRICE_AI_MONTHLY',
    lookupKey: 'freli_ai_month',
    productName: 'Modules IA Freli',
    productKey: 'freli_ai',
    amountCents: 2900,
    interval: 'month',
  },
  {
    secretName: 'STRIPE_PRICE_AI_YEARLY',
    lookupKey: 'freli_ai_year',
    productName: 'Modules IA Freli',
    productKey: 'freli_ai',
    amountCents: 29000,
    interval: 'year',
  },
]

function getStripeSecret(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') ?? ''
}

function bootstrapTokenOk(req: Request): boolean {
  const expected = (Deno.env.get('SAAS_BOOTSTRAP_TOKEN') ?? 'freli-setup').trim()
  const got = (req.headers.get('x-freli-bootstrap') ?? '').trim()
  return Boolean(expected && got && got === expected)
}

async function stripeFormPost(
  path: string,
  params: URLSearchParams,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  const secret = getStripeSecret()
  if (!secret) return { ok: false, error: 'STRIPE_SECRET_KEY is not configured' }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
    },
    body: params.toString(),
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined
    return { ok: false, error: errObj?.message ?? 'Stripe request failed' }
  }
  return { ok: true, json }
}

async function stripeGet(
  path: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  const secret = getStripeSecret()
  if (!secret) return { ok: false, error: 'STRIPE_SECRET_KEY is not configured' }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': STRIPE_API_VERSION,
    },
  })
  const json = (await res.json()) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined
    return { ok: false, error: errObj?.message ?? 'Stripe request failed' }
  }
  return { ok: true, json }
}

async function findPriceByLookupKey(lookupKey: string): Promise<string | null> {
  const res = await stripeGet(
    `prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
  )
  if (!res.ok) return null
  const data = res.json.data as Array<{ id?: string }> | undefined
  const id = data?.[0]?.id
  return typeof id === 'string' && id ? id : null
}

async function findOrCreateProduct(name: string, productKey: string): Promise<string> {
  const listed = await stripeGet('products?active=true&limit=100')
  if (listed.ok) {
    const products = (listed.json.data as Array<Record<string, unknown>> | undefined) ?? []
    const match = products.find((p) => {
      const meta = (p.metadata as Record<string, string> | undefined) ?? {}
      return meta.freli_product === productKey
    })
    if (match && typeof match.id === 'string') return match.id
  }

  const created = await stripeFormPost(
    'products',
    new URLSearchParams({
      name,
      'metadata[freli_product]': productKey,
      'metadata[freli_saas]': '1',
      tax_code: 'txcd_10000000',
    }),
  )
  if (!created.ok) throw new Error(created.error)
  const id = created.json.id
  if (typeof id !== 'string' || !id) throw new Error('Stripe product create returned no id')
  return id
}

async function createPrice(spec: PriceSpec, productId: string): Promise<string> {
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
  const created = await stripeFormPost('prices', params)
  if (!created.ok) throw new Error(`${spec.lookupKey}: ${created.error}`)
  const id = created.json.id
  if (typeof id !== 'string' || !id) throw new Error(`No price id for ${spec.lookupKey}`)
  return id
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

  try {
    if (!getStripeSecret()) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)
    }

    const productIds = new Map<string, string>()
    const prices: Record<string, string> = {}
    const created: string[] = []
    const reused: string[] = []

    for (const spec of SPECS) {
      const existing = await findPriceByLookupKey(spec.lookupKey)
      if (existing) {
        prices[spec.secretName] = existing
        reused.push(spec.lookupKey)
        continue
      }
      let productId = productIds.get(spec.productKey)
      if (!productId) {
        productId = await findOrCreateProduct(spec.productName, spec.productKey)
        productIds.set(spec.productKey, productId)
      }
      const priceId = await createPrice(spec, productId)
      prices[spec.secretName] = priceId
      created.push(spec.lookupKey)
    }

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
      created,
      reused,
      prices,
      secretsCli,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'bootstrap failed'
    return jsonResponse({ error: message }, 500)
  }
})
