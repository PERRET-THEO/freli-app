import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/auth/AuthShell'
import { Button, Input } from '../components/ui'
import { resolveAuthCallbackPath } from '../lib/authCallbackRoute'
import { establishRecoverySession } from '../lib/authRecovery'
import { supabase } from '../lib/supabase'

type ResetPhase = 'verifying' | 'form' | 'invalid'

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [phase, setPhase] = useState<ResetPhase>('verifying')
  const [linkError, setLinkError] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const authPath = resolveAuthCallbackPath(window.location.search, window.location.hash)
    if (authPath === '/signup') {
      navigate(`${authPath}${window.location.search}${window.location.hash}`, { replace: true })
      return
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPhase('form')
      }
    })

    void (async () => {
      const result = await establishRecoverySession()
      if (result.ok) {
        setPhase('form')
        return
      }
      setLinkError(result.error)
      setPhase('invalid')
    })()

    return () => listener.subscription.unsubscribe()
  }, [navigate])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      await supabase.auth.signOut()
      setSuccess(true)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell
        title="Mot de passe mis à jour"
        subtitle="Tu peux maintenant te connecter avec ton nouveau mot de passe."
      >
        <Link to="/signin">
          <Button className="w-full">Se connecter</Button>
        </Link>
      </AuthShell>
    )
  }

  if (phase === 'verifying') {
    return (
      <AuthShell title="Réinitialisation" subtitle="Vérification du lien…">
        <p className="text-sm font-body text-[var(--ink-muted)]">Un instant…</p>
      </AuthShell>
    )
  }

  if (phase === 'invalid') {
    return (
      <AuthShell
        title="Lien invalide"
        subtitle={linkError ?? 'Ce lien de réinitialisation ne peut pas être utilisé.'}
      >
        <Link to="/forgot-password">
          <Button className="w-full">Renvoyer un lien</Button>
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Choisis un nouveau mot de passe pour ton compte."
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="reset-password"
            className="mb-1 block text-xs font-body text-[var(--ink-muted)]"
          >
            Nouveau mot de passe
          </label>
          <Input
            id="reset-password"
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label
            htmlFor="reset-password-confirm"
            className="mb-1 block text-xs font-body text-[var(--ink-muted)]"
          >
            Confirmer le mot de passe
          </label>
          <Input
            id="reset-password-confirm"
            type="password"
            placeholder="Confirmer le mot de passe"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        {error && <p className="text-sm font-body text-[var(--amber)]">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
        </Button>
      </form>
    </AuthShell>
  )
}
