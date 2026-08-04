import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatRelative } from '../../lib/formatRelative'

type UsageRow = {
  feature: string
  operation: string
  success: boolean | null
  created_at: string
}

type Props = {
  agencyId: string | null
  enabled: boolean
}

const FEATURE_LABELS: Record<string, string> = {
  extraction: 'Extraction',
  reminders: 'Relances',
  contracts: 'Contrats',
}

const OPERATION_LABELS: Record<string, string> = {
  ocr: 'OCR',
  chat: 'Rédaction',
  vision: 'Vision',
}

export function AiUsagePanel({ agencyId, enabled }: Props) {
  const [rows, setRows] = useState<UsageRow[]>([])

  useEffect(() => {
    if (!agencyId || !enabled) return
    let cancelled = false
    void (async () => {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)

      const { data } = await supabase
        .from('ai_usage_logs')
        .select('feature, operation, success, created_at')
        .eq('agency_id', agencyId)
        .gte('created_at', monthStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(20)

      if (!cancelled) setRows((data as UsageRow[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [agencyId, enabled])

  if (!enabled || !agencyId) return null

  return (
    <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
      <div>
        <h3 className="font-display text-sm font-bold text-[var(--ink)]">Activité IA ce mois</h3>
        <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
          Historique des traitements. Le solde de crédits restants est indiqué plus haut (1 crédit =
          1 extraction, 1 relance générée ou 1 génération / analyse de contrat).
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs font-body">
          {rows.map((row, index) => (
            <li
              key={`${row.created_at}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--white)] px-2.5 py-1.5 text-[var(--ink-soft)]"
            >
              <span>
                {FEATURE_LABELS[row.feature] ?? row.feature}
                {' · '}
                {OPERATION_LABELS[row.operation] ?? row.operation}
                {row.success === false ? ' · échec' : ''}
              </span>
              <span className="text-[var(--ink-muted)]">{formatRelative(row.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs font-body text-[var(--ink-muted)]">Aucune activité ce mois.</p>
      )}
    </div>
  )
}
