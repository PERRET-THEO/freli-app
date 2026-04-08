import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

function getErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) {
    return 'Email ou mot de passe incorrect.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Adresse email non confirmée. Vérifie ta boîte mail.'
  }
  return 'Une erreur est survenue. Merci de réessayer.'
}

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/dashboard', { replace: true })
    })
  }, [navigate])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(getErrorMessage(signInError.message))
        return
      }
      navigate('/dashboard', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          Connexion
        </h1>
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
          Connecte-toi pour gérer tes onboardings Freli.
        </p>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="Email pro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && (
            <p className="text-sm font-body text-[var(--amber)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Chargement...' : 'Se connecter'}
          </Button>
        </form>

        <Link
          to="/forgot-password"
          className="mt-4 block text-center text-sm font-body text-[var(--accent)] hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </Card>
    </div>
  )
}
