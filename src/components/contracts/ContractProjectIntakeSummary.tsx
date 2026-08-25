import type { ContractProjectContext } from '../../lib/contractProjectContext'

type ContractProjectIntakeSummaryProps = {
  context: ContractProjectContext
}

export function ContractProjectIntakeSummary({ context }: ContractProjectIntakeSummaryProps) {
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-body font-medium text-[var(--ink-muted)]">
        Données déjà dans le projet — l&apos;IA s&apos;appuie dessus
      </p>
      <ul className="mt-2 space-y-1 text-xs font-body text-[var(--ink)]">
        <li>
          <span className="text-[var(--ink-muted)]">Client : </span>
          {context.clientName}
          {context.clientEmail ? ` (${context.clientEmail})` : ''}
        </li>
        {context.priceLabel ? (
          <li>
            <span className="text-[var(--ink-muted)]">Montant : </span>
            {context.priceLabel}
          </li>
        ) : null}
        {context.agencyName ? (
          <li>
            <span className="text-[var(--ink-muted)]">Prestataire : </span>
            {context.agencyName}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
