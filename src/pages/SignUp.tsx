import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AuthError, Session } from '@supabase/supabase-js'
import { getOrCreateAgency } from '../lib/agency'
import {
  completeSaasSignup,
  verifySaasCheckout,
} from '../lib/billing/saasCheckout'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

type SignUpPhase =
  | 'verifying'
  | 'form'
  | 'saas_form'
  | 'invalid'
  | 'expired'
  | 'already_registered'
  | 'payment_pending'

function parseHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

function replaceSignupUrlClean(keepSessionId?: string | null): void {
  const next = keepSessionId
    ? `${window.location.pathname}?session_id=${encodeURIComponent(keepSessionId)}`
    : `${window.location.pathname}`
  window.history.replaceState(null, '', next)
}

async function confirmSessionThenCleanUrl(): Promise<Session | null> {
  await new Promise((r) => requestAnimationFrame(r))
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user) {
    replaceSignupUrlClean()
  }
  return session
}

function classifyError(err: AuthError | Error): SignUpPhase {
  const m = err.message.toLowerCase()
  if (m.includes('expired') || m.includes('otp_expired')) return 'expired'
  if (
    m.includes('already') &&
    (m.includes('registered') || m.includes('exists') || m.includes('user'))
  ) {
    return 'already_registered'
  }
  if (m.includes('invalid') || m.includes('not found') || m.includes('malformed')) {
    return 'invalid'
  }
  return 'invalid'
}

async function readSessionWithRetry(maxFrames: number): Promise<Session | null> {
  for (let i = 0; i < maxFrames; i++) {
    await new Promise((r) => requestAnimationFrame(r))
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user) return session
  }
  return null
}

/**
 * Après clic sur le lien d’invitation : PKCE (?code=), hash (#access_token), ou ?token_hash&type=invite.
 */
async function establishInviteSession(): Promise<{ session: Session | null; phase: SignUpPhase }> {
  const url = new URL(window.location.href)
  const hashParams = parseHashParams()
  const oauthErr = url.searchParams.get('error') ?? hashParams.get('error')
  const errorCode = url.searchParams.get('error_code') ?? hashParams.get('error_code')
  const oauthDesc = (
    url.searchParams.get('error_description') ?? hashParams.get('error_description') ?? ''
  ).toLowerCase()

  const code = url.searchParams.get('code') ?? hashParams.get('code')
  const tokenHash =
    url.searchParams.get('token_hash') ??
    url.searchParams.get('token') ??
    hashParams.get('token_hash') ??
    hashParams.get('token')
  const type = url.searchParams.get('type') ?? hashParams.get('type')
  const accessToken = hashParams.get('access_token') ?? url.searchParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') ?? url.searchParams.get('refresh_token')
  const hasImplicitHash = Boolean(accessToken)

  const early = await readSessionWithRetry(4)
  if (early?.user) return { session: early, phase: 'form' }

  const hasRecoverableSignal = Boolean(code || tokenHash || hasImplicitHash)
  const otpExpiredButHasTokens = errorCode === 'otp_expired' && hasImplicitHash

  if (oauthErr && !hasRecoverableSignal && !otpExpiredButHasTokens) {
    if (oauthDesc.includes('expired') || oauthErr === 'access_denied') {
      return { session: null, phase: 'expired' }
    }
    return { session: null, phase: 'invalid' }
  }

  if (code) {
    let exchange = await supabase.auth.exchangeCodeForSession(code)
    if (exchange.error) {
      exchange = await supabase.auth.exchangeCodeForSession(window.location.href)
    }
    if (exchange.error) return { session: null, phase: classifyError(exchange.error) }
    if (exchange.data.session?.user) return { session: exchange.data.session, phase: 'form' }
  }

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) return { session: null, phase: classifyError(error) }
    if (data.session?.user) return { session: data.session, phase: 'form' }
  }

  if (tokenHash) {
    const candidateTypes: Array<'invite' | 'signup' | 'magiclink'> =
      type === 'invite'
        ? ['invite']
        : type === 'signup'
          ? ['signup']
          : type === 'magiclink'
            ? ['magiclink']
            : ['invite', 'signup', 'magiclink']

    let lastError: AuthError | null = null
    for (const otpType of candidateTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      })
      if (!error && data.session?.user) {
        return { session: data.session, phase: 'form' }
      }
      if (error) lastError = error
    }
    if (lastError) return { session: null, phase: classifyError(lastError) }
  }

  const retryFrames = hasImplicitHash || code ? 40 : 12
  const implicit = await readSessionWithRetry(retryFrames)
  if (implicit?.user) return { session: implicit, phase: 'form' }

  const {
    data: { session: last },
  } = await supabase.auth.getSession()
  if (last?.user) return { session: last, phase: 'form' }

  return { session: null, phase: 'invalid' }
}

export function SignUp() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<SignUpPhase>('verifying')
  const [emailLocked, setEmailLocked] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saasSessionId, setSaasSessionId] = useState<string | null>(null)
  const submitLock = useRef(false)
  const ranRef = useRef(false)
  const authListenerRef = useRef<{ unsubscribe: () => void } | null>(null)

  const finishWithSession = useCallback(async (session: Session, emailDecoded: string) => {
    setEmailLocked(session.user.email ?? emailDecoded)
    setPhase('form')
    await confirmSessionThenCleanUrl()
  }, [])

  const runEstablish = useCallback(async () => {
    const url = new URL(window.location.href)
    const hashParams = parseHashParams()
    const sessionId = url.searchParams.get('session_id')?.trim() ?? ''

    // Self-serve post-Checkout : prioritaire sur le flux invite.
    if (sessionId.startsWith('cs_')) {
      setSaasSessionId(sessionId)
      const verified = await verifySaasCheckout(sessionId)
      if ('error' in verified) {
        setError(verified.error)
        setPhase('invalid')
        return
      }
      if (!verified.paid) {
        setPhase('payment_pending')
        return
      }
      if (verified.existingUser) {
        setEmailLocked(verified.email)
        await completeSaasSignup({ sessionId, linkOnly: true })
        setPhase('already_registered')
        return
      }
      if (!verified.email) {
        setError('Email introuvable sur le paiement. Contactez le support.')
        setPhase('invalid')
        return
      }
      setEmailLocked(verified.email)
      replaceSignupUrlClean(sessionId)
      setPhase('saas_form')
      return
    }

    const emailParam = url.searchParams.get('email') ?? hashParams.get('email')
    const emailDecoded = emailParam
      ? decodeURIComponent(emailParam.replace(/\+/g, ' ')).trim()
      : ''

    const { session, phase: next } = await establishInviteSession()

    if (next !== 'form' || !session?.user) {
      setPhase(next)
      return
    }

    await finishWithSession(session, emailDecoded)
  }, [finishWithSession])

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    void runEstablish()
  }, [runEstablish])

  useEffect(() => {
    if (phase !== 'verifying' || saasSessionId) {
      authListenerRef.current?.unsubscribe()
      authListenerRef.current = null
      return
    }

    const url = new URL(window.location.href)
    const hashParams = parseHashParams()
    const emailParam = url.searchParams.get('email') ?? hashParams.get('email')
    const emailDecoded = emailParam
      ? decodeURIComponent(emailParam.replace(/\+/g, ' ')).trim()
      : ''

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        void finishWithSession(session, emailDecoded)
      }
    })
    authListenerRef.current = data.subscription

    return () => {
      data.subscription.unsubscribe()
    }
  }, [phase, finishWithSession, saasSessionId])

  const handleInviteSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitLock.current) return
    setError(null)

    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    submitLock.current = true
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user) {
        setPhase('invalid')
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        const msg = updateError.message.toLowerCase()
        if (msg.includes('already')) {
          setPhase('already_registered')
        } else {
          setError(updateError.message)
        }
        return
      }

      await getOrCreateAgency(session.user.id)
      navigate('/dashboard', { replace: true })
    } finally {
      setLoading(false)
      submitLock.current = false
    }
  }

  const handleSaasSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitLock.current || !saasSessionId) return
    setError(null)

    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    submitLock.current = true
    setLoading(true)
    try {
      const result = await completeSaasSignup({
        sessionId: saasSessionId,
        password,
        agencyName: agencyName.trim() || undefined,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      if (result.alreadyRegistered) {
        setPhase('already_registered')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: result.email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        setPhase('already_registered')
        return
      }
      navigate('/dashboard', { replace: true })
    } finally {
      setLoading(false)
      submitLock.current = false
    }
  }

  if (phase === 'verifying') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <p className="text-sm font-body text-[var(--ink-muted)]">
          {saasSessionId ? 'Vérification du paiement…' : 'Validation de ton invitation…'}
        </p>
      </div>
    )
  }

  if (phase === 'payment_pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
            Paiement en cours
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            Le paiement n&apos;est pas encore confirmé. Réessaie dans un instant ou reviens depuis
            l&apos;email de confirmation.
          </p>
          <Link to="/tarifs">
            <Button className="mt-6 w-full">Retour aux tarifs</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
            Lien expiré
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            Ce lien d&apos;invitation a expiré. Demande un nouvel email d&apos;invitation.
          </p>
          <Link to="/signin">
            <Button className="mt-6 w-full">Aller à la connexion</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'already_registered') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
            Compte déjà actif
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            {emailLocked
              ? `Connecte-toi avec ${emailLocked} pour accéder à Freli.`
              : 'Tu peux te connecter avec ton email et ton mot de passe.'}
          </p>
          <Link to="/signin">
            <Button className="mt-6 w-full">Se connecter</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]">
            Lien invalide
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            {error ??
              'Ce lien n’est pas valide. Ouvre le lien depuis ton email d’invitation ou finalise le paiement depuis la page tarifs.'}
          </p>
          <Link to="/signin">
            <Button className="mt-6 w-full">Aller à la connexion</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'saas_form') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
            Crée ton compte Freli
          </h1>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
            Paiement confirmé. Choisis ton mot de passe pour accéder à Freli.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleSaasSubmit}>
            <div>
              <label className="mb-1 block text-xs font-body text-[var(--ink-muted)]">Email</label>
              <Input
                type="email"
                value={emailLocked}
                readOnly
                className="bg-[var(--surface-warm)]"
                autoComplete="username"
              />
            </div>
            <Input
              type="text"
              placeholder="Nom de l’agence (optionnel)"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              autoComplete="organization"
            />
            <Input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirmer le mot de passe"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />

            {error && <p className="text-sm font-body text-[var(--amber)]">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Création…' : 'Accéder à Freli'}
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Bienvenue sur Freli
        </h1>
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
          Choisis ton mot de passe pour activer ton compte.
        </p>

        <form className="mt-6 space-y-3" onSubmit={handleInviteSubmit}>
          <div>
            <label className="mb-1 block text-xs font-body text-[var(--ink-muted)]">Email</label>
            <Input
              type="email"
              value={emailLocked}
              readOnly
              className="bg-[var(--surface-warm)]"
              autoComplete="username"
            />
          </div>
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />

          {error && <p className="text-sm font-body text-[var(--amber)]">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Activation…' : 'Activer mon compte'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
