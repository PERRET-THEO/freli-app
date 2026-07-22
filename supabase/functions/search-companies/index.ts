/**
 * Proxy vers l'API Recherche d'Entreprises (recherche-entreprises.api.gouv.fr).
 *
 * - Cache mutualisé dans company_lookup_cache : "siren:{siren}" (TTL 30 j)
 *   et "search:{terme}" (TTL 24 h).
 * - Rate limiting sortant (token bucket en mémoire) pour respecter les
 *   limites de l'API publique (7 req/s par IP, ASN partagé).
 * - Ne renvoie jamais d'erreur bloquante : en cas d'indisponibilité de
 *   l'API, retourne { results: [], error: 'lookup_unavailable' } en 200
 *   pour que le frontend bascule sur la saisie manuelle.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import {
  mapApiResults,
  type ApiSearchResponse,
  type CompanyLookupResult,
} from '../_shared/companyLookup.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const API_BASE = 'https://recherche-entreprises.api.gouv.fr/search'
const FETCH_TIMEOUT_MS = 5_000
const TTL_SIREN_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours
const TTL_SEARCH_MS = 24 * 60 * 60 * 1000 // 24 h

// Token bucket : max 5 requêtes sortantes/s par instance (marge sous les
// 7 req/s par IP de l'API, l'ASN étant partagé avec d'autres clients cloud).
const BUCKET_CAPACITY = 5
let bucketTokens = BUCKET_CAPACITY
let bucketLastRefill = Date.now()

function takeToken(): boolean {
  const now = Date.now()
  bucketTokens = Math.min(
    BUCKET_CAPACITY,
    bucketTokens + ((now - bucketLastRefill) / 1000) * BUCKET_CAPACITY,
  )
  bucketLastRefill = now
  if (bucketTokens < 1) return false
  bucketTokens -= 1
  return true
}

type CacheRow = { cache_key: string; payload: CompanyLookupResult[]; cached_at: string }

function resolveCacheKey(q: string): { key: string; ttlMs: number; isIdentifier: boolean } {
  const digits = q.replace(/\s+/g, '')
  if (/^\d{9}$/.test(digits)) {
    return { key: `siren:${digits}`, ttlMs: TTL_SIREN_MS, isIdentifier: true }
  }
  if (/^\d{14}$/.test(digits)) {
    return { key: `siren:${digits.slice(0, 9)}`, ttlMs: TTL_SIREN_MS, isIdentifier: true }
  }
  return { key: `search:${q.trim().toLowerCase()}`, ttlMs: TTL_SEARCH_MS, isIdentifier: false }
}

async function readCache(key: string): Promise<CacheRow | null> {
  const { data } = await supabase
    .from('company_lookup_cache')
    .select('cache_key, payload, cached_at')
    .eq('cache_key', key)
    .maybeSingle()
  return (data as CacheRow | null) ?? null
}

async function writeCache(entries: { key: string; payload: CompanyLookupResult[] }[]) {
  const now = new Date().toISOString()
  const rows = entries.map((e) => ({ cache_key: e.key, payload: e.payload, cached_at: now }))
  const { error } = await supabase.from('company_lookup_cache').upsert(rows)
  if (error) console.error('[search-companies] cache upsert failed', { message: error.message })
}

async function fetchFromApi(
  q: string,
  codePostal: string | undefined,
  isIdentifier: boolean,
): Promise<CompanyLookupResult[]> {
  const url = new URL(API_BASE)
  url.searchParams.set('q', q.replace(/\s+/g, isIdentifier ? '' : ' ').trim())
  // Les filtres sont ignorés par l'API quand q est un SIREN/SIRET : on ne les envoie pas.
  if (codePostal && !isIdentifier) url.searchParams.set('code_postal', codePostal)
  url.searchParams.set('per_page', '10')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Frely/1.0 (company lookup)' },
    })
    if (!response.ok) {
      console.error('[search-companies] API error', { status: response.status, q })
      throw new Error(`API status ${response.status}`)
    }
    const json = (await response.json()) as ApiSearchResponse
    return mapApiResults(json)
  } finally {
    clearTimeout(timeout)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { q, code_postal, refresh } = (await req.json()) as {
      q?: string
      code_postal?: string
      refresh?: boolean
    }

    const query = (q ?? '').trim()
    if (query.length < 2) {
      return jsonResponse({ results: [], fromCache: false })
    }

    const { key, ttlMs, isIdentifier } = resolveCacheKey(query)
    const cached = await readCache(key)
    const cacheIsFresh =
      cached !== null && Date.now() - new Date(cached.cached_at).getTime() < ttlMs

    if (cached && cacheIsFresh && refresh !== true) {
      return jsonResponse({ results: cached.payload, fromCache: true })
    }

    if (!takeToken()) {
      // Débit sortant dépassé : cache périmé plutôt que rien.
      if (cached) {
        return jsonResponse({ results: cached.payload, fromCache: true, stale: true })
      }
      console.error('[search-companies] outbound rate limit reached', { q: query })
      return jsonResponse({
        results: [],
        error: 'lookup_unavailable',
        message: 'Trop de recherches simultanées, réessayez dans un instant.',
      })
    }

    let results: CompanyLookupResult[]
    try {
      results = await fetchFromApi(query, code_postal, isIdentifier)
    } catch (apiError) {
      const message = apiError instanceof Error ? apiError.message : String(apiError)
      console.error('[search-companies] API unavailable', { q: query, message })
      if (cached) {
        return jsonResponse({ results: cached.payload, fromCache: true, stale: true })
      }
      return jsonResponse({
        results: [],
        error: 'lookup_unavailable',
        message: 'Recherche automatique indisponible.',
      })
    }

    // On alimente aussi la clé siren: de chaque résultat unique pour que le
    // "rafraîchir" ou une recherche directe par SIREN parte du cache.
    const entries: { key: string; payload: CompanyLookupResult[] }[] = [
      { key, payload: results },
    ]
    if (!isIdentifier) {
      for (const result of results) {
        if (result.siren) entries.push({ key: `siren:${result.siren}`, payload: [result] })
      }
    }
    await writeCache(entries)

    return jsonResponse({ results, fromCache: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[search-companies] unexpected error', { message })
    return jsonResponse({
      results: [],
      error: 'lookup_unavailable',
      message: 'Recherche automatique indisponible.',
    })
  }
})
