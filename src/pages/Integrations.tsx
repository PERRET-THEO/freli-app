import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Card, Input } from '../components/ui'
import { isGoogleDriveConnected, parseGoogleDriveConfig } from '../lib/integrations/googleDrive'
import { isStripeReadyForCheckout, parseStripeConfig } from '../lib/integrations/stripe'
import { startGoogleDriveOAuth as launchGoogleDriveOAuth } from '../lib/googleDriveConnect'
import { openStripeExpressDashboard } from '../lib/stripeConnectDashboard'
import { supabase } from '../lib/supabase'

type IntegrationRow = {
  id: string
  provider: string
  config: Record<string, unknown>
}

type ProviderKey = 'stripe' | 'google_drive' | 'hubspot'

const PROVIDERS: { key: ProviderKey; label: string; icon: string; description: string }[] = [
  {
    key: 'stripe',
    label: 'Stripe',
    icon: '💳',
    description: 'Encaissez automatiquement vos clients à la fin de l\u2019onboarding.',
  },
  {
    key: 'google_drive',
    label: 'Google Drive',
    icon: '📁',
    description: 'Créez automatiquement un dossier client dans votre Drive.',
  },
  {
    key: 'hubspot',
    label: 'HubSpot',
    icon: '📊',
    description: 'Ajoutez automatiquement le contact client dans votre CRM.',
  },
]

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [saving, setSaving] = useState<ProviderKey | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [stripeError, setStripeError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [hubspotKey, setHubspotKey] = useState('')

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        navigate('/signin', { replace: true })
        return
      }
      setUserId(userData.user.id)

      const { data } = await supabase
        .from('integrations')
        .select('id, provider, config')
        .eq('user_id', userData.user.id)

      const rows = (data ?? []) as IntegrationRow[]
      setIntegrations(rows)

      const hubspot = rows.find((r) => r.provider === 'hubspot')
      if (hubspot) setHubspotKey(String(hubspot.config?.apiKey ?? ''))

      setLoading(false)
    }
    load()
  }, [navigate])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    const stripeParam = searchParams.get('stripe')
    if (stripeParam !== 'return' && stripeParam !== 'refresh') return

    const sync = async () => {
      const { data: userData } = await supabase.auth.getUser()
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('stripe')
          return next
        },
        { replace: true },
      )
      if (!userData.user) return

      const { data, error } = await supabase.functions.invoke('stripe-connect-status', {
        body: {},
      })

      if (error) {
        setStripeError(error.message)
        return
      }
      const payload = data as {
        charges_enabled?: boolean
        connected?: boolean
        error?: string
      } | null
      if (payload?.error) {
        setStripeError(payload.error)
        return
      }
      if (payload?.charges_enabled) {
        showToast('Stripe est prêt à encaisser les paiements.')
      } else if (payload?.connected) {
        showToast('Compte Stripe lié — finalisez l’inscription si besoin.')
      }

      const { data: rows } = await supabase
        .from('integrations')
        .select('id, provider, config')
        .eq('user_id', userData.user.id)

      setIntegrations((rows ?? []) as IntegrationRow[])
    }

    void sync()
  }, [searchParams, setSearchParams, showToast])

  useEffect(() => {
    const googleParam = searchParams.get('google')
    if (!googleParam) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('google')
        next.delete('message')
        return next
      },
      { replace: true },
    )

    if (googleParam === 'return') {
      showToast('Google Drive connecté.')
      void (async () => {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) return
        const { data: rows } = await supabase
          .from('integrations')
          .select('id, provider, config')
          .eq('user_id', userData.user.id)
        setIntegrations((rows ?? []) as IntegrationRow[])
      })()
    } else if (googleParam === 'error') {
      const msg = searchParams.get('message')
      setGoogleError(msg ? decodeURIComponent(msg) : 'Connexion Google Drive annulée ou échouée.')
    }
  }, [searchParams, setSearchParams, showToast])

  const isConnected = (provider: ProviderKey) => {
    const row = integrations.find((i) => i.provider === provider)
    if (!row) return false
    if (provider === 'google_drive') {
      return isGoogleDriveConnected(parseGoogleDriveConfig(row.config))
    }
    return true
  }

  const startStripeOnboarding = async () => {
    if (!userId) return
    setStripeError(null)
    setSaving('stripe')
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-start', { body: {} })
      if (error) {
        setStripeError(error.message)
        console.error('stripe-connect-start:', error)
        return
      }
      const payload = data as { url?: string; error?: string } | null
      if (payload?.error) {
        setStripeError(payload.error)
        return
      }
      if (payload?.url) {
        window.location.href = payload.url
        return
      }
      setStripeError('Réponse Stripe inattendue')
    } finally {
      setSaving(null)
    }
  }

  const disconnectStripe = async () => {
    if (!userId) return
    setStripeError(null)
    setSaving('stripe')
    const existing = integrations.find((i) => i.provider === 'stripe')
    if (existing) {
      const { error } = await supabase.from('integrations').delete().eq('id', existing.id)
      if (error) {
        setStripeError(error.message)
        console.error('Stripe disconnect:', error)
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Stripe déconnecté')
      }
    }
    setSaving(null)
  }

  const openStripeDashboard = async () => {
    setStripeError(null)
    setSaving('stripe')
    try {
      await openStripeExpressDashboard()
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : 'Impossible d\'ouvrir l\'espace Stripe')
    } finally {
      setSaving(null)
    }
  }

  const connectGoogleDrive = async () => {
    if (!userId) return
    setGoogleError(null)
    setSaving('google_drive')
    try {
      await launchGoogleDriveOAuth()
    } catch (e) {
      setGoogleError(e instanceof Error ? e.message : 'Impossible de connecter Google Drive')
    } finally {
      setSaving(null)
    }
  }

  const disconnectGoogleDrive = async () => {
    if (!userId) return
    setGoogleError(null)
    setSaving('google_drive')
    const existing = integrations.find((i) => i.provider === 'google_drive')
    if (existing) {
      const { error } = await supabase.from('integrations').delete().eq('id', existing.id)
      if (error) {
        setGoogleError(error.message)
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        showToast('Google Drive déconnecté')
      }
    }
    setSaving(null)
  }

  const handleToggleHubspot = async () => {
    if (!userId) return
    setSaving('hubspot')

    if (isConnected('hubspot')) {
      const existing = integrations.find((i) => i.provider === 'hubspot')
      if (existing) {
        await supabase.from('integrations').delete().eq('id', existing.id)
        setIntegrations((prev) => prev.filter((i) => i.id !== existing.id))
        setHubspotKey('')
        showToast('HubSpot déconnecté')
      }
    } else {
      if (!hubspotKey.trim()) return
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          user_id: userId,
          provider: 'hubspot',
          access_token: hubspotKey.trim(),
          config: { apiKey: hubspotKey.trim(), createDeal: false },
        })
        .select('id, provider, config')
        .single()

      if (!error && data) {
        setIntegrations((prev) => [...prev, data as IntegrationRow])
        showToast('HubSpot connecté')
      }
    }
    setSaving(null)
  }

  const stripeRow = integrations.find((i) => i.provider === 'stripe')
  const stripeCfg = parseStripeConfig(stripeRow?.config)
  const stripeCheckoutReady = isStripeReadyForCheckout(stripeCfg)
  const googleRow = integrations.find((i) => i.provider === 'google_drive')
  const googleCfg = parseGoogleDriveConfig(googleRow?.config)

  if (loading) {
    return (
      <DashboardLayout title="Intégrations" subtitle="Stripe, relances et outils" maxWidth="4xl">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      title="Intégrations"
      subtitle="Connectez vos outils pour automatiser la fin d'onboarding."
      maxWidth="4xl"
    >
        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const connected = isConnected(provider.key)
            const isSaving = saving === provider.key

            return (
              <Card key={provider.key}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
                          {provider.label}
                        </h2>
                        {connected && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                              provider.key === 'stripe' && stripeRow && !stripeCheckoutReady
                                ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
                                : 'bg-[var(--mint-soft)] text-[var(--mint)]'
                            }`}
                          >
                            {provider.key === 'stripe' && stripeRow && !stripeCheckoutReady
                              ? 'À finaliser'
                              : 'Connecté'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                </div>

                {provider.key === 'stripe' && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-body text-[var(--ink-muted)]">
                      Les paiements vont sur <strong>votre</strong> compte Stripe (Connect Express). Le
                      montant par projet est défini à la création (« Prix (€) »).
                    </p>
                    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
                      <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs font-body text-[var(--ink-muted)]">
                        <li>Connectez votre compte Stripe (Connect Express).</li>
                        <li>Définissez un prix lors de la création du projet.</li>
                        <li>À la fin de l'onboarding, le client reçoit automatiquement un lien de paiement par email — vous pouvez aussi le renvoyer depuis la fiche projet.</li>
                      </ol>
                    </div>
                    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
                      <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Où va l&apos;argent ?</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs font-body text-[var(--ink-muted)]">
                        <li>Quand le client paie, l&apos;argent arrive sur <strong>votre compte Stripe Connect</strong>.</li>
                        <li>Stripe verse <strong>automatiquement</strong> sur votre IBAN selon son calendrier — rien à faire dans Freli.</li>
                        <li>Le badge « Payé » dans Freli confirme le paiement client ; le virement bancaire se consulte dans Stripe.</li>
                      </ul>
                    </div>
                    {stripeRow && stripeCfg.stripe_connect_account_id && (
                      <p className="text-xs font-body text-[var(--ink-muted)]">
                        Compte connecté : …{stripeCfg.stripe_connect_account_id.slice(-6)}
                        {stripeCheckoutReady ? ' — prêt à encaisser.' : ' — finalisez l’inscription chez Stripe.'}
                      </p>
                    )}
                    {stripeRow && !stripeCheckoutReady && (
                      <p className="rounded-[var(--radius-sm)] bg-[var(--amber-soft)] px-3 py-2 text-xs font-body text-[var(--amber)]">
                        ⚠️ Votre compte est lié mais pas encore prêt à encaisser (charges_enabled). Tant que l'inscription Stripe n'est pas finalisée, aucun lien de paiement ne sera envoyé aux clients.
                      </p>
                    )}
                    {stripeError ? (
                      <p className="text-sm font-body text-[var(--amber)]">{stripeError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {(!connected || !stripeCheckoutReady) && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={startStripeOnboarding}
                          className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
                        >
                          {isSaving
                            ? '...'
                            : connected
                              ? 'Poursuivre l’inscription Stripe'
                              : 'Connecter mon compte Stripe'}
                        </button>
                      )}
                      {connected && (
                        <>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={openStripeDashboard}
                            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            {isSaving ? '...' : 'Ouvrir mon espace Stripe'}
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={disconnectStripe}
                            className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
                          >
                            Déconnecter Stripe
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {provider.key === 'google_drive' && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
                      <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs font-body text-[var(--ink-muted)]">
                        <li>Connectez votre compte Google (OAuth).</li>
                        <li>À la fin de l&apos;onboarding client, Freli crée un dossier <strong>Clients / Nom du client</strong> dans votre Drive.</li>
                        <li>Le lien du dossier apparaît sur la fiche projet.</li>
                      </ol>
                    </div>
                    {googleCfg.google_email && (
                      <p className="text-xs font-body text-[var(--ink-muted)]">
                        Compte Google : {googleCfg.google_email}
                      </p>
                    )}
                    {googleError ? (
                      <p className="text-sm font-body text-[var(--amber)]">{googleError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {!connected ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={connectGoogleDrive}
                          className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
                        >
                          {isSaving ? '...' : 'Connecter Google Drive'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={disconnectGoogleDrive}
                          className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
                        >
                          Déconnecter Google Drive
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {provider.key === 'hubspot' && (
                  <div className="mt-4 space-y-3">
                    {!connected && (
                      <div>
                        <label className="mb-1 block text-xs font-body text-[var(--ink-muted)]">
                          Clé API HubSpot
                        </label>
                        <Input
                          type="password"
                          placeholder="pat-na1-..."
                          value={hubspotKey}
                          onChange={(e) => setHubspotKey(e.target.value)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={isSaving || (!connected && !hubspotKey.trim())}
                      onClick={handleToggleHubspot}
                      className={`rounded-[var(--radius-sm)] px-5 py-2.5 text-sm font-body font-medium transition disabled:opacity-50 ${
                        connected
                          ? 'border border-[#EF4444] bg-transparent text-[#EF4444] hover:bg-[#FEF2F2]'
                          : 'bg-[var(--accent)] text-[var(--white)] hover:brightness-95'
                      }`}
                    >
                      {isSaving
                        ? '...'
                        : connected
                          ? 'Déconnecter HubSpot'
                          : 'Connecter HubSpot'}
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </DashboardLayout>
  )
}
