import type { AuthError } from '@supabase/supabase-js'
import { supabase } from './supabase'

function parseHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

function cleanAuthUrl(): void {
  window.history.replaceState(null, '', window.location.pathname)
}

async function readSessionWithRetry(maxFrames: number): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    await new Promise((r) => requestAnimationFrame(r))
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user) return true
  }
  return false
}

function classifyRecoveryError(err: AuthError | Error): string {
  const message = err.message.toLowerCase()
  if (message.includes('expired') || message.includes('otp_expired')) {
    return 'Ce lien a expiré. Demandez un nouvel email de réinitialisation.'
  }
  if (message.includes('invalid') || message.includes('not found') || message.includes('malformed')) {
    return 'Ce lien est invalide. Demandez un nouvel email de réinitialisation.'
  }
  return 'Impossible de valider ce lien. Demandez un nouvel email de réinitialisation.'
}

/** Établit la session après clic sur le lien « mot de passe oublié » (PKCE, hash ou token_hash). */
export async function establishRecoverySession(): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = new URL(window.location.href)
  const hashParams = parseHashParams()

  const code = url.searchParams.get('code') ?? hashParams.get('code')
  const tokenHash =
    url.searchParams.get('token_hash') ??
    url.searchParams.get('token') ??
    hashParams.get('token_hash') ??
    hashParams.get('token')
  const accessToken = hashParams.get('access_token') ?? url.searchParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') ?? url.searchParams.get('refresh_token')

  if (await readSessionWithRetry(4)) {
    cleanAuthUrl()
    return { ok: true }
  }

  if (code) {
    let exchange = await supabase.auth.exchangeCodeForSession(code)
    if (exchange.error) {
      exchange = await supabase.auth.exchangeCodeForSession(window.location.href)
    }
    if (exchange.error) return { ok: false, error: classifyRecoveryError(exchange.error) }
    if (exchange.data.session?.user) {
      cleanAuthUrl()
      return { ok: true }
    }
  }

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { ok: false, error: classifyRecoveryError(error) }
    if (data.session?.user) {
      cleanAuthUrl()
      return { ok: true }
    }
  }

  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    })
    if (error) return { ok: false, error: classifyRecoveryError(error) }
    if (data.session?.user) {
      cleanAuthUrl()
      return { ok: true }
    }
  }

  if (await readSessionWithRetry(code || accessToken ? 40 : 12)) {
    cleanAuthUrl()
    return { ok: true }
  }

  return { ok: false, error: 'Ce lien est invalide ou a expiré. Demandez un nouvel email de réinitialisation.' }
}
