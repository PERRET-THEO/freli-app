export type IntegrationRow = {
  id: string
  provider: string
  config: Record<string, unknown>
}

export type WebhookDeliverySummary = {
  webhook_id: string
  status: 'success' | 'failed'
  event: string
  created_at: string
  http_status: number | null
  error: string | null
}
