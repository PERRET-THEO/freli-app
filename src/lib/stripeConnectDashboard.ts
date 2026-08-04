import { supabase } from './supabase'

async function readInvokeError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const response = (error as { context?: Response }).context
  if (!response?.clone) return null
  try {
    const body = (await response.clone().json()) as { error?: string; message?: string }
    return body.error ? String(body.error) : body.message ? String(body.message) : null
  } catch {
    return null
  }
}

function humanizeStripeDashboardError(detail: string | null, fallback: string): string {
  const message = detail ?? fallback
  if (
    /does not have access|application access may have been revoked|no such account|does not exist|similar object exists in (test|live) mode|Compte Stripe inaccessible|Compte Stripe non connecté/i.test(
      message,
    )
  ) {
    return 'Compte Stripe inaccessible (accès révoqué ou compte orphelin). Reconnectez Stripe dans Intégrations.'
  }
  return message
}

/** Ouvre l'espace Stripe Express (solde, virements, IBAN) dans un nouvel onglet. */
export async function openStripeExpressDashboard(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-dashboard', {
    body: {},
  })

  if (error) {
    const detail = await readInvokeError(error)
    throw new Error(humanizeStripeDashboardError(detail, error.message))
  }
  if (data?.error) {
    throw new Error(humanizeStripeDashboardError(String(data.error), String(data.error)))
  }

  const url = data?.url as string | undefined
  if (!url) throw new Error('Lien Stripe indisponible')

  window.open(url, '_blank', 'noopener,noreferrer')
}
