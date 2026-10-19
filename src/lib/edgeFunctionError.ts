/** Corps JSON typique renvoyé par nos Edge Functions. */
export type EdgeFunctionErrorBody = {
  error?: string
  message?: string
  reason?: string
  retry_after_ms?: number
}

/**
 * Lit le message métier d'un FunctionsHttpError supabase-js
 * (`error.context` = Response HTTP).
 */
export async function readEdgeFunctionError(
  error: { message?: string; context?: Response } | null | undefined,
  data?: unknown,
): Promise<EdgeFunctionErrorBody> {
  const fromData = pickBody(data)
  if (fromData.message || fromData.error) {
    return fromData
  }

  const context = error?.context
  if (context && typeof context.json === 'function') {
    try {
      const parsed = pickBody(await context.clone().json())
      if (parsed.message || parsed.error || parsed.reason) {
        return parsed
      }
    } catch {
      try {
        const text = await context.clone().text()
        if (text.trim()) {
          return { message: text.trim(), error: text.trim() }
        }
      } catch {
        // ignore
      }
    }
  }

  const fallback = error?.message?.trim()
  if (fallback && !isGenericFunctionsMessage(fallback)) {
    return { message: fallback, error: fallback }
  }

  return {
    message: 'Une erreur est survenue. Réessayez.',
    error: fallback || 'edge_error',
  }
}

export function edgeFunctionErrorMessage(body: EdgeFunctionErrorBody): string {
  const msg = body.message?.trim()
  if (msg) return msg
  const err = body.error?.trim()
  if (err && !isGenericFunctionsMessage(err)) return err
  const reason = body.reason?.trim()
  if (reason) return reason
  return 'Une erreur est survenue. Réessayez.'
}

function pickBody(raw: unknown): EdgeFunctionErrorBody {
  if (!raw || typeof raw !== 'object') return {}
  const body = raw as Record<string, unknown>
  return {
    error: typeof body.error === 'string' ? body.error : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    retry_after_ms:
      typeof body.retry_after_ms === 'number' && body.retry_after_ms > 0
        ? body.retry_after_ms
        : undefined,
  }
}

function isGenericFunctionsMessage(value: string): boolean {
  return /non-2xx status code/i.test(value) || /edge function returned/i.test(value)
}
