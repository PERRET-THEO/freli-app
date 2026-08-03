import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from '../components/auth/AuthShell'
import { Button, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

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
      const { data, error: invokeError } = await supabase.functions.invoke('send-password-reset-email', {
        body: { email: email.trim().toLowerCase() },
      })
      if (invokeError) {
        setError('Impossible d’envoyer l’email de réinitialisation.')
        return
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        setError(String(data.error))
        return
      }
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Email envoyé"
        subtitle={
          <>
            Si un compte existe pour <strong>{email}</strong>, tu recevras un lien pour
            réinitialiser ton mot de passe.
          </>
        }
      >
        <Link to="/signin">
          <Button className="w-full">Retour à la connexion</Button>
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Entre ton adresse email pour recevoir un lien de réinitialisation."
      footer={
        <Link
          to="/signin"
          className="block text-center text-sm font-body text-[var(--accent)] hover:underline"
        >
          ← Retour à la connexion
        </Link>
      }
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-1 block text-xs font-body text-[var(--ink-muted)]"
          >
            Email
          </label>
          <Input
            id="forgot-email"
            type="email"
            placeholder="Email pro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        {error && <p className="text-sm font-body text-[var(--amber)]">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
        </Button>
      </form>
    </AuthShell>
  )
}
