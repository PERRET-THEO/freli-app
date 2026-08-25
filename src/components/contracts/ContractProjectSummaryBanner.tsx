import { Link } from 'react-router-dom'
import type { ContractProjectContext } from '../../lib/contractProjectContext'

type ContractProjectSummaryBannerProps = {
  context: ContractProjectContext
  /** Sections meta extraites du document (date, validité…) si présentes */
  extraMeta?: Array<{ label: string; value: string }>
}

function SummaryBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-body font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
        {label}
      </p>
      <div className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <p key={line} className="truncate text-xs font-body text-[var(--ink)]">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

export function ContractProjectSummaryBanner({
  context,
  extraMeta = [],
}: ContractProjectSummaryBannerProps) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-body font-medium text-[var(--ink-muted)]">
          Données du projet (non modifiables ici)
        </p>
        <Link
          to={context.projectEditPath}
          className="text-xs font-body text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Modifier dans le projet
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        <SummaryBlock label="DE" lines={context.agencyLines.length ? context.agencyLines : ['Prestataire — à compléter dans Paramètres']} />
        <SummaryBlock label="POUR" lines={context.clientLines} />
        <SummaryBlock
          label="Date"
          lines={[context.dateLabel, ...extraMeta.map((m) => `${m.label} : ${m.value}`)]}
        />
        {context.priceLabel ? (
          <SummaryBlock label="Montant" lines={[context.priceLabel]} />
        ) : null}
      </div>
    </div>
  )
}
