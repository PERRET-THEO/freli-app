import { Link } from 'react-router-dom'
import type { ContractSource, DraftChecklistItem } from '../../lib/checklist'

type ContractTemplateOption = { id: string; name: string }

type ContractItemConfigProps = {
  item: DraftChecklistItem
  contractTemplates: ContractTemplateOption[]
  aiContractsEnabled: boolean
  hasDefaultContract: boolean
  defaultBrief?: string
  hasOtherAiItem: boolean
  onChange: (patch: Partial<DraftChecklistItem>) => void
}

const radioCls = 'h-4 w-4 accent-[var(--accent)]'
const selectCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

export function ContractItemConfig({
  item,
  contractTemplates,
  aiContractsEnabled,
  hasDefaultContract,
  defaultBrief = '',
  hasOtherAiItem,
  onChange,
}: ContractItemConfigProps) {
  const source = item.contractSource ?? 'default'

  const setSource = (next: ContractSource) => {
    const patch: Partial<DraftChecklistItem> = { contractSource: next }
    if (next === 'existing') {
      patch.contractTemplateId = item.contractTemplateId ?? contractTemplates[0]?.id ?? null
      patch.contractBrief = ''
    } else if (next === 'ai_generate') {
      patch.contractTemplateId = null
      patch.contractBrief = item.contractBrief?.trim() ? item.contractBrief : defaultBrief
    } else {
      patch.contractTemplateId = null
      patch.contractBrief = ''
    }
    onChange(patch)
  }

  const selectedTemplate = contractTemplates.find((t) => t.id === item.contractTemplateId)

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--accent)]/25 bg-[var(--accent-soft)]/20 p-3">
      <p className="text-xs font-body font-semibold text-[var(--ink)]">Contrat associé</p>

      <div className="mt-2 space-y-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name={`contract-source-${item.id}`}
            className={`${radioCls} mt-0.5`}
            checked={source === 'existing'}
            onChange={() => setSource('existing')}
            disabled={contractTemplates.length === 0}
          />
          <span className="flex-1 text-xs font-body text-[var(--ink-soft)]">
            Choisir un modèle existant
            {contractTemplates.length === 0 ? (
              <span className="mt-1 block text-[var(--ink-muted)]">
                Aucun modèle —{' '}
                <Link to="/dashboard/templates" className="text-[var(--accent)] underline">
                  ajouter un contrat
                </Link>
              </span>
            ) : null}
          </span>
        </label>
        {source === 'existing' && contractTemplates.length > 0 ? (
          <select
            className={selectCls}
            value={item.contractTemplateId ?? ''}
            onChange={(e) => onChange({ contractTemplateId: e.target.value || null })}
          >
            <option value="">Sélectionner un modèle…</option>
            {contractTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}

        {aiContractsEnabled ? (
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`contract-source-${item.id}`}
              className={`${radioCls} mt-0.5`}
              checked={source === 'ai_generate'}
              onChange={() => setSource('ai_generate')}
              disabled={hasOtherAiItem}
            />
            <span className="flex-1 text-xs font-body text-[var(--ink-soft)]">
              Générer avec l&apos;IA
              <span className="ml-1.5 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                IA
              </span>
              {hasOtherAiItem ? (
                <span className="mt-1 block text-[var(--ink-muted)]">
                  Un seul contrat IA par projet.
                </span>
              ) : null}
            </span>
          </label>
        ) : (
          <p className="text-xs font-body text-[var(--ink-muted)]">
            Génération IA désactivée — activez-la dans{' '}
            <Link to="/dashboard/settings" className="text-[var(--accent)] underline">
              Paramètres → Intelligence artificielle
            </Link>
            .
          </p>
        )}
        {source === 'ai_generate' && aiContractsEnabled ? (
          <>
            <textarea
              value={item.contractBrief ?? ''}
              onChange={(e) => onChange({ contractBrief: e.target.value })}
              rows={3}
              placeholder="Ex. : Prestation de conseil marketing digital, 3 mois, 2000 €/mois, paiement à 30 jours, clause de confidentialité standard."
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
            />
            <p className="text-[10px] font-body text-[var(--ink-muted)]">
              Ce brief et les éléments de la checklist alimentent la génération du contrat.
            </p>
          </>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            name={`contract-source-${item.id}`}
            className={`${radioCls} mt-0.5`}
            checked={source === 'default'}
            onChange={() => setSource('default')}
            disabled={!hasDefaultContract}
          />
          <span className="flex-1 text-xs font-body text-[var(--ink-soft)]">
            Utiliser le modèle par défaut
            {!hasDefaultContract ? (
              <span className="mt-1 block text-[var(--ink-muted)]">
                Aucun modèle par défaut — définissez-en un dans{' '}
                <Link to="/dashboard/templates" className="text-[var(--accent)] underline">
                  Modèles &amp; signature
                </Link>
                .
              </span>
            ) : null}
          </span>
        </label>
      </div>

      {source === 'existing' && selectedTemplate ? (
        <p className="mt-2 text-xs font-body text-[var(--mint)]">
          Modèle sélectionné : {selectedTemplate.name}
        </p>
      ) : null}
      {source === 'ai_generate' ? (
        <p className="mt-2 text-xs font-body text-[var(--ink-muted)]">
          Le contrat sera généré à l&apos;étape suivante. Vous pourrez le régénérer après avoir
          ajusté la checklist, tant que l&apos;invitation n&apos;est pas envoyée.
        </p>
      ) : null}
    </div>
  )
}
