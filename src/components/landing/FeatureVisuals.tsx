import type { ReactElement, ReactNode } from 'react'

export type FeatureVisualId =
  | 'portal-checklist'
  | 'signature-pad'
  | 'reminder-toast'
  | 'dashboard-cards'
  | 'company-autofill'
  | 'payment-step'
  | 'branded-portal'
  | 'ai-extraction'

function VisualFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[12rem] h-auto items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-[var(--accent-soft)] px-4 py-5 md:min-h-[14rem]">
      <div className="w-full max-w-[300px] rounded-[var(--radius-sm)] border border-[rgba(13,15,20,0.08)] bg-[var(--white)] p-4 shadow-[0_8px_24px_rgba(13,15,20,0.08)]">
        {children}
      </div>
    </div>
  )
}

function PortalChecklistVisual() {
  return (
    <VisualFrame>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)] font-display text-[10px] font-bold text-[var(--white)]">
          SN
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[11px] font-bold text-[var(--ink)]">Studio Nova</p>
          <p className="text-[9px] font-body text-[var(--ink-muted)]">Portail client</p>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { label: 'Brief projet', done: true },
          { label: 'Documents', done: true },
          { label: 'Signature', done: false, current: true },
          { label: 'Kickoff', done: false },
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-body ${
              item.current ? 'bg-[var(--accent-soft)]' : 'bg-[rgba(13,15,20,0.03)]'
            }`}
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded-full text-[8px] font-bold ${
                item.done
                  ? 'bg-[var(--mint)] text-[var(--ink)]'
                  : item.current
                    ? 'bg-[var(--amber)] text-[var(--ink)]'
                    : 'bg-[rgba(13,15,20,0.08)] text-[var(--ink-muted)]'
              }`}
            >
              {item.done ? '✓' : item.current ? '···' : ''}
            </span>
            <span className={item.done || item.current ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </VisualFrame>
  )
}

function SignaturePadVisual() {
  return (
    <VisualFrame>
      <p className="mb-3 font-display text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
        Contrat · page 3
      </p>
      <div className="rounded-md border border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 px-3 py-5">
        <svg viewBox="0 0 160 36" className="mx-auto h-8 w-full text-[var(--ink)]" aria-hidden>
          <path
            d="M4 28 C 18 8, 28 32, 42 18 S 60 6, 78 22 S 110 34, 128 14 S 148 8, 156 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <p className="mt-1 text-center text-[9px] font-body text-[var(--ink-muted)]">Signez ici</p>
      </div>
      <div className="mt-3 flex justify-end">
        <span className="rounded-md bg-[var(--accent)] px-2.5 py-1 font-display text-[10px] font-semibold text-[var(--white)]">
          Signer
        </span>
      </div>
    </VisualFrame>
  )
}

function ReminderToastVisual() {
  return (
    <VisualFrame>
      <div className="rounded-md border border-[rgba(13,15,20,0.06)] bg-[rgba(13,15,20,0.02)] p-2.5">
        <div className="mb-2 flex items-center gap-2 border-b border-[rgba(13,15,20,0.06)] pb-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent)]">
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-[var(--white)]" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
              <path d="M2.5 5l5.5 4 5.5-4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[10px] font-bold text-[var(--ink)]">Relance automatique</p>
            <p className="text-[9px] font-body text-[var(--ink-muted)]">à Maison Lune</p>
          </div>
        </div>
        <p className="text-[10px] font-body leading-relaxed text-[var(--ink)]">
          Bonjour, votre onboarding Freli n&apos;est pas encore terminé. Un clic pour reprendre.
        </p>
        <p className="mt-2 font-display text-[9px] font-semibold text-[var(--accent)]">Envoyée · il y a 48h</p>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="font-display text-[9px] font-bold text-[var(--ink)]">Aucune action requise</span>
      </div>
    </VisualFrame>
  )
}

function DashboardCardsVisual() {
  return (
    <VisualFrame>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { k: '3', l: 'En cours' },
          { k: '94%', l: 'Complétion' },
          { k: '32h', l: 'Gagnées' },
        ].map((s) => (
          <div key={s.l} className="rounded-md bg-[rgba(13,15,20,0.03)] px-1.5 py-2 text-center">
            <p className="font-display text-[12px] font-extrabold leading-none text-[var(--ink)]">{s.k}</p>
            <p className="mt-1 text-[8px] font-body uppercase tracking-wide text-[var(--ink-muted)]">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { name: 'Studio Nova', progress: 60, status: 'En cours' },
          { name: 'Atelier K', progress: 100, status: 'Complété' },
        ].map((p) => (
          <div key={p.name} className="rounded-md border border-[rgba(13,15,20,0.06)] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-[10px] font-bold text-[var(--ink)]">{p.name}</p>
              <span className="text-[9px] font-body text-[var(--ink-muted)]">{p.status}</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-[rgba(13,15,20,0.06)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${p.progress}%` }} />
            </div>
          </div>
        ))}
      </div>
    </VisualFrame>
  )
}

function CompanyAutofillVisual() {
  return (
    <VisualFrame>
      <p className="mb-2 font-display text-[9px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">
        Recherche d&apos;entreprise
      </p>
      <div className="flex items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--white)] px-2 py-2">
        <span className="text-[10px] text-[var(--ink-muted)]">⌕</span>
        <span className="font-body text-[10px] text-[var(--ink)]">Lumière</span>
        <span className="ml-auto h-3 w-0.5 animate-pulse bg-[var(--accent)]" />
      </div>
      <div className="mt-2 overflow-hidden rounded-md border border-[rgba(13,15,20,0.08)]">
        {[
          { name: 'Agence Web Lumière', siren: 'SIREN 892 451 203', selected: true },
          { name: 'Lumière Studio SAS', siren: 'SIREN 814 902 117', selected: false },
        ].map((row) => (
          <div
            key={row.siren}
            className={`px-2.5 py-2 text-left ${row.selected ? 'bg-[var(--accent-soft)]' : 'bg-[var(--white)]'}`}
          >
            <p className="font-display text-[10px] font-bold text-[var(--ink)]">{row.name}</p>
            <p className="text-[9px] font-body text-[var(--ink-muted)]">{row.siren} · Paris</p>
          </div>
        ))}
      </div>
    </VisualFrame>
  )
}

function PaymentStepVisual() {
  return (
    <VisualFrame>
      <div className="mb-3 flex gap-1.5">
        {[true, true, true, false].map((done, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${done ? 'bg-[var(--accent)]' : 'bg-[rgba(13,15,20,0.1)]'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1 text-center text-[8px] font-display">
        {['Brief', 'Docs', 'Signature', 'Paiement'].map((label, i) => (
          <div key={label}>
            <div
              className={`mx-auto flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold ${
                i < 3
                  ? 'bg-[var(--mint)] text-[var(--ink)]'
                  : 'bg-[var(--amber)] text-[var(--ink)]'
              }`}
            >
              {i < 3 ? '✓' : '···'}
            </div>
            <p className={`mt-0.5 truncate ${i === 3 ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
              {label}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md bg-[var(--accent-soft)] px-2.5 py-2.5">
        <div>
          <p className="font-display text-[10px] font-bold text-[var(--ink)]">Lien Stripe envoyé</p>
          <p className="text-[9px] font-body text-[var(--ink-muted)]">En attente du règlement</p>
        </div>
        <span className="rounded-full bg-[var(--amber)]/25 px-2 py-0.5 font-display text-[9px] font-bold text-[var(--ink)]">
          À payer
        </span>
      </div>
    </VisualFrame>
  )
}

function BrandedPortalVisual() {
  return (
    <VisualFrame>
      <div className="rounded-md bg-[var(--ink)] p-2.5 text-[var(--white)]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] font-display text-[10px] font-extrabold">
            AL
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[11px] font-bold">Agence Lumière</p>
            <p className="truncate text-[9px] font-body text-[rgba(253,252,250,0.55)]">
              Design &amp; digital, sur-mesure
            </p>
          </div>
          <span className="h-3 w-3 rounded-full bg-[var(--accent)] ring-2 ring-[var(--white)]/20" />
        </div>
        <p className="mt-3 font-body text-[10px] leading-relaxed text-[rgba(253,252,250,0.85)]">
          Bienvenue — complétez votre onboarding en quelques minutes.
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-display text-[9px] font-bold text-[var(--ink-muted)]">Couleur</span>
        <span className="h-3 w-3 rounded-full bg-[var(--accent)]" />
        <span className="h-3 w-3 rounded-full bg-[var(--mint)]" />
        <span className="h-3 w-3 rounded-full bg-[var(--amber)]" />
      </div>
    </VisualFrame>
  )
}

function AiExtractionVisual() {
  return (
    <VisualFrame>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-[10px] font-bold text-[var(--ink)]">Extraction Kbis</p>
        <span className="rounded-full bg-[var(--mint)]/20 px-1.5 py-0.5 font-display text-[8px] font-bold text-[var(--ink)]">
          À valider
        </span>
      </div>
      <div className="space-y-1.5">
        {[
          { label: 'Raison sociale', value: 'Studio Nova SAS' },
          { label: 'SIREN', value: '892 451 203' },
          { label: 'Adresse', value: '12 rue du Faubourg, Paris' },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 rounded-md bg-[rgba(13,15,20,0.03)] px-2 py-1.5"
          >
            <span className="text-[9px] font-body text-[var(--ink-muted)]">{row.label}</span>
            <span className="truncate font-display text-[9px] font-semibold text-[var(--ink)]">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-1.5">
        <span className="rounded-md border border-[rgba(13,15,20,0.1)] px-2 py-1 font-display text-[9px] font-semibold text-[var(--ink-muted)]">
          Modifier
        </span>
        <span className="rounded-md bg-[var(--accent)] px-2 py-1 font-display text-[9px] font-semibold text-[var(--white)]">
          Valider
        </span>
      </div>
    </VisualFrame>
  )
}

const VISUALS: Record<FeatureVisualId, () => ReactElement> = {
  'portal-checklist': PortalChecklistVisual,
  'signature-pad': SignaturePadVisual,
  'reminder-toast': ReminderToastVisual,
  'dashboard-cards': DashboardCardsVisual,
  'company-autofill': CompanyAutofillVisual,
  'payment-step': PaymentStepVisual,
  'branded-portal': BrandedPortalVisual,
  'ai-extraction': AiExtractionVisual,
}

export function FeatureVisual({ id }: { id: FeatureVisualId }) {
  const Visual = VISUALS[id]
  return <Visual />
}
