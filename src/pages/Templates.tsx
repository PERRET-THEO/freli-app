import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Input } from '../components/ui'
import { supabase } from '../lib/supabase'
import { pdfjs, setupPdfWorker } from '../lib/pdfWorker'

type ContractTemplate = {
  id: string
  name: string
  pdf_url: string | null
  is_default: boolean
  created_at: string
  signature_page: number
  signature_x: number
  signature_y: number
  signature_width: number
  signature_height: number
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
        const res = await fetch(template.pdf_url!)
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
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const closeModal = () => {
    setShowModal(false)
    setName('')
    setFile(null)
    setIsDefault(false)
    setError(null)
  }

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return
    const { data: agency } = await supabase
      .from('agencies')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!agency?.id) return
    setAgencyId(agency.id)
    const { data } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('agency_id', agency.id)
      .order('created_at', { ascending: false })
    setTemplates((data ?? []) as ContractTemplate[])
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

      const { data: agency, error: agencyError } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (agencyError || !agency?.id) throw new Error(agencyError?.message ?? 'Aucune agence trouvée.')

      let pdfUrl: string | null = null
      if (file) {
        await supabase.storage.createBucket('contracts', { public: true })
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `templates/${agency.id}/${Date.now()}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('contracts')
          .upload(filePath, file, { contentType: 'application/pdf', upsert: true })
        if (uploadError) throw new Error(`Upload PDF échoué : ${uploadError.message}`)
        const { data: urlData } = supabase.storage.from('contracts').getPublicUrl(filePath)
        pdfUrl = urlData.publicUrl
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

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link to="/dashboard" className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]">← Dashboard</Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--ink)]">Mes contrats</h1>
            <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">Gérez vos PDF de contrats à faire signer par vos clients</p>
          </div>
          <Button onClick={() => setShowModal(true)}>Ajouter un contrat</Button>
        </div>
        {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}

        {templates.length === 0 ? (
          <Card className="mt-6 text-center">
            <p className="text-sm font-body text-[var(--ink-muted)]">Aucun contrat — Ajoutez votre premier PDF</p>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl font-semibold text-[var(--ink)]">{template.name}</p>
                    <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
                      Créé le {new Date(template.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {template.pdf_url ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
                          📄 PDF chargé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-warm)] px-2.5 py-0.5 text-xs font-body text-[var(--ink-muted)]">
                          Pas de PDF
                        </span>
                      )}
                      {template.pdf_url && (
                        isPositioned(template) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--mint)]">
                            ✍️ Signature positionnée
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--amber)]">
                            ⚠️ Position par défaut
                          </span>
                        )
                      )}
                    </div>
                    {template.pdf_url && (
                      <a href={template.pdf_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-body text-[var(--accent)] underline">
                        Voir le PDF ↗
                      </a>
                    )}
                  </div>
                  {template.is_default ? <Badge variant="in_progress">Par défaut</Badge> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {template.pdf_url && (
                    <Button variant="secondary" onClick={() => setEditingTemplate(template)}>Modifier la position</Button>
                  )}
                  <Button variant="secondary" onClick={() => setDefault(template.id)}>Définir par défaut</Button>
                  <Button variant="secondary" onClick={() => removeTemplate(template)} disabled={deletingTemplateId === template.id}>
                    {deletingTemplateId === template.id ? 'Suppression…' : 'Supprimer'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

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
    </div>
  )
}
