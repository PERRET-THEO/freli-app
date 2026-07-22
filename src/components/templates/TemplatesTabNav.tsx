export type TemplatesTab = 'contracts' | 'checklists' | 'ai-models'

const TABS: { id: TemplatesTab; label: string }[] = [
  { id: 'contracts', label: 'Contrats' },
  { id: 'checklists', label: 'Modèles de checklist' },
  { id: 'ai-models', label: 'Modèles de référence IA' },
]

type TemplatesTabNavProps = {
  activeTab: TemplatesTab
  onTabChange: (tab: TemplatesTab) => void
}

export function TemplatesTabNav({ activeTab, onTabChange }: TemplatesTabNavProps) {
  return (
    <>
      <div className="hidden gap-1 rounded-[var(--radius-md)] bg-[var(--surface-warm)] p-1 md:flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-[var(--radius-sm)] px-4 py-2 text-sm font-body font-medium transition ${
              activeTab === tab.id
                ? 'bg-[var(--white)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 md:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-body font-medium transition ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-[var(--white)]'
                : 'bg-[var(--white)] text-[var(--ink-soft)] ring-1 ring-[var(--border)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  )
}
