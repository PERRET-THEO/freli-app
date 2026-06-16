const SECTIONS = [
  { id: 'settings-organisation', label: 'Organisation' },
  { id: 'settings-portail', label: 'Portail client' },
  { id: 'settings-relances', label: 'Relances' },
  { id: 'settings-compte', label: 'Compte' },
  { id: 'settings-aide', label: 'Aide' },
] as const

type SettingsNavProps = {
  activeId?: string
}

export function SettingsNav({ activeId }: SettingsNavProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <nav className="sticky top-4 hidden space-y-1 lg:block">
        <p className="mb-2 px-3 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Sections
        </p>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className={`block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm font-body transition ${
              activeId === section.id
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                : 'text-[var(--ink-soft)] hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]'
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] pb-3 pt-1 lg:hidden">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-body font-medium transition ${
              activeId === section.id
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'bg-[var(--white)] text-[var(--ink-soft)] ring-1 ring-[var(--border)]'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </>
  )
}
