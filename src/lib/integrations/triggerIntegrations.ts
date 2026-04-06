import { supabase } from '../supabase'

export type IntegrationResults = {
  stripe?: { checkoutUrl: string }
  google_drive?: { folderUrl: string }
  hubspot?: { contactId: string }
}

export async function triggerIntegrations(
  projectId: string,
  projectToken: string,
): Promise<IntegrationResults> {
  try {
    const { data, error } = await supabase.functions.invoke('trigger-integrations', {
      body: { projectId, projectToken },
    })

    if (error) {
      console.error('triggerIntegrations invoke error:', error.message, error)
      return {}
    }

    const payload = data as { results?: IntegrationResults; error?: string } | null
    if (payload?.error) {
      console.error('triggerIntegrations function returned error:', payload.error)
      return {}
    }

    const results = payload?.results ?? {}
    if (!results.stripe?.checkoutUrl) {
      console.warn('triggerIntegrations: no stripe.checkoutUrl in results', results)
    }
    return results as IntegrationResults
  } catch (err) {
    console.error('triggerIntegrations unexpected error:', err)
    return {}
  }
}
