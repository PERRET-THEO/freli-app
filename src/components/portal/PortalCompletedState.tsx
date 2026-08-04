import { formatPriceEur, type PaymentState } from '../../lib/payments'

type CompletedItem = {
  id: string
  label: string
}

type PortalCompletedStateProps = {
  clientName: string
  agencyName: string
  items: CompletedItem[]
  paymentState: PaymentState
  awaitingPaymentConfirmation: boolean
  paymentNotice: 'success' | 'cancelled' | null
  checkoutUrl: string | null
  checkoutTriggerError: boolean
  price?: number | null
}

export function PortalCompletedState({
  clientName,
  agencyName,
  items,
  paymentState,
  awaitingPaymentConfirmation,
  paymentNotice,
  checkoutUrl,
  checkoutTriggerError,
  price,
}: PortalCompletedStateProps) {
  return (
    <div className="mb-8 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-6 text-center shadow-[0_2px_16px_rgba(13,15,20,0.06)] sm:p-10">
      <p className="text-5xl animate-bounce">🎉</p>
      <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-[var(--accent)] sm:text-3xl">Onboarding complété !</h1>
      <p className="mx-auto mt-3 max-w-sm font-body text-base text-[var(--ink-soft)]">
        Merci <strong>{clientName}</strong>, {agencyName} a été notifié et vous contactera très bientôt.
      </p>
      <div className="mx-auto mt-6 max-w-xs space-y-2 text-left">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--mint-soft)] px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--mint)]"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span className="font-body text-sm text-[var(--ink-soft)]">{item.label}</span>
          </div>
        ))}
      </div>
      {paymentState === 'paid' ? (
        <div className="mx-auto mt-6 max-w-sm rounded-[var(--radius-sm)] bg-[var(--mint-soft)] px-4 py-3">
          <p className="font-body text-sm font-medium text-[var(--ink)]">
            Paiement confirmé{price ? ` — ${formatPriceEur(price)}` : ''}. Merci !
          </p>
        </div>
      ) : awaitingPaymentConfirmation ? (
        <div className="mx-auto mt-6 max-w-sm rounded-[var(--radius-sm)] bg-[var(--surface-warm)] px-4 py-3">
          <p className="font-body text-sm font-medium text-[var(--ink)]">
            Paiement en cours de confirmation…
          </p>
          <p className="mt-1 font-body text-xs text-[var(--ink-muted)]">
            Merci, nous finalisons la validation. Cette page se mettra à jour automatiquement.
          </p>
        </div>
      ) : paymentState === 'pending' ? (
        <div className="mx-auto mt-6 max-w-sm">
          {paymentNotice === 'cancelled' && (
            <p className="mb-3 font-body text-sm text-[var(--ink-soft)]">
              Paiement annulé — vous pouvez réessayer ci-dessous.
            </p>
          )}
          {checkoutUrl ? (
            <>
              <a
                href={checkoutUrl}
                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-6 py-3 font-body text-sm font-medium text-[var(--white)] transition hover:brightness-95"
              >
                Procéder au paiement{price ? ` (${formatPriceEur(price)})` : ''}
              </a>
              <p className="mt-3 font-body text-xs text-[var(--ink-muted)]">
                Un email avec le lien de paiement vous a également été envoyé.
              </p>
            </>
          ) : (
            <p className="font-body text-sm text-[var(--ink-soft)]">
              {checkoutTriggerError
                ? `${agencyName} finalise le lien de paiement — réessayez dans un instant ou contactez l’agence.`
                : `${agencyName} vous enverra le lien de paiement très bientôt.`}
            </p>
          )}
        </div>
      ) : null}
      <p className="mt-6 font-body text-xs text-[var(--ink-muted)]">Vous pouvez fermer cette page.</p>
    </div>
  )
}
