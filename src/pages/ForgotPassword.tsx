import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

const APP_URL = import.meta.env.VITE_SUPABASE_URL
  ? window.location.origin
  : 'http://localhost:5173'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${APP_URL}/reset-password`,
      })
      if (resetError) {
        setError(resetError.message)
        return
      }
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        {sent ? (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Email envoyé
            </h1>
            <p className="mt-3 text-sm font-body leading-relaxed text-[var(--ink-soft)]">
              Si un compte existe pour <strong>{email}</strong>, tu recevras un lien pour
              réinitialiser ton mot de passe.
            </p>
            <Link to="/signin">
              <Button className="mt-6 w-full">Retour à la connexion</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Mot de passe oublié
            </h1>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              Entre ton adresse email pour recevoir un lien de réinitialisation.
            </p>

            <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
              <Input
                type="email"
                placeholder="Email pro"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <p className="text-sm font-body text-[var(--amber)]">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </Button>
            </form>

            <Link
              to="/signin"
              className="mt-4 block text-center text-sm font-body text-[var(--accent)] hover:underline"
            >
              ← Retour à la connexion
            </Link>
          </>
        )}
      </Card>
    </div>
  )
}
