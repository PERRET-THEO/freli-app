import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import { GeneratedDocumentEditor } from './GeneratedDocumentEditor'
import {
  deleteGeneratedDocument,
  fetchProjectGeneratedDocuments,
  generateContractDraft,
  type GeneratedDocumentRecord,
} from '../../lib/generatedDocuments'

type ContractGeneratorPanelProps = {
  projectId: string
  aiContractsEnabled: boolean
  checklistContext?: string[]
}

export function ContractGeneratorPanel({
  projectId,
  aiContractsEnabled,
  checklistContext = [],
}: ContractGeneratorPanelProps) {
  const [documents, setDocuments] = useState<GeneratedDocumentRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = async () => {
    try {
      setDocuments(await fetchProjectGeneratedDocuments(projectId))
    } catch {
      // table absente ou erreur réseau : section vide
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  if (!aiContractsEnabled && documents.length === 0) return null
  if (!loaded) return null

  const handleGenerate = async () => {
    if (!brief.trim()) return
    setGenerating(true)
    setErrorMsg(null)
    try {
      await generateContractDraft(projectId, brief.trim(), checklistContext)
      setBrief('')
      await load()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Génération impossible.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Supprimer ce brouillon de contrat ?')) return
    try {
      await deleteGeneratedDocument(documentId)
      await load()
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Suppression impossible.')
    }
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
        📝 Générer un contrat
      </h2>
      <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
        Décrivez la prestation en langage naturel : l&apos;IA rédige une première version en
        s&apos;appuyant sur votre bibliothèque de clauses, vos modèles et la checklist du projet.
        Toujours éditable avant signature. Jamais d&apos;envoi automatique au client.
      </p>

      {aiContractsEnabled ? (
        <div className="mt-4">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="Ex. : Prestation de conseil marketing digital, 3 mois, 2000 €/mois, paiement à 30 jours, clause de confidentialité standard."
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
          />
          <Button className="mt-2" onClick={handleGenerate} disabled={generating || !brief.trim()}>
            {generating ? 'Génération en cours… (jusqu’à 1 min)' : 'Générer une première version'}
          </Button>
          {errorMsg ? <p className="mt-2 text-sm font-body text-[var(--amber)]">{errorMsg}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-xs font-body text-[var(--ink-muted)]">
          Module désactivé — activez « Génération de contrats » dans Paramètres → Intelligence
          artificielle.
        </p>
      )}

      {documents.length > 0 ? (
        <div className="mt-5 space-y-4">
          {documents.map((doc) => (
            <GeneratedDocumentEditor
              key={doc.id}
              document={doc}
              onFinalized={() => load()}
              onDeleted={() => handleDelete(doc.id)}
            />
          ))}
        </div>
      ) : null}
    </Card>
  )
}
