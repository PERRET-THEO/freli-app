import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildFreliEnvelope,
  buildSlackIncomingPayload,
  filterMatchingWebhooks,
  isRetryableWebhookFailure,
  isSlackIncomingWebhookUrl,
  validateWebhookUrl,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhookHelpers'

describe('validateWebhookUrl', () => {
  it('rejects http', () => {
    expect(validateWebhookUrl('http://example.com/hook').ok).toBe(false)
  })

  it('rejects localhost and private IPv4', () => {
    expect(validateWebhookUrl('https://localhost/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://127.0.0.1/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://10.0.0.5/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://192.168.1.1/hook').ok).toBe(false)
  })

  it('rejects private IPv6 ULA and link-local', () => {
    expect(validateWebhookUrl('https://[::1]/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://[fc00::1]/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://[fd12:3456::1]/hook').ok).toBe(false)
    expect(validateWebhookUrl('https://[fe80::1]/hook').ok).toBe(false)
  })

  it('accepts public HTTPS including Zapier and Slack hosts', () => {
    expect(validateWebhookUrl('https://hooks.zapier.com/hooks/catch/abc').ok).toBe(true)
    expect(validateWebhookUrl('https://hooks.slack.com/services/T/B/X').ok).toBe(true)
  })
})

describe('Slack vs Freli payloads', () => {
  const data = {
    project: {
      client_name: 'Client Test',
      client_email: 'client@example.com',
      status: 'completed',
      price: 1500,
      portal_url: 'https://app.freli.test/p/t',
      dashboard_url: 'https://app.freli.test/dashboard/project/1',
    },
    agency: { id: 'a1', name: 'Agence Test' },
    meta: { source: 'test' },
  }

  it('detects Slack Incoming Webhook URLs', () => {
    expect(isSlackIncomingWebhookUrl('https://hooks.slack.com/services/T/B/X')).toBe(true)
    expect(isSlackIncomingWebhookUrl('https://hooks.zapier.com/hooks/catch/x')).toBe(false)
  })

  it('builds Slack payload with required text field', () => {
    const payload = buildSlackIncomingPayload('webhook.test', data)
    expect(typeof payload.text).toBe('string')
    expect(payload.text.length).toBeGreaterThan(0)
    expect(Array.isArray(payload.blocks)).toBe(true)
    expect(payload.text).toContain('Client Test')
  })

  it('builds Freli envelope for automators', () => {
    const envelope = buildFreliEnvelope('project.completed', data, '2026-07-25T12:00:00.000Z')
    expect(envelope).toEqual({
      event: 'project.completed',
      timestamp: '2026-07-25T12:00:00.000Z',
      data,
    })
  })
})

describe('filterMatchingWebhooks', () => {
  const endpoints = [
    { id: '1', config: { events: ['project.completed'], enabled: true } },
    { id: '2', config: { events: ['project.created'], enabled: false } },
    { id: '3', config: { events: ['project.created', 'payment.received'], enabled: true } },
  ]

  it('filters by enabled and subscribed events', () => {
    expect(filterMatchingWebhooks(endpoints, 'project.completed').map((e) => e.id)).toEqual(['1'])
    expect(filterMatchingWebhooks(endpoints, 'project.created').map((e) => e.id)).toEqual(['3'])
    expect(filterMatchingWebhooks(endpoints, 'webhook.test')).toEqual([])
  })
})

describe('isRetryableWebhookFailure', () => {
  it('retries network, 429 and 5xx only', () => {
    expect(isRetryableWebhookFailure(undefined, true)).toBe(true)
    expect(isRetryableWebhookFailure(429)).toBe(true)
    expect(isRetryableWebhookFailure(500)).toBe(true)
    expect(isRetryableWebhookFailure(502)).toBe(true)
    expect(isRetryableWebhookFailure(400)).toBe(false)
    expect(isRetryableWebhookFailure(404)).toBe(false)
  })

  it('documents max attempts', () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(3)
  })
})

describe('retry loop simulation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('attempts up to 3 times on HTTP 500', async () => {
    vi.useFakeTimers()
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        return new Response('fail', { status: 500 })
      }),
    )

    const { WEBHOOK_RETRY_BACKOFF_MS } = await import('./webhookHelpers')

    async function simulateDeliver(): Promise<number> {
      let attempts = 0
      for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
        attempts = attempt
        const res = await fetch('https://example.com/hook', { method: 'POST', body: '{}' })
        if (res.ok) return attempts
        if (!isRetryableWebhookFailure(res.status) || attempt >= WEBHOOK_MAX_ATTEMPTS) return attempts
        await new Promise((r) => setTimeout(r, WEBHOOK_RETRY_BACKOFF_MS[attempt - 1]))
      }
      return attempts
    }

    const pending = simulateDeliver()
    await vi.runAllTimersAsync()
    const attempts = await pending
    expect(attempts).toBe(3)
    expect(calls).toBe(3)
  })
})
