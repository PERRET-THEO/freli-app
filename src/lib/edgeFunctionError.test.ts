import { describe, expect, it } from 'vitest'
import {
  edgeFunctionErrorMessage,
  readEdgeFunctionError,
} from './edgeFunctionError'

describe('readEdgeFunctionError', () => {
  it('lit message depuis error.context.json()', async () => {
    const body = {
      error: 'email_taken',
      message: 'Un autre client de votre agence utilise déjà cette adresse email.',
    }
    const context = new Response(JSON.stringify(body), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
    const parsed = await readEdgeFunctionError(
      { message: 'Edge Function returned a non-2xx status code', context },
      null,
    )
    expect(edgeFunctionErrorMessage(parsed)).toBe(
      'Un autre client de votre agence utilise déjà cette adresse email.',
    )
  })

  it('récupère retry_after_ms pour un 429', async () => {
    const body = {
      error: 'rate_limited',
      message: "Vous pourrez renvoyer l'invitation dans 8 min.",
      retry_after_ms: 480_000,
    }
    const context = new Response(JSON.stringify(body), { status: 429 })
    const parsed = await readEdgeFunctionError(
      { message: 'Edge Function returned a non-2xx status code', context },
    )
    expect(parsed.retry_after_ms).toBe(480_000)
    expect(edgeFunctionErrorMessage(parsed)).toMatch(/Vous pourrez renvoyer/)
  })

  it('ignore le message générique supabase-js', async () => {
    const parsed = await readEdgeFunctionError({
      message: 'Edge Function returned a non-2xx status code',
    })
    expect(edgeFunctionErrorMessage(parsed)).not.toMatch(/non-2xx/i)
  })
})
