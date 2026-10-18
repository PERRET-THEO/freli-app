import { Card } from '../ui'

type Props = {
  connected: boolean
  isSaving: boolean
  stripeAccountId: string | undefined
  stripeCheckoutReady: boolean
  stripeError: string | null
  onStartOnboarding: () => void
  onOpenDashboard: () => void
  onDisconnect: () => void
}

export function StripeConnectSection({
  connected,
  isSaving,
  stripeAccountId,
  stripeCheckoutReady,
  stripeError,
  onStartOnboarding,
  onOpenDashboard,
  onDisconnect,
}: Props) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Stripe</h2>
              {connected && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-body font-medium ${
                    !stripeCheckoutReady
                      ? 'bg-[var(--amber)]/15 text-[var(--amber)]'
                      : 'bg-[var(--mint-soft)] text-[var(--mint)]'
                  }`}
                >
                  {!stripeCheckoutReady ? 'À finaliser' : 'Connecté'}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
              Encaissez vos clients via Stripe Connect (étape Paiement ou fin de parcours).
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-xs font-body text-[var(--ink-muted)]">
          Les paiements vont sur <strong>votre</strong> compte Stripe (Connect Express). Le montant
          par projet est défini à la création (« Prix (€) »).
        </p>
        <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
          <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs font-body text-[var(--ink-muted)]">
            <li>Connectez votre compte Stripe (Connect Express).</li>
            <li>Définissez un prix (et éventuellement une étape Paiement) à la création du projet.</li>
            <li>
              Le client paie quand le paiement est débloqué (étapes précédentes soumises, ou option
              « Paiement dès le début »). Vous pouvez aussi envoyer le lien depuis la fiche projet.
            </li>
          </ol>
          <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
            Webhook : l&apos;endpoint Freli doit écouter les événements des{' '}
            <strong>comptes Connect</strong> (checkout.session.completed, expired,
            async_payment_failed, payment_intent.payment_failed, charge.refunded, account.updated).
          </p>
        </div>
        {stripeAccountId && (
          <p className="text-xs font-body text-[var(--ink-muted)]">
            Compte connecté : …{stripeAccountId.slice(-6)}
            {stripeCheckoutReady
              ? ' — prêt à encaisser.'
              : ' — finalisez l\u2019inscription chez Stripe.'}
          </p>
        )}
        {connected && !stripeCheckoutReady && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--amber-soft)] px-3 py-2 text-xs font-body text-[var(--amber)]">
            Votre compte est lié mais pas encore prêt à encaisser. Finalisez l&apos;inscription Stripe
            pour envoyer des liens de paiement.
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
              onClick={onStartOnboarding}
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
                onClick={onOpenDashboard}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {isSaving ? '...' : 'Ouvrir mon espace Stripe'}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={onDisconnect}
                className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-transparent px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEF2F2] disabled:opacity-50"
              >
                Déconnecter Stripe
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
