import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { resolveAgencyContractPdfUrl } from '../../lib/contractStorage'
import { pdfjs, setupPdfWorker } from '../../lib/pdfWorker'

const PRESETS = [
  { label: 'Bas gauche', x: 0.05, y: 0.88 },
  { label: 'Bas centre', x: 0.35, y: 0.88 },
  { label: 'Bas droite', x: 0.65, y: 0.88 },
] as const

export type SignaturePosition = {
  signature_page: number
  signature_x: number
  signature_y: number
  signature_width: number
  signature_height: number
}

type PdfSignaturePositionEditorProps = {
  pdfStoragePath: string
  initial: Partial<SignaturePosition>
  onSave: (position: SignaturePosition) => Promise<void>
  saveLabel?: string
  onCancel?: () => void
}

export function PdfSignaturePositionEditor({
  pdfStoragePath,
  initial,
  onSave,
  saveLabel = 'Enregistrer la position et continuer',
  onCancel,
}: PdfSignaturePositionEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [pos, setPos] = useState({
    x: initial.signature_x ?? 0.1,
    y: initial.signature_y ?? 0.78,
  })
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ px: 0, py: 0, sx: 0, sy: 0 })

  const sigWNorm = initial.signature_width ?? 0.35
  const sigHNorm = initial.signature_height ?? 0.09
  const signaturePage = initial.signature_page ?? -1

  const redrawOverlay = useCallback(
    (cx: number, cy: number, cw: number, ch: number) => {
      const canvas = canvasRef.current
      const pageCanvas = pageCanvasRef.current
      if (!canvas || !pageCanvas || !cw) return

      const ctx = canvas.getContext('2d')!
      canvas.width = pageCanvas.width
      canvas.height = pageCanvas.height
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(pageCanvas, 0, 0)

      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      for (let i = 1; i < 4; i++) {
        const gx = (i / 4) * cw
        ctx.beginPath()
        ctx.moveTo(gx, 0)
        ctx.lineTo(gx, ch)
        ctx.stroke()
      }
      for (let i = 1; i < 5; i++) {
        const gy = (i / 5) * ch
        ctx.beginPath()
        ctx.moveTo(0, gy)
        ctx.lineTo(cw, gy)
        ctx.stroke()
      }
      ctx.setLineDash([])

      const rw = sigWNorm * cw
      const rh = sigHNorm * ch
      ctx.fillStyle = 'rgba(91, 110, 245, 0.12)'
      ctx.fillRect(cx, cy, rw, rh)
      ctx.strokeStyle = '#5B6EF5'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(cx, cy, rw, rh)
      ctx.setLineDash([])

      ctx.fillStyle = '#5B6EF5'
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Signature', cx + rw / 2, cy + rh / 2 + 4)
    },
    [sigWNorm, sigHNorm],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    setupPdfWorker()
    let cancelled = false
    const run = async () => {
      setPdfLoading(true)
      setErrorMsg(null)
      try {
        const pdfUrl = await resolveAgencyContractPdfUrl(pdfStoragePath)
        if (!pdfUrl) throw new Error('URL PDF indisponible')
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: buf }).promise
        const pageNum =
          signaturePage === -1 ? pdf.numPages : Math.min(signaturePage + 1, pdf.numPages)
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
      } catch (reason) {
        if (!cancelled) {
          setErrorMsg(reason instanceof Error ? reason.message : 'Chargement PDF impossible.')
        }
      } finally {
        if (!cancelled) setPdfLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pdfStoragePath, signaturePage])

  useEffect(() => {
    if (!canvasSize.w) return
    redrawOverlay(pos.x * canvasSize.w, pos.y * canvasSize.h, canvasSize.w, canvasSize.h)
  }, [pos, canvasSize, redrawOverlay])

  const maxX = 1 - sigWNorm
  const maxY = 1 - sigHNorm

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      draggingRef.current = true
      dragStartRef.current = { px: e.clientX, py: e.clientY, sx: pos.x, sy: pos.y }
    },
    [pos],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current || !canvasSize.w) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const scaleX = canvasSize.w / rect.width
      const scaleY = canvasSize.h / rect.height
      const dx = ((e.clientX - dragStartRef.current.px) * scaleX) / canvasSize.w
      const dy = ((e.clientY - dragStartRef.current.py) * scaleY) / canvasSize.h
      setPos({
        x: Math.max(0, Math.min(maxX, dragStartRef.current.sx + dx)),
        y: Math.max(0, Math.min(maxY, dragStartRef.current.sy + dy)),
      })
    },
    [canvasSize, maxX, maxY],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg(null)
    try {
      await onSave({
        signature_page: signaturePage,
        signature_x: Math.round(pos.x * 1000) / 1000,
        signature_y: Math.round(pos.y * 1000) / 1000,
        signature_width: sigWNorm,
        signature_height: sigHNorm,
      })
    } catch (reason) {
      setErrorMsg(reason instanceof Error ? reason.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-[var(--accent-soft)]/15 p-4">
      <div>
        <p className="font-display text-sm font-semibold text-[var(--ink)]">
          Positionner la signature sur le PDF
        </p>
        <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
          <span className="md:hidden">Choisissez un raccourci, puis affinez si besoin.</span>
          <span className="hidden md:inline">
            Glissez le rectangle bleu ou utilisez un raccourci avant d&apos;envoyer le contrat au
            client.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPos({ x: p.x, y: p.y })}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 font-body text-sm font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {pdfLoading ? <p className="text-sm font-body text-[var(--ink-muted)]">Chargement du PDF…</p> : null}

      <div className="max-h-[min(55dvh,640px)] overflow-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--white)]">
        <canvas
          ref={canvasRef}
          className="block max-w-full cursor-move touch-none"
          style={{ width: '100%', height: 'auto' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {errorMsg ? <p className="text-sm font-body text-[var(--amber)]">{errorMsg}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button onClick={() => void handleSave()} disabled={saving || pdfLoading} className="w-full sm:w-auto">
          {saving ? 'Sauvegarde…' : saveLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            Plus tard
          </Button>
        ) : null}
        <span className="text-xs font-body text-[var(--ink-muted)]">
          Position : X={Math.round(pos.x * 100)}% Y={Math.round(pos.y * 100)}%
        </span>
      </div>
    </div>
  )
}
