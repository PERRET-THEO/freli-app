import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AuthError, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

type SignUpPhase =
  | 'verifying'
  | 'form'
  | 'invalid'
  | 'expired'
  | 'already_registered'

function parseHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

/** Nettoie l’URL après établissement de session (tokens, codes). */
function replaceSignupUrlClean(): void {
  window.history.replaceState(null, '', `${window.location.pathname}`)
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
  const oauthErr = url.searchParams.get('error')
  const oauthDesc = (url.searchParams.get('error_description') ?? '').toLowerCase()
  if (oauthErr) {
    if (oauthDesc.includes('expired') || oauthErr === 'access_denied') {
      return { session: null, phase: 'expired' }
    }
    return { session: null, phase: 'invalid' }
  }

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token')
  const type = url.searchParams.get('type')
  const hashParams = parseHashParams()
  const hasImplicitHash = Boolean(hashParams.get('access_token'))

  const early = await readSessionWithRetry(4)
  if (early?.user) return { session: early, phase: 'form' }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href)
    if (error) return { session: null, phase: classifyError(error) }
    if (data.session?.user) return { session: data.session, phase: 'form' }
  }

  if (tokenHash && type === 'invite') {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'invite',
    })
    if (error) return { session: null, phase: classifyError(error) }
    if (data.session?.user) return { session: data.session, phase: 'form' }
  }

  const implicit = await readSessionWithRetry(hasImplicitHash || code ? 32 : 8)
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitLock = useRef(false)
  const ranRef = useRef(false)

  const runEstablish = useCallback(async () => {
    const url = new URL(window.location.href)
    const emailParam = url.searchParams.get('email')
    const emailDecoded = emailParam
      ? decodeURIComponent(emailParam.replace(/\+/g, ' ')).trim()
      : ''

    const { session, phase: next } = await establishInviteSession()

    if (next !== 'form' || !session?.user) {
      setPhase(next)
      return
    }

    setEmailLocked(session.user.email ?? emailDecoded)
    setPhase('form')
    replaceSignupUrlClean()
  }, [])

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    void runEstablish()
  }, [runEstablish])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
          Validation de ton invitation…
        </p>
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
            Tu peux te connecter avec ton email et ton mot de passe.
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
            Ce lien d&apos;invitation n&apos;est pas valide. Ouvre le lien depuis le dernier email
            d&apos;invitation reçu.
          </p>
          <Link to="/signin">
            <Button className="mt-6 w-full">Aller à la connexion</Button>
          </Link>
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

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
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
