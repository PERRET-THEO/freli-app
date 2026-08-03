import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/auth/AuthShell'
import { Button, Input } from '../components/ui'
import { marketingUrl } from '../lib/appUrl'
import { resolveAuthCallbackPath } from '../lib/authCallbackRoute'
import { supabase } from '../lib/supabase'

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
    const authPath = resolveAuthCallbackPath(window.location.search, window.location.hash)
    if (authPath === '/signup') {
      navigate(`${authPath}${window.location.search}${window.location.hash}`, { replace: true })
      return
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
        return
      }
      if (event === 'SIGNED_IN') {
        navigate('/dashboard', { replace: true })
      }
    })

    const hasAuthCallback = authPath === '/reset-password'

    if (!hasAuthCallback) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) navigate('/dashboard', { replace: true })
      })
    }

    return () => listener.subscription.unsubscribe()
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
    <AuthShell
      title="Connexion"
      subtitle="Connecte-toi pour gérer tes onboardings Freli."
      footer={
        <p className="text-center text-sm font-body text-[var(--ink-muted)]">
          Pas encore de compte ?{' '}
          <a
            href={marketingUrl('/tarifs')}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Voir les tarifs
          </a>
        </p>
      }
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="signin-email" className="mb-1 block text-xs font-body text-[var(--ink-muted)]">
            Email
          </label>
          <Input
            id="signin-email"
            type="email"
            placeholder="Email pro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label
            htmlFor="signin-password"
            className="mb-1 block text-xs font-body text-[var(--ink-muted)]"
          >
            Mot de passe
          </label>
          <Input
            id="signin-password"
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="text-sm font-body text-[var(--amber)]">{error}</p>}

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
    </AuthShell>
  )
}
