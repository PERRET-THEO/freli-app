import type { ContractFlowStep, ContractUiPhase } from '../../lib/contractSectionUtils'

const STEPS: Array<{ id: ContractFlowStep; label: string; shortLabel: string }> = [
  { id: 'brief', label: 'Brief', shortLabel: '1' },
  { id: 'generation', label: 'Génération', shortLabel: '2' },
  { id: 'review', label: 'Revue', shortLabel: '3' },
  { id: 'pdf', label: 'PDF', shortLabel: '4' },
  { id: 'signature', label: 'Signature', shortLabel: '5' },
]

const STEP_ORDER: ContractFlowStep[] = ['brief', 'generation', 'review', 'pdf', 'signature']

type ContractGenerationStepperProps = {
  activeStep: ContractFlowStep
  uiPhase: ContractUiPhase
}

function stepIndex(step: ContractFlowStep): number {
  return STEP_ORDER.indexOf(step)
}

export function ContractGenerationStepper({ activeStep, uiPhase }: ContractGenerationStepperProps) {
  const activeIdx = stepIndex(activeStep)

  return (
    <nav
      className="mb-4"
      aria-label="Étapes du contrat"
    >
      <ol className="hidden min-w-0 items-center gap-1 sm:flex">
        {STEPS.map((step, index) => {
          const done = index < activeIdx
          const active = index === activeIdx
          const phaseClass =
            uiPhase === 'draft'
              ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)]'
              : uiPhase === 'reviewable'
                ? 'border-[var(--amber)]/30 bg-[var(--amber-soft)]/20 text-[var(--ink)]'
                : 'border-[var(--mint)]/30 bg-[var(--mint-soft)]/30 text-[var(--ink)]'

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-body sm:gap-2 sm:px-2.5 ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : done
                      ? 'border-[var(--mint)]/40 bg-[var(--mint-soft)]/40 text-[var(--mint)]'
                      : phaseClass
                }`}
                aria-current={active ? 'step' : undefined}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--white)]'
                      : done
                        ? 'bg-[var(--mint)] text-[var(--white)]'
                        : 'bg-[var(--border)] text-[var(--ink-muted)]'
                  }`}
                  aria-hidden
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </span>
              {index < STEPS.length - 1 ? (
                <span className="hidden h-px w-2 shrink-0 bg-[var(--border)] md:block" aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>

      <ol className="flex items-center justify-center gap-2 sm:hidden">
        {STEPS.map((step, index) => {
          const done = index < activeIdx
          const active = index === activeIdx
          return (
            <li key={step.id}>
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  active
                    ? 'bg-[var(--accent)]'
                    : done
                      ? 'bg-[var(--mint)]'
                      : 'bg-[var(--border)]'
                }`}
                aria-current={active ? 'step' : undefined}
                aria-label={step.label}
              />
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-center text-xs font-body text-[var(--ink-muted)] sm:hidden">
        Étape {activeIdx + 1} — {STEPS[activeIdx]?.label}
      </p>
    </nav>
  )
}
