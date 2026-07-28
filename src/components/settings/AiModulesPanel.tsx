import { Button } from '../ui'
import { FRELI_AI_ADDON } from '../../lib/billing/entitlements'

export type AiModuleFlags = {
  extraction: boolean
  reminders: boolean
  contracts: boolean
}

type AiModulesPanelProps = {
  agencyId: string | null
  flags: AiModuleFlags
  onFlagsChange: (flags: AiModuleFlags) => void
  onSave: () => void
  saving: boolean
  feedback: { type: 'success' | 'error'; text: string } | null
}

const MODULES: Array<{
  key: keyof AiModuleFlags
  title: string
  description: string
}> = [
  {
    key: 'extraction',
    title: 'Extraction de documents',
    description:
      'Les documents uploadés par vos clients (pièce d’identité, Kbis, RIB) sont analysés et les champs extraits vous sont proposés pour validation. Rien n’est écrit sans votre accord.',
  },
  {
    key: 'reminders',
    title: 'Relances intelligentes',
    description:
      'Le contenu des relances s’adapte au comportement du client (email non ouvert, portail non visité, étape bloquante). Le déclenchement reste basé sur vos règles, jamais sur une décision opaque.',
  },
  {
    key: 'contracts',
    title: 'Génération de contrats',
    description:
      'Décrivez un projet en langage naturel et obtenez une première version de contrat basée sur vos propres modèles, toujours éditable avant envoi.',
  },
]

export function AiModulesPanel({
  agencyId,
  flags,
  onFlagsChange,
  onSave,
  saving,
  feedback,
}: AiModulesPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
        <p className="mt-1.5 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
          Chaque module est indépendant et activable séparément. Les traitements IA sont exécutés
          côté serveur et une validation humaine est toujours requise avant toute action visible
          par vos clients. Add-on : {FRELI_AI_ADDON.monthlyLabelHt} / mois (
          {FRELI_AI_ADDON.includedCreditsPerMonth} crédits) — à choisir lors de la souscription sur
          la page tarifs.
        </p>
      </div>

      {MODULES.map((module) => (
        <label
          key={module.key}
          className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-4"
        >
          <input
            type="checkbox"
            checked={flags[module.key]}
            onChange={(e) => onFlagsChange({ ...flags, [module.key]: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-body font-medium text-[var(--ink)]">
              {module.title}
            </span>
            <span className="mt-0.5 block text-xs font-body text-[var(--ink-muted)]">
              {module.description}
            </span>
          </span>
        </label>
      ))}

      <Button onClick={onSave} disabled={saving || !agencyId}>
        {saving ? 'Enregistrement…' : 'Enregistrer les modules IA'}
      </Button>

      {feedback ? (
        <p
          className={`text-sm font-body ${
            feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
