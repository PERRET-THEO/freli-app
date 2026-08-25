const SKELETON_HEADINGS = ['Objet de la prestation', 'Durée / délais', 'Tarif', 'Paiement', 'Clauses juridiques']

export function ContractGenerationSkeleton() {
  return (
    <div
      className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-4"
      role="status"
      aria-live="polite"
      aria-label="Rédaction de la première version en cours"
    >
      <p className="text-sm font-body font-medium text-[var(--ink)]">Rédaction de la première version…</p>
      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
        Première version éditable — vous pourrez tout modifier avant envoi.
      </p>
      <div className="mt-4 space-y-3">
        {SKELETON_HEADINGS.map((label) => (
          <div key={label} className="animate-pulse rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3">
            <div className="h-3 w-32 rounded bg-[var(--border)]" aria-hidden />
            <div className="mt-3 h-2 w-full rounded bg-[var(--border)]" aria-hidden />
            <div className="mt-2 h-2 w-5/6 rounded bg-[var(--border)]" aria-hidden />
            <span className="sr-only">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
