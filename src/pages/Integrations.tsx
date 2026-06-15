import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Card, Input } from '../components/ui'
import { isGoogleDriveConnected, parseGoogleDriveConfig } from '../lib/integrations/googleDrive'
import { isStripeReadyForCheckout, parseStripeConfig } from '../lib/integrations/stripe'
import {
  generateWebhookSecret,
  maskWebhookUrl,
  MAX_WEBHOOKS_PER_USER,
  parseWebhookConfig,
  validateWebhookUrlClient,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from '../lib/integrations/webhooks'
import { WebhookSetupGuide } from '../components/integrations/WebhookSetupGuide'
import { startGoogleDriveOAuth as launchGoogleDriveOAuth } from '../lib/googleDriveConnect'
import { openStripeExpressDashboard } from '../lib/stripeConnectDashboard'
import { supabase } from '../lib/supabase'

type IntegrationRow = {
  id: string
  provider: string
  config: Record<string, unknown>
}

type ProviderKey = 'stripe' | 'google_drive'

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
]

export function Integrations() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [saving, setSaving] = useState<ProviderKey | 'webhook' | null>(null)
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [stripeError, setStripeError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [newWebhookLabel, setNewWebhookLabel] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvents, setNewWebhookEvents] = useState<WebhookEvent[]>([
    'project.completed',
  ])
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const webhookRows = integrations.filter((i) => i.provider === 'webhook')

  const reloadIntegrations = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('integrations')
      .select('id, provider, config')
      .eq('user_id', uid)
    setIntegrations((data ?? []) as IntegrationRow[])
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        navigate('/signin', { replace: true })
        return
      }
      setUserId(userData.user.id)
      await reloadIntegrations(userData.user.id)
      setLoading(false)
    }
    load()
  }, [navigate, reloadIntegrations])

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
        showToast('Compte Stripe lié — finalisez l\u2019inscription si besoin.')
      }

      await reloadIntegrations(userData.user.id)
    }

    void sync()
  }, [searchParams, setSearchParams, showToast, reloadIntegrations])

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
        await reloadIntegrations(userData.user.id)
      })()
    } else if (googleParam === 'error') {
      const msg = searchParams.get('message')
      setGoogleError(msg ? decodeURIComponent(msg) : 'Connexion Google Drive annulée ou échouée.')
    }
  }, [searchParams, setSearchParams, showToast, reloadIntegrations])

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
      setStripeError(e instanceof Error ? e.message : 'Impossible d\u2019ouvrir l\u2019espace Stripe')
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

  const toggleWebhookEvent = (event: WebhookEvent) => {
    setNewWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const handleAddWebhook = async () => {
    if (!userId) return
    setWebhookError(null)

    if (webhookRows.length >= MAX_WEBHOOKS_PER_USER) {
      setWebhookError(`Maximum ${MAX_WEBHOOKS_PER_USER} webhooks par compte.`)
      return
    }

    const urlError = validateWebhookUrlClient(newWebhookUrl)
    if (urlError) {
      setWebhookError(urlError)
      return
    }

    if (newWebhookEvents.length === 0) {
      setWebhookError('Sélectionnez au moins un événement.')
      return
    }

    const label = newWebhookLabel.trim() || 'Webhook'
    const secret = generateWebhookSecret()

    setSaving('webhook')
    const { data, error } = await supabase
      .from('integrations')
      .insert({
        user_id: userId,
        provider: 'webhook',
        access_token: secret,
        config: {
          url: newWebhookUrl.trim(),
          label,
          events: newWebhookEvents,
          enabled: true,
        },
      })
      .select('id, provider, config')
      .single()

    setSaving(null)

    if (error || !data) {
      setWebhookError(error?.message ?? 'Impossible d\u2019ajouter le webhook.')
      return
    }

    setIntegrations((prev) => [...prev, data as IntegrationRow])
    setNewWebhookLabel('')
    setNewWebhookUrl('')
    setNewWebhookEvents(['project.completed'])
    setRevealedSecret(secret)
    showToast('Webhook ajouté.')
  }

  const handleToggleWebhook = async (row: IntegrationRow) => {
    const cfg = parseWebhookConfig(row.config)
    const { error } = await supabase
      .from('integrations')
      .update({ config: { ...row.config, enabled: !cfg.enabled } })
      .eq('id', row.id)

    if (error) {
      setWebhookError(error.message)
      return
    }

    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === row.id
          ? { ...i, config: { ...i.config, enabled: !cfg.enabled } }
          : i,
      ),
    )
  }

  const handleDeleteWebhook = async (row: IntegrationRow) => {
    const { error } = await supabase.from('integrations').delete().eq('id', row.id)
    if (error) {
      setWebhookError(error.message)
      return
    }
    setIntegrations((prev) => prev.filter((i) => i.id !== row.id))
    showToast('Webhook supprimé.')
  }

  const handleTestWebhook = async (webhookId: string) => {
    setWebhookError(null)
    setTestingWebhookId(webhookId)
    try {
      const { data, error } = await supabase.functions.invoke('test-webhook', {
        body: { webhookId },
      })
      if (error) {
        setWebhookError('Test échoué — vérifiez l\u2019URL du webhook.')
        return
      }
      const payload = data as { ok?: boolean; error?: string } | null
      if (!payload?.ok) {
        setWebhookError(payload?.error ?? 'Test échoué.')
        return
      }
      showToast('Webhook de test envoyé.')
    } finally {
      setTestingWebhookId(null)
    }
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
                      <li>À la fin de l&apos;onboarding, le client reçoit automatiquement un lien de paiement par email — vous pouvez aussi le renvoyer depuis la fiche projet.</li>
                    </ol>
                  </div>
                  {stripeRow && stripeCfg.stripe_connect_account_id && (
                    <p className="text-xs font-body text-[var(--ink-muted)]">
                      Compte connecté : …{stripeCfg.stripe_connect_account_id.slice(-6)}
                      {stripeCheckoutReady ? ' — prêt à encaisser.' : ' — finalisez l\u2019inscription chez Stripe.'}
                    </p>
                  )}
                  {stripeRow && !stripeCheckoutReady && (
                    <p className="rounded-[var(--radius-sm)] bg-[var(--amber-soft)] px-3 py-2 text-xs font-body text-[var(--amber)]">
                      Votre compte est lié mais pas encore prêt à encaisser. Finalisez l&apos;inscription Stripe pour envoyer des liens de paiement.
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
                            ? 'Poursuivre l\u2019inscription Stripe'
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
                      <li>À la fin de l&apos;onboarding client, Freli crée un dossier <strong>Clients / Nom du client</strong> et y dépose <strong>les documents, contrats signés et un récap checklist</strong>.</li>
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
            </Card>
          )
        })}

        <Card>
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔗</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Webhooks</h2>
              <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
                Connectez Freli à Zapier, Make, n8n, Slack, Notion, Airtable… via une URL de webhook HTTPS.
              </p>
            </div>
          </div>

          <WebhookSetupGuide />

          {webhookRows.length > 0 && (
            <ul className="mt-4 space-y-3">
              {webhookRows.map((row) => {
                const cfg = parseWebhookConfig(row.config)
                return (
                  <li
                    key={row.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body text-sm font-medium text-[var(--ink)]">{cfg.label}</p>
                        <p className="mt-0.5 truncate font-body text-xs text-[var(--ink-muted)]">
                          {maskWebhookUrl(cfg.url)}
                        </p>
                        <p className="mt-2 font-body text-xs text-[var(--ink-soft)]">
                          {cfg.events.map((e) => WEBHOOK_EVENT_LABELS[e]?.label ?? e).join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleWebhook(row)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                            cfg.enabled
                              ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                              : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'
                          }`}
                        >
                          {cfg.enabled ? 'Actif' : 'Inactif'}
                        </button>
                        <button
                          type="button"
                          disabled={testingWebhookId === row.id}
                          onClick={() => handleTestWebhook(row.id)}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs font-body text-[var(--ink)] hover:border-[var(--accent)]"
                        >
                          {testingWebhookId === row.id ? '...' : 'Tester'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWebhook(row)}
                          className="rounded-[var(--radius-sm)] border border-[#EF4444] px-3 py-1.5 text-xs font-body text-[#EF4444] hover:bg-[#FEF2F2]"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {revealedSecret && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--mint)]/40 bg-[var(--mint-soft)] p-3">
              <p className="text-xs font-body font-medium text-[var(--ink)]">
                Secret de signature (copiez-le maintenant, il ne sera plus affiché) :
              </p>
              <code className="mt-2 block break-all font-mono text-xs text-[var(--ink-soft)]">
                {revealedSecret}
              </code>
              <button
                type="button"
                className="mt-2 text-xs font-body text-[var(--accent)] hover:underline"
                onClick={() => {
                  void navigator.clipboard.writeText(revealedSecret)
                  showToast('Secret copié.')
                }}
              >
                Copier le secret
              </button>
            </div>
          )}

          <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
            <p className="text-sm font-body font-medium text-[var(--ink)]">Ajouter un webhook</p>
            <Input
              placeholder="Nom (ex. n8n — CRM clients)"
              value={newWebhookLabel}
              onChange={(e) => setNewWebhookLabel(e.target.value)}
            />
            <Input
              placeholder="https://hooks.zapier.com/... ou https://hooks.slack.com/..."
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
            />
            <fieldset className="space-y-2">
              <legend className="text-xs font-body font-medium text-[var(--ink-soft)]">Événements</legend>
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={newWebhookEvents.includes(event)}
                    onChange={() => toggleWebhookEvent(event)}
                    className="mt-0.5"
                  />
                  <span className="text-sm font-body text-[var(--ink)]">
                    {WEBHOOK_EVENT_LABELS[event].label}
                    <span className="block text-xs text-[var(--ink-muted)]">
                      {WEBHOOK_EVENT_LABELS[event].description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {webhookError ? (
              <p className="text-sm font-body text-[var(--amber)]">{webhookError}</p>
            ) : null}
            <button
              type="button"
              disabled={saving === 'webhook' || webhookRows.length >= MAX_WEBHOOKS_PER_USER}
              onClick={handleAddWebhook}
              className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95 disabled:opacity-50"
            >
              {saving === 'webhook' ? 'Ajout…' : 'Ajouter le webhook'}
            </button>
          </div>
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </DashboardLayout>
  )
}
