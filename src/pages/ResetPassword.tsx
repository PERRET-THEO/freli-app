import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { establishRecoverySession } from '../lib/authRecovery'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

type ResetPhase = 'verifying' | 'form' | 'invalid'

export function ResetPassword() {
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
  }, [])

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
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
            Mot de passe mis à jour
          </h1>
          <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
            Tu peux maintenant te connecter avec ton nouveau mot de passe.
          </p>
          <Link to="/signin">
            <Button className="mt-6 w-full">Se connecter</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'verifying') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <Card className="w-full max-w-md text-center">
          <p className="text-sm font-body text-[var(--ink-muted)]">
            Vérification du lien…
          </p>
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
            {linkError ?? 'Ce lien de réinitialisation ne peut pas être utilisé.'}
          </p>
          <Link to="/forgot-password">
            <Button className="mt-6 w-full">Renvoyer un lien</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Nouveau mot de passe
        </h1>
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
          Choisis un nouveau mot de passe pour ton compte.
        </p>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <Input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <p className="text-sm font-body text-[var(--amber)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
