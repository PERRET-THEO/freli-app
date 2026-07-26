import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button, Card, Input } from '../components/ui'
import { getOrCreateAgency } from '../lib/agency'
import { resolveAgencyContractPdfUrl } from '../lib/contractStorage'
import { supabase } from '../lib/supabase'
import { pdfjs, setupPdfWorker } from '../lib/pdfWorker'
import { ChecklistTemplatesManager } from '../components/checklist/ChecklistTemplatesManager'
import {
  ContractTemplateCard,
  type ContractTemplate,
} from '../components/contracts/ContractTemplateCard'
import { AiReferenceModelsManager } from '../components/contracts/AiReferenceModelsManager'
import {
  TemplateEmptyState,
  TemplateIntroCard,
  TemplatesGridSkeleton,
  TemplatesTabNav,
  type TemplatesTab,
} from '../components/templates'

let pdfOpenLockUntil = 0

/** Ouvre le PDF une seule fois par geste (évite les onglets multiples). */
function openPdfOnce(url: string) {
  const now = Date.now()
  if (now < pdfOpenLockUntil) return
  pdfOpenLockUntil = now + 400
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function openContractPdf(storagePathOrUrl: string) {
  const url = await resolveAgencyContractPdfUrl(storagePathOrUrl)
  if (!url) return
  openPdfOnce(url)
}

const PRESETS = [
  { label: 'Bas gauche', x: 0.05, y: 0.88 },
  { label: 'Bas centre', x: 0.35, y: 0.88 },
  { label: 'Bas droite', x: 0.65, y: 0.88 },
] as const

function PositionEditor({ template, onSave, onClose }: {
  template: ContractTemplate
  onSave: () => void
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [pos, setPos] = useState({ x: template.signature_x ?? 0.7, y: template.signature_y ?? 0.85 })
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(true)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ px: 0, py: 0, sx: 0, sy: 0 })

  const sigWNorm = template.signature_width ?? 0.25
  const sigHNorm = template.signature_height ?? 0.08

  const redrawOverlay = useCallback((cx: number, cy: number, cw: number, ch: number) => {
    const canvas = canvasRef.current
    const pageCanvas = pageCanvasRef.current
    if (!canvas || !pageCanvas || !cw) return

    const ctx = canvas.getContext('2d')!
    canvas.width = pageCanvas.width
    canvas.height = pageCanvas.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(pageCanvas, 0, 0)

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    for (let i = 1; i < 4; i++) {
      const gx = (i / 4) * cw
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke()
    }
    for (let i = 1; i < 5; i++) {
      const gy = (i / 5) * ch
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke()
    }
    ctx.setLineDash([])

    // Signature rect
    const rx = cx
    const ry = cy
    const rw = sigWNorm * cw
    const rh = sigHNorm * ch
    ctx.fillStyle = 'rgba(91, 110, 245, 0.12)'
    ctx.fillRect(rx, ry, rw, rh)
    ctx.strokeStyle = '#5B6EF5'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.setLineDash([])

    ctx.fillStyle = '#5B6EF5'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('✍️ Signature', rx + rw / 2, ry + rh / 2 + 4)
  }, [sigWNorm, sigHNorm])

  useEffect(() => {
    if (!template.pdf_url) { setPdfLoading(false); return }
    const canvas = canvasRef.current
    if (!canvas) return

    setupPdfWorker()
    let cancelled = false
    const run = async () => {
      setPdfLoading(true)
      try {
        const pdfUrl = await resolveAgencyContractPdfUrl(template.pdf_url)
        if (!pdfUrl) return
        const res = await fetch(pdfUrl)
        const buf = await res.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buf }).promise
        const pageNum = (template.signature_page ?? -1) === -1 ? pdf.numPages : Math.min(template.signature_page + 1, pdf.numPages)
        const page = await pdf.getPage(pageNum)

        const baseVp = page.getViewport({ scale: 1 })
        const maxW = 560
        const scale = maxW / baseVp.width
        const vp = page.getViewport({ scale })

        const offscreen = document.createElement('canvas')
        offscreen.width = vp.width
        offscreen.height = vp.height
        const octx = offscreen.getContext('2d')!
        octx.fillStyle = '#fff'
        octx.fillRect(0, 0, offscreen.width, offscreen.height)
        await page.render({ canvasContext: octx, viewport: vp }).promise

        if (cancelled) return
        pageCanvasRef.current = offscreen
        setCanvasSize({ w: vp.width, h: vp.height })
      } catch {
        /* PDF load error */
      } finally {
        if (!cancelled) setPdfLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [template.pdf_url, template.signature_page])

  useEffect(() => {
    if (!canvasSize.w) return
    redrawOverlay(pos.x * canvasSize.w, pos.y * canvasSize.h, canvasSize.w, canvasSize.h)
  }, [pos, canvasSize, redrawOverlay])

  const maxX = 1 - sigWNorm
  const maxY = 1 - sigHNorm

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    dragStartRef.current = { px: e.clientX, py: e.clientY, sx: pos.x, sy: pos.y }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !canvasSize.w) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const scaleX = canvasSize.w / rect.width
    const scaleY = canvasSize.h / rect.height
    const dx = (e.clientX - dragStartRef.current.px) * scaleX / canvasSize.w
    const dy = (e.clientY - dragStartRef.current.py) * scaleY / canvasSize.h
    setPos({
      x: Math.max(0, Math.min(maxX, dragStartRef.current.sx + dx)),
      y: Math.max(0, Math.min(maxY, dragStartRef.current.sy + dy)),
    })
  }, [canvasSize, maxX, maxY])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('contract_templates').update({
      signature_x: Math.round(pos.x * 1000) / 1000,
      signature_y: Math.round(pos.y * 1000) / 1000,
    }).eq('id', template.id)
    setSaving(false)
    onSave()
  }

  if (!template.pdf_url) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-body text-[var(--ink-muted)]">Aucun PDF associé à ce contrat. Uploadez un PDF pour positionner la signature.</p>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-body text-[var(--ink-muted)]">
        Glissez le rectangle bleu ou utilisez un raccourci pour positionner la signature.
      </p>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPos({ x: p.x, y: p.y })}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-1.5 font-body text-xs font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPos({ x: template.signature_x ?? 0.7, y: template.signature_y ?? 0.85 })}
          className="rounded-[var(--radius-sm)] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 font-body text-xs font-medium text-[var(--accent)]"
        >
          Personnalisé (drag)
        </button>
      </div>

      {pdfLoading && <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du PDF…</p>}

      <div className="overflow-auto rounded-lg border border-[var(--border)]">
        <canvas
          ref={canvasRef}
          className="block cursor-move touch-none"
          style={{ maxWidth: '100%' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder la position'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
        <span className="text-xs font-body text-[var(--ink-muted)]">
          Position : X={Math.round(pos.x * 100)}% Y={Math.round(pos.y * 100)}%
        </span>
      </div>
    </div>
  )
}

export function Templates() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TemplatesTab>('contracts')
  const checklistActionsRef = useRef<{ openCreate: () => void } | null>(null)

  const closeModal = () => {
    setShowModal(false)
    setName('')
    setFile(null)
    setIsDefault(false)
    setError(null)
  }

  const loadData = async () => {
    setDataLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id) return
      setAgencyId(agency.id)
      const { data } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })
      setTemplates(
        Array.from(
          new Map(((data ?? []) as ContractTemplate[]).map((row) => [row.id, row])).values(),
        ),
      )
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    loadData().then()
  }, [])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non connecté.')

      const agency = await getOrCreateAgency(user.id)
      if (!agency?.id) throw new Error('Aucune agence trouvée.')

      let pdfUrl: string | null = null
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `templates/${agency.id}/${Date.now()}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('contracts')
          .upload(filePath, file, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw new Error(`Upload PDF échoué : ${uploadError.message}`)
        pdfUrl = filePath
      }

      if (isDefault) {
        await supabase.from('contract_templates').update({ is_default: false }).eq('agency_id', agency.id)
      }

      const { error: dbError } = await supabase.from('contract_templates').insert({
        agency_id: agency.id,
        name: name.trim(),
        pdf_url: pdfUrl,
        is_default: isDefault,
      })
      if (dbError) throw dbError

      setAgencyId(agency.id)
      closeModal()
      await loadData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erreur lors de la création')
    } finally {
      setLoading(false)
    }
  }

  const setDefault = async (id: string) => {
    if (!agencyId) return
    await supabase.from('contract_templates').update({ is_default: false }).eq('agency_id', agencyId)
    await supabase.from('contract_templates').update({ is_default: true }).eq('id', id)
    await loadData()
  }

  const removeTemplate = async (template: ContractTemplate) => {
    if (template.is_default) {
      setError('Ce template est défini par défaut. Choisissez un autre template par défaut avant suppression.')
      return
    }
    const confirmed = window.confirm(`Supprimer le contrat "${template.name}" ?`)
    if (!confirmed) return
    setError(null)
    setDeletingTemplateId(template.id)
    const { error: deleteError } = await supabase.from('contract_templates').delete().eq('id', template.id)
    if (deleteError) {
      const message = deleteError.message ?? ''
      if (deleteError.code === '23503' || message.includes('foreign key')) {
        setError('Ce contrat est utilisé dans un ou plusieurs projets.')
      } else {
        setError(message || 'Impossible de supprimer ce contrat.')
      }
      setDeletingTemplateId(null)
      return
    }
    await loadData()
    setDeletingTemplateId(null)
  }

  const isPositioned = (t: ContractTemplate) =>
    Math.abs((t.signature_x ?? 0.7) - 0.7) > 0.001 || Math.abs((t.signature_y ?? 0.85) - 0.85) > 0.001

  const handleChecklistActionsReady = useCallback((actions: { openCreate: () => void }) => {
    checklistActionsRef.current = actions
  }, [])

  return (
    <DashboardLayout
      title="Modèles & signature"
      subtitle="Gérez vos contrats à signer et vos modèles de checklist réutilisables"
      maxWidth="5xl"
    >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TemplatesTabNav activeTab={tab} onTabChange={setTab} />
          {tab === 'contracts' ? (
            <Button className="shrink-0" onClick={() => setShowModal(true)}>
              Ajouter un contrat
            </Button>
          ) : null}
          {tab === 'checklists' ? (
            <Button className="shrink-0" onClick={() => checklistActionsRef.current?.openCreate()}>
              Nouveau modèle
            </Button>
          ) : null}
        </div>

        {tab === 'checklists' ? (
          <ChecklistTemplatesManager
            agencyId={agencyId}
            agencyLoading={dataLoading}
            contractTemplates={templates.map((t) => ({ id: t.id, name: t.name }))}
            onActionsReady={handleChecklistActionsReady}
          />
        ) : null}

        {tab === 'ai-models' ? <AiReferenceModelsManager agencyId={agencyId} /> : null}

        {tab === 'contracts' ? (
        <div className="space-y-4">
        {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}

        <TemplateIntroCard
          title="Contrats à faire signer"
          description="Uploadez vos PDF, positionnez la zone de signature et définissez le contrat utilisé par défaut lors de la création de projets."
          countLabel={`${templates.length} contrat${templates.length !== 1 ? 's' : ''}`}
        />

        {dataLoading ? (
          <TemplatesGridSkeleton />
        ) : templates.length === 0 ? (
          <TemplateEmptyState
            icon="📄"
            title="Aucun contrat"
            description="Ajoutez votre premier PDF pour le faire signer par vos clients lors de l'onboarding."
            action={<Button onClick={() => setShowModal(true)}>Ajouter un contrat</Button>}
          />
        ) : (
          <div className="grid min-w-0 gap-4 [&>*]:min-w-0 md:grid-cols-2">
            {templates.map((template) => (
              <ContractTemplateCard
                key={template.id}
                template={template}
                isPositioned={isPositioned(template)}
                deleting={deletingTemplateId === template.id}
                onOpenPdf={(pdfUrl) => void openContractPdf(pdfUrl)}
                onEditPosition={setEditingTemplate}
                onSetDefault={setDefault}
                onRemove={removeTemplate}
              />
            ))}
          </div>
        )}
        </div>
        ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 px-4 py-6">
          <Card className="w-full max-w-lg">
            <h2 className="font-display text-2xl font-bold text-[var(--ink)]">Ajouter un contrat</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <Input placeholder="Nom du contrat" value={name} onChange={(event) => setName(event.target.value)} required />
              <label className="block text-sm font-body text-[var(--ink-soft)]">
                Fichier PDF (optionnel)
                <input type="file" accept="application/pdf" className="mt-2 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <p className="text-xs font-body text-[var(--ink-muted)]">
                Si vous ajoutez un PDF, il sera affiché au client avant la signature. Sinon, seul le nom du contrat apparaîtra.
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-body text-[var(--ink-soft)]">
                <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
                Définir comme contrat par défaut
              </label>
              {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>{loading ? 'Création…' : 'Créer le contrat'}</Button>
                <Button type="button" variant="secondary" onClick={closeModal}>Annuler</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {editingTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/40 px-4 py-6">
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
            <h2 className="font-display text-2xl font-bold text-[var(--ink)]">
              Position de la signature — {editingTemplate.name}
            </h2>
            <div className="mt-4">
              <PositionEditor
                template={editingTemplate}
                onSave={async () => {
                  await loadData()
                  setEditingTemplate(null)
                }}
                onClose={() => setEditingTemplate(null)}
              />
            </div>
          </Card>
        </div>
      ) : null}
    </DashboardLayout>
  )
}
