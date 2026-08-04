import { Button } from '../ui'
import { GeneratedDocumentEditor } from '../contracts/GeneratedDocumentEditor'
import {
  CHECKLIST_TYPE_LABELS,
  type DraftChecklistItem,
} from '../../lib/checklist'
import type { GeneratedDocumentRecord } from '../../lib/generatedDocuments'

type ContractFinalizeStepProps = {
  clientFullName: string
  priceEur: number | null
  items: DraftChecklistItem[]
  manualBrief: string
  onBriefChange: (value: string) => void
  contextStale: boolean
  showContextRecap: boolean
  onToggleContextRecap: () => void
  generatedDocuments: GeneratedDocumentRecord[]
  generatedToken: string | null
  contractFinalized: boolean
  regenerating: boolean
  loading: boolean
  loadingMessage: string | null
  error: string | null
  onRegenerate: () => void
  onContractFinalized: (contractTemplateId: string) => void
  onBackToChecklist: () => void
}

export function ContractFinalizeStep({
  clientFullName,
  priceEur,
  items,
  manualBrief,
  onBriefChange,
  contextStale,
  showContextRecap,
  onToggleContextRecap,
  generatedDocuments,
  generatedToken,
  contractFinalized,
  regenerating,
  loading,
  loadingMessage,
  error,
  onRegenerate,
  onContractFinalized,
  onBackToChecklist,
}: ContractFinalizeStepProps) {
  return (
    <div className="mt-6 min-w-0">
      <p className="break-words text-sm font-body text-[var(--ink-muted)]">
        Tant que l&apos;invitation n&apos;est pas envoyée, vous pouvez ajuster la checklist
        et régénérer le contrat. Relisez-le puis finalisez-le avant l&apos;envoi à{' '}
        {clientFullName || 'votre client'}.
      </p>

      {contextStale && !generatedToken && !contractFinalized ? (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber-soft)] px-4 py-3">
          <p className="text-sm font-body text-[var(--amber)]">
            La checklist ou le brief a changé depuis la dernière génération. Régénérez le
            contrat pour intégrer ces éléments.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void onRegenerate()}
            disabled={regenerating || loading || contractFinalized}
          >
            {regenerating ? 'Régénération…' : 'Régénérer le contrat'}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)]">
        <button
          type="button"
          onClick={onToggleContextRecap}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 break-words font-display text-sm font-semibold text-[var(--ink)]">
            Contexte du contrat
          </span>
          <span className="shrink-0 text-xs font-body text-[var(--ink-muted)]">
            {showContextRecap ? 'Masquer' : 'Afficher'}
          </span>
        </button>
        {showContextRecap ? (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <p className="break-words text-sm font-body text-[var(--ink-soft)]">
              Client : {clientFullName || '—'}
              {priceEur ? ` · ${priceEur} € HT` : ''}
            </p>
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 items-center justify-between gap-2 text-sm font-body text-[var(--ink-soft)]"
                >
                  <span className="min-w-0 break-words">{item.label}</span>
                  <span className="shrink-0 rounded-full bg-[var(--surface-warm)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                    {CHECKLIST_TYPE_LABELS[item.type]}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onBackToChecklist}
              disabled={loading || contractFinalized || regenerating}
              className="mt-3 text-sm font-body font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              Modifier la checklist →
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4">
        <label className="mb-1 block font-display text-sm font-semibold text-[var(--ink)]">
          Brief de l&apos;agence
        </label>
        <p className="mb-2 text-xs font-body text-[var(--ink-muted)]">
          Ce brief et les éléments de la checklist alimentent la génération.
        </p>
        <textarea
          value={manualBrief}
          onChange={(e) => onBriefChange(e.target.value)}
          rows={4}
          disabled={contractFinalized || regenerating}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
        />
      </div>

      {generatedDocuments.length > 0 ? (
        <div className="mt-4 space-y-4">
          {generatedDocuments.map((doc) => (
            <GeneratedDocumentEditor
              key={doc.id}
              document={doc}
              onFinalized={onContractFinalized}
              onRegenerate={
                !generatedToken && !contractFinalized ? onRegenerate : undefined
              }
              regenerating={regenerating}
              regenerateDisabled={loading || contractFinalized || Boolean(generatedToken)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm font-body text-[var(--ink-muted)]">
          Chargement du brouillon…
        </p>
      )}

      {contractFinalized ? (
        <p className="mt-3 text-sm font-body text-[var(--mint)]">
          Contrat finalisé — invitation envoyée au client.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}
      {loadingMessage ? (
        <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">{loadingMessage}</p>
      ) : null}

      <div className="mt-6">
        <Button
          variant="secondary"
          onClick={onBackToChecklist}
          disabled={loading || contractFinalized || regenerating}
        >
          ← Retour à la checklist
        </Button>
      </div>
    </div>
  )
}
