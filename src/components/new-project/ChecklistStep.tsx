import { Button, Input } from '../ui'
import { ChecklistBuilder } from '../checklist/ChecklistBuilder'
import type { DraftChecklistItem } from '../../lib/checklist'
import type { AgencyChecklistTemplate } from '../../lib/checklistTemplates'
import { PAYMENT_UNLOCK_HELP, type PaymentUnlockMode } from '../../lib/payments'

type ChecklistStepProps = {
  items: DraftChecklistItem[]
  onItemsChange: (items: DraftChecklistItem[]) => void
  projectPrice: string
  onProjectPriceChange: (value: string) => void
  paymentUnlockMode: PaymentUnlockMode
  onPaymentUnlockModeChange: (mode: PaymentUnlockMode) => void
  contractTemplates: { id: string; name: string }[]
  agencyTemplates: AgencyChecklistTemplate[]
  agencyId: string | null
  aiContractsEnabled: boolean
  hasDefaultContract: boolean
  defaultContractBrief: string
  priceEur: number | null
  createdProjectId: string | null
  needsContractStep: boolean
  error: string | null
  loading: boolean
  loadingMessage: string | null
  submitLabel: string
  onTemplatesChanged: () => void
  onTemplateApplied?: (templateLabel: string | null) => void
  onBack: () => void
  onSubmit: () => void
}

export function ChecklistStep({
  items,
  onItemsChange,
  projectPrice,
  onProjectPriceChange,
  paymentUnlockMode,
  onPaymentUnlockModeChange,
  contractTemplates,
  agencyTemplates,
  agencyId,
  aiContractsEnabled,
  hasDefaultContract,
  defaultContractBrief,
  priceEur,
  createdProjectId,
  needsContractStep,
  error,
  loading,
  loadingMessage: _loadingMessage,
  submitLabel,
  onTemplatesChanged,
  onTemplateApplied,
  onBack,
  onSubmit,
}: ChecklistStepProps) {
  const hasPaymentStep = items.some((item) => item.type === 'payment')

  return (
    <div className="mt-6 min-w-0">
      <p className="text-sm font-body text-[var(--ink-muted)]">Configure la checklist de démarrage.</p>
      {createdProjectId && needsContractStep ? (
        <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
          Tant que l&apos;invitation n&apos;est pas envoyée, vous pouvez modifier la checklist
          puis régénérer le contrat à l&apos;étape suivante.
        </p>
      ) : null}

      <div className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5">
        <label className="mb-1 block font-display text-base font-semibold text-[var(--ink)]">
          Prix (€)
        </label>
        <p className="mb-2 text-xs font-body text-[var(--ink-muted)]">
          Montant réglé par le client via Stripe (étape Paiement ou en fin de parcours). Laisser
          vide pour ne pas proposer de paiement.
        </p>
        <Input
          type="number"
          min={0}
          step={0.01}
          placeholder="ex: 650"
          value={projectPrice}
          onChange={(e) => onProjectPriceChange(e.target.value)}
        />
        {(hasPaymentStep || (priceEur != null && priceEur > 0)) && (
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 accent-[var(--accent)]"
              checked={paymentUnlockMode === 'immediate'}
              onChange={(e) =>
                onPaymentUnlockModeChange(
                  e.target.checked ? 'immediate' : 'after_prerequisites',
                )
              }
            />
            <span>
              <span className="block font-body text-sm font-medium text-[var(--ink)]">
                Paiement dès le début
              </span>
              <span className="mt-1 block font-body text-xs text-[var(--ink-muted)]">
                {PAYMENT_UNLOCK_HELP}
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="mt-4">
        <ChecklistBuilder
          items={items}
          onChange={onItemsChange}
          contractTemplates={contractTemplates}
          agencyTemplates={agencyTemplates}
          agencyId={agencyId}
          aiContractsEnabled={aiContractsEnabled}
          hasDefaultContract={hasDefaultContract}
          defaultContractBrief={defaultContractBrief}
          priceEur={priceEur}
          onTemplatesChanged={onTemplatesChanged}
          onTemplateApplied={onTemplateApplied}
        />
      </div>

      {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          ← Retour
        </Button>
        <Button className="w-full py-4 text-base" onClick={onSubmit} disabled={loading}>
          {loading ? 'En cours…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
