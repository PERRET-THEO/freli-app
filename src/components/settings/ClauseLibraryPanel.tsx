import { useEffect, useState } from 'react'
import { Button, Input } from '../ui'
import { supabase } from '../../lib/supabase'

type Clause = {
  id: string
  title: string
  content: string
  category: string
  is_active: boolean
}

const CATEGORIES = [
  { value: 'general', label: 'Général' },
  { value: 'payment', label: 'Paiement' },
  { value: 'ip', label: 'Propriété intellectuelle' },
  { value: 'confidentiality', label: 'Confidentialité' },
  { value: 'termination', label: 'Résiliation' },
  { value: 'liability', label: 'Responsabilité' },
  { value: 'other', label: 'Autre' },
] as const

type Props = {
  agencyId: string | null
  enabled: boolean
}

export function ClauseLibraryPanel({ agencyId, enabled }: Props) {
  const [clauses, setClauses] = useState<Clause[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<string>('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agencyId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('ai_clause_library')
        .select('id, title, content, category, is_active')
        .eq('agency_id', agencyId)
        .order('updated_at', { ascending: false })
      if (!cancelled) setClauses((data as Clause[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [agencyId])

  const reload = async () => {
    if (!agencyId) return
    const { data } = await supabase
      .from('ai_clause_library')
      .select('id, title, content, category, is_active')
      .eq('agency_id', agencyId)
      .order('updated_at', { ascending: false })
    setClauses((data as Clause[]) ?? [])
  }

  const handleAdd = async () => {
    setError(null)
    if (!agencyId || !title.trim() || !content.trim()) {
      setError('Titre et contenu requis.')
      return
    }
    setSaving(true)
    const { error: insertError } = await supabase.from('ai_clause_library').insert({
      agency_id: agencyId,
      title: title.trim(),
      content: content.trim(),
      category,
      is_active: true,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setTitle('')
    setContent('')
    await reload()
  }

  const deactivate = async (id: string) => {
    await supabase
      .from('ai_clause_library')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    await reload()
  }

  if (!enabled) {
    return (
      <p className="text-xs font-body text-[var(--ink-muted)]">
        Activez le module contrats et l’add-on IA pour gérer la bibliothèque de clauses.
      </p>
    )
  }

  return (
    <div className="mt-6 space-y-4 border-t border-[var(--border)] pt-6">
      <h3 className="font-display text-sm font-bold text-[var(--ink)]">
        Bibliothèque de clauses
      </h3>

      <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
          <li>
            Réservé à la <span className="font-medium text-[var(--ink-soft)]">génération de
            contrats</span> — pas l’extraction ni les relances.
          </li>
          <li>
            Rangez ici vos <span className="font-medium text-[var(--ink-soft)]">clauses déjà
            validées</span> (confidentialité, paiement, propriété intellectuelle, etc.).
          </li>
          <li>
            À la génération, Freli les{' '}
            <span className="font-medium text-[var(--ink-soft)]">réutilise en priorité</span> plutôt
            que d’inventer du texte juridique.
          </li>
          <li>
            Dans l’éditeur du contrat, ces passages sont repérés comme issus de votre bibliothèque ;
            le reste rédigé par l’IA reste à faire relire.
          </li>
          <li>
            Sans clause enregistrée, la génération fonctionne quand même — avec plus de contenu à
            valider juridiquement.
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-body font-medium text-[var(--ink-soft)]">
          Titre
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Confidentialité"
            className="mt-1"
          />
        </label>
        <label className="block text-xs font-body font-medium text-[var(--ink-soft)]">
          Catégorie
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-body font-medium text-[var(--ink-soft)]">
          Contenu
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-sm font-body text-[var(--ink)]"
            placeholder="Texte de la clause…"
          />
        </label>
        <Button onClick={() => void handleAdd()} disabled={saving || !agencyId}>
          {saving ? 'Ajout…' : 'Ajouter la clause'}
        </Button>
        {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
      </div>

      {clauses.filter((c) => c.is_active).length > 0 ? (
        <ul className="space-y-2">
          {clauses
            .filter((c) => c.is_active)
            .map((clause) => (
              <li
                key={clause.id}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-body font-medium text-[var(--ink)]">{clause.title}</p>
                    <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">
                      {CATEGORIES.find((c) => c.value === clause.category)?.label ?? clause.category}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-xs font-body text-[var(--ink-soft)]">
                      {clause.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deactivate(clause.id)}
                    className="text-xs font-body text-[var(--amber)] hover:underline"
                  >
                    Désactiver
                  </button>
                </div>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs font-body text-[var(--ink-muted)]">Aucune clause active.</p>
      )}
    </div>
  )
}
