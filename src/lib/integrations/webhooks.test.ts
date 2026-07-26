import { describe, expect, it } from 'vitest'
import { validateWebhookUrlClient } from './webhooks'

describe('validateWebhookUrlClient', () => {
  it('requires https and blocks private hosts', () => {
    expect(validateWebhookUrlClient('')).toBe('URL requise.')
    expect(validateWebhookUrlClient('http://example.com')).toMatch(/HTTPS/)
    expect(validateWebhookUrlClient('https://10.1.2.3/hook')).toBe('URL non autorisée.')
    expect(validateWebhookUrlClient('https://[fc00::1]/x')).toBe('URL non autorisée.')
    expect(validateWebhookUrlClient('https://hooks.slack.com/services/T/B/X')).toBeNull()
  })
})
