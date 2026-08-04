import { Button, Input } from '../ui'
import { ChecklistBuilder } from '../checklist/ChecklistBuilder'
import type { DraftChecklistItem } from '../../lib/checklist'
import type { AgencyChecklistTemplate } from '../../lib/checklistTemplates'

type ChecklistStepProps = {
  items: DraftChecklistItem[]
  onItemsChange: (items: DraftChecklistItem[]) => void
  projectPrice: string
  onProjectPriceChange: (value: string) => void
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
  onBack: () => void
  onSubmit: () => void
}

export function ChecklistStep({
  items,
  onItemsChange,
  projectPrice,
  onProjectPriceChange,
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
  loadingMessage,
  submitLabel,
  onTemplatesChanged,
  onBack,
  onSubmit,
}: ChecklistStepProps) {
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
          Montant facturé au client à la fin de l&apos;onboarding si Stripe est activé dans Intégrations. Laisser vide pour ne pas proposer de paiement.
        </p>
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="ex: 650"
          value={projectPrice}
          onChange={(e) => onProjectPriceChange(e.target.value)}
        />
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
        />
      </div>

      {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}
      {loadingMessage ? (
        <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">{loadingMessage}</p>
      ) : null}

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
