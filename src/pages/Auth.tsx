import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'

export function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<
    string | null
  >(null)
  const navigate = useNavigate()

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/dashboard', { replace: true })
      }
    }

    checkSession()
  }, [navigate])

  const subtitle = useMemo(
    () =>
      mode === 'login'
        ? 'Connecte-toi pour gérer tes onboardings Freli.'
        : 'Crée ton compte Freli pour lancer tes premiers onboardings.',
    [mode],
  )

  const getErrorMessage = (message: string) => {
    const normalized = message.toLowerCase()
    if (normalized.includes('invalid login credentials')) {
      return 'Email ou mot de passe incorrect.'
    }
    if (normalized.includes('user already registered')) {
      return 'Cet email est déjà utilisé. Essaie de te connecter.'
    }
    if (normalized.includes('password')) {
      return 'Le mot de passe doit etre plus robuste.'
    }
    return 'Une erreur est survenue. Merci de réessayer.'
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setPendingConfirmationEmail(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setError(getErrorMessage(signInError.message))
          return
        }

        navigate('/dashboard', { replace: true })
        return
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })

        if (signUpError) {
          setError(getErrorMessage(signUpError.message))
          return
        }

        if (data.session) {
          navigate('/dashboard/new', { replace: true })
          return
        }

        setPendingConfirmationEmail(email)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
      <Card className="w-full max-w-md">
        {pendingConfirmationEmail ? (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Vérifie ton email
            </h1>
            <p className="mt-3 text-sm font-body leading-relaxed text-[var(--ink-soft)]">
              Un email de confirmation a été envoyé à {pendingConfirmationEmail}.
              Clique sur le lien pour activer ton compte.
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => {
                setPendingConfirmationEmail(null)
                setMode('login')
                setPassword('')
                setError(null)
              }}
            >
              J&apos;ai confirmé mon email → Se connecter
            </Button>
          </>
        ) : (
          <>
        <div className="mb-6 flex rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-[var(--radius-xs)] px-3 py-2 text-sm font-body transition ${
              mode === 'login'
                ? 'bg-[var(--white)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-[var(--radius-xs)] px-3 py-2 text-sm font-body transition ${
              mode === 'register'
                ? 'bg-[var(--white)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            Créer un compte
          </button>
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>
        <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
          {subtitle}
        </p>

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="Email pro"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />

          {error ? (
            <p className="text-sm font-body text-[var(--amber)]">{error}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? 'Chargement...'
              : mode === 'login'
                ? 'Se connecter'
                : 'Créer mon compte'}
          </Button>
        </form>
          </>
        )}
      </Card>
    </div>
  )
}
